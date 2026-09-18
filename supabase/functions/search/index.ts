// Edge Function: /search
// Recebe params de busca e retorna lista enriquecida com preço, distância e amenidades.
// Calcula simulate_price em paralelo pra todos os matches.
//
// POST /functions/v1/search
// {
//   "dest": "GRU",                              // ou
//   "dest_lat": -23.4356, "dest_lng": -46.4731, //
//   "from": "2026-06-10T22:00:00Z",
//   "to":   "2026-06-15T08:00:00Z",
//   "vehicle": "car" | "motorcycle",
//   "category": ["covered","valet"],
//   "operator": ["aerovalet","plenty"],
//   "destinations": ["GRU","CGH"],            // filtro multi-destino (códigos); independe de `dest`
//   "amenities": ["shuttle_free","cameras_24h"],
//   "max_distance_km": 5,
//   "sort": "price_asc" | "price_desc" | "distance_asc",
//   "price_mode": "exact" | "from",           // "from": o preço é a MENOR diária do lote
//   "limit": 20,
//   "offset": 0
// }
//
// `price_mode` existe para a vitrine (home e /destinos), que busca com uma janela fixa e não
// com datas escolhidas pelo cliente. Em "exact" (padrão) o preço é o da janela pedida e quem
// não tem preço nela sai da lista, que é o certo quando as datas são do cliente. Em "from" o
// preço passa a ser a menor diária que o lote pratica (RPC `lowest_daily_rate`), com
// `price.days` = a estadia em que ela vale e `price.showcase` = true, para o card escrever
// "a partir de R$ 24,90 · por diária na estadia de 7 dias".

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callerAuthorization } from "./authHeader.ts";
import { temVolumeParaNota } from "../_shared/reviews.ts";
import {
  availabilityFor,
  buildAvailabilityMap,
  soldOutTiebreak,
  type AvailabilityRow,
} from "./availability.ts";
import { buildHighDemandSet, isHighDemandToday, type HighDemandRow } from "./highDemand.ts";
import {
  batchIds,
  buildShowcaseMap,
  type LowestDailyRow,
  type ShowcasePrice,
} from "./showcasePrice.ts";
import {
  aggregateDestinations,
  aggregateOperators,
  filterByCategory,
  filterByDestinations,
  filterByOperators,
  type FacetItem,
} from "./facets.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SearchParams {
  dest?: string;
  /** Terminal/ponto (destination_point id) — ancora a proximidade no terminal (E2.1.2). */
  point?: string;
  dest_lat?: number;
  dest_lng?: number;
  from: string;
  to: string;
  vehicle?: "car" | "motorcycle";
  category?: string[];
  operator?: string[];
  destinations?: string[];
  amenities?: string[];
  max_distance_km?: number;
  min_rating?: number;
  sort?: "price_asc" | "price_desc" | "distance_asc" | "rating_desc";
  /** "from" (vitrine): o preço é a menor diária do lote, não o da janela pedida. */
  price_mode?: "exact" | "from";
  limit?: number;
  offset?: number;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// @ts-expect-error - Deno global
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // @ts-expect-error - Deno env
  const anonKey: string = Deno.env.get("SUPABASE_ANON_KEY")!;
  // Corre como o usuário quando ele mandou o JWT: é assim que a RLS deixa o testador ver
  // unidade em rascunho (ver authHeader.ts). Anon segue vendo só o listado.
  const supabase = createClient(
    // @ts-expect-error - Deno env
    Deno.env.get("SUPABASE_URL")!,
    anonKey,
    {
      auth: { persistSession: false },
      global: { headers: { Authorization: callerAuthorization(req, anonKey) } },
    },
  );

  let params: SearchParams;
  try {
    params = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  if (!params.from || !params.to) {
    return jsonResponse({ error: "from/to are required" }, 400);
  }
  const checkIn = new Date(params.from);
  const checkOut = new Date(params.to);
  if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) {
    return jsonResponse({ error: "Invalid date format" }, 400);
  }
  if (checkOut <= checkIn) {
    return jsonResponse({ error: "to must be after from" }, 400);
  }

  // 1. Resolve destination coordinates if dest code provided.
  let destLat = params.dest_lat;
  let destLng = params.dest_lng;
  let destInfo: { code: string; name: string } | null = null;
  let destId: string | null = null;
  if (params.dest) {
    const { data: dest } = await supabase
      .from("destination")
      .select("id, code, name, latitude, longitude")
      .eq("code", params.dest)
      .maybeSingle();
    if (dest) {
      if (destLat == null) {
        destLat = Number(dest.latitude);
        destLng = Number(dest.longitude);
      }
      destInfo = { code: dest.code, name: dest.name };
      destId = dest.id as string;
    }
  }

  // 1a. Âncora no terminal (E2.1.2): se um destination_point foi escolhido, a proximidade passa a
  //     ser medida a partir do terminal (não do centro do aeroporto). Só lemos as coords — a
  //     distância continua no PostGIS (ADR-001). O ponto precisa pertencer ao destino resolvido.
  if (params.point && destId) {
    const { data: pt } = await supabase
      .from("destination_point")
      .select("latitude, longitude")
      .eq("id", params.point)
      .eq("destination_id", destId)
      .maybeSingle();
    if (pt) {
      destLat = Number(pt.latitude);
      destLng = Number(pt.longitude);
    }
  }

  // 1b. Proximidade calculada no banco (PostGIS · ADR-001): distância de cada lote ao destino
  //     buscado + terminal mais próximo (DAT-04/DAT-05). O Edge só repassa — nenhum cálculo de
  //     geo aqui no frontend. nearest_terminal vem null se o destino não tem terminais.
  const proximity = new Map<
    string,
    { distance: number | null; nearest_terminal: { name: string; distance_km: number } | null }
  >();
  if (destLat != null && destLng != null) {
    const { data: prox } = await supabase.rpc("locations_proximity", {
      p_lat: destLat,
      p_lng: destLng,
      p_destination_id: destId,
    });
    // deno-lint-ignore no-explicit-any
    for (const p of (prox ?? []) as any[]) {
      proximity.set(p.location_id, {
        distance: p.distance_km != null ? Number(p.distance_km) : null,
        nearest_terminal:
          p.nearest_terminal_name != null
            ? {
                name: p.nearest_terminal_name as string,
                distance_km: Number(p.nearest_terminal_distance_km),
              }
            : null,
      });
    }
  }

  // 2. Calculate days (any_extra policy padrão)
  const totalMinutes = (checkOut.getTime() - checkIn.getTime()) / (60 * 1000);
  const days = Math.max(1, Math.ceil(totalMinutes / (60 * 24)));

  // 3. Query candidates
  let candidateQuery = supabase
    .from("location_parking_type")
    .select(
      `
      id, capacity, is_active,
      location:location!inner(
        id, slug, public_slug, public_name, name, address, latitude, longitude, status, deleted_at, is_listed, is_draft,
        review_avg, review_count, photos, google_place_id, go2park_enabled,
        company:company!inner(id, slug, name, status),
        destination:destination(code, name, type, public_slug),
        amenities:location_amenity(amenity_code)
      ),
      company_parking_type:company_parking_type!inner(
        id, base_price,
        parking_type:parking_type!inner(id, code, name)
      )
    `,
    )
    .eq("is_active", true);

  // Restringe aos lotes ANCORADOS ao destino buscado (DAT-04 · location.destination_id, ligado por
  // PostGIS na ingestão). Sem este filtro, uma busca por destino devolveria TODOS os lotes ativos —
  // a página /destinos/<slug> listaria "tudo" em vez das opções daquele destino. Só filtra quando o
  // code resolveu um destino real; busca por lat/lng avulsa (sem âncora) segue no ranking por distância.
  if (destId != null) {
    candidateQuery = candidateQuery.eq("location.destination_id", destId);
  }

  const { data: rows, error } = await candidateQuery;

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  // 4. Filter — only active locations + active companies
  // deno-lint-ignore no-explicit-any
  let filtered: any[] = (rows ?? []).filter((r: any) => {
    if (!r.location || r.location.deleted_at) return false;
    if (r.location.status !== "active") return false;
    // Só listadas publicamente (gate de recebedor ativo), ou rascunho: se um rascunho chegou até
    // aqui é porque a RLS já decidiu que quem pergunta é testador. Explícito de propósito.
    if (!r.location.is_listed && !r.location.is_draft) return false;
    if (!r.location.company || r.location.company.status !== "active") return false;
    return true;
  });

  // 5. Apply category filter (com equivalências — ver filterByCategory em facets.ts)
  filtered = filterByCategory(filtered, params.category);

  // Estacionamento e destino NÃO são filtrados aqui — viram facetas (passo 10b) e só então
  // recortam o resultado. Manter os candidatos largos até a precificação permite calcular
  // cada faceta considerando os DEMAIS filtros sem colapsar o próprio eixo.

  // 7. Apply amenities filter (must include all)
  if (params.amenities?.length) {
    filtered = filtered.filter((r) => {
      const codes = new Set(
        // deno-lint-ignore no-explicit-any
        (r.location.amenities ?? []).map((a: any) => a.amenity_code),
      );
      return params.amenities!.every((c) => codes.has(c));
    });
  }

  // 8. Distância (calculada no banco, PostGIS) + filtro por max_distance_km
  const withDistance = filtered.map((r) => ({
    ...r,
    _distance: proximity.get(r.location.id)?.distance ?? null,
  }));

  let distanceFiltered = withDistance;
  if (params.max_distance_km != null && destLat != null) {
    distanceFiltered = distanceFiltered.filter(
      (r) => r._distance != null && r._distance <= params.max_distance_km!,
    );
  }
  if (params.min_rating != null) {
    // Nota sem volume não filtra: sem o piso, um lote com uma avaliação 5,0 passava em
    // `min_rating=4.5` e ficava lado a lado de quem tem trezentas. Ver _shared/reviews.ts.
    distanceFiltered = distanceFiltered.filter(
      (r) =>
        r.location.review_avg != null &&
        temVolumeParaNota(r.location.review_count) &&
        Number(r.location.review_avg) >= params.min_rating!,
    );
  }

  // 8b. Disponibilidade em lote (1 query, sem N+1) para o período pedido
  const lptIds = distanceFiltered.map((r) => r.id as string);
  let availMap = buildAvailabilityMap(null);
  if (lptIds.length > 0) {
    const { data: availRows } = await supabase.rpc("availability_batch", {
      p_lpt_ids: lptIds,
      p_check_in_at: params.from,
      p_check_out_at: params.to,
    });
    availMap = buildAvailabilityMap((availRows ?? null) as AvailabilityRow[] | null);
  }

  // 9. Preço. São duas perguntas diferentes, e cada modo faz a sua.
  //
  // "exact" (/search): quanto custa a estadia que o cliente escolheu. Uma simulação por lote,
  // na janela pedida, e quem não tem preço nela sai da lista.
  //
  // "from" (vitrine: home e /destinos): qual é o melhor preço deste lote. A janela ali é nossa
  // e é sempre a mais curta, então precificar por ela mostrava justamente o número mais caro
  // de cada unidade (o Virapark saía por R$ 40,00 numa tabela que cai para R$ 24,90 a diária em
  // estadia de 7 dias). A RPC `lowest_daily_rate` devolve a MENOR diária de cada lote e a
  // duração em que ela vale, numa chamada só para a página inteira. De quebra resolve o que o
  // resgate por estadia mínima resolvia: a menor estadia vendável é uma das durações simuladas,
  // então Abbapark e Nationpark (3 diárias) continuam na lista do CWB, e pelo melhor preço.
  // deno-lint-ignore no-explicit-any
  let priced: any[];

  if (params.price_mode === "from") {
    const showcase = new Map<string, ShowcasePrice>();
    const lotes = batchIds(distanceFiltered.map((r) => r.id as string));
    const respostas = await Promise.all(
      lotes.map(async (ids) => {
        const { data, error } = await supabase.rpc("lowest_daily_rate", { p_lpt_ids: ids });
        if (error) return null;
        return (data ?? null) as LowestDailyRow[] | null;
      }),
    );
    for (const rows of respostas) {
      for (const [id, preco] of buildShowcaseMap(rows)) showcase.set(id, preco);
    }
    priced = distanceFiltered.map((r) => {
      const p = showcase.get(r.id as string) ?? null;
      return {
        ...r,
        _price: p?.total ?? null,
        _old_price: p?.oldTotal ?? null,
        _price_error: null,
        _days: p?.days ?? days,
        _min_stay_days: p?.minStayDays ?? null,
        _showcase: p != null,
      };
    });
  } else {
    priced = await Promise.all(
      distanceFiltered.map(async (r) => {
        const { data: sim, error: simErr } = await supabase.rpc("simulate_price", {
          p_company: r.location.company.slug,
          p_location: r.location.slug,
          p_parking_type: r.company_parking_type.parking_type.code,
          p_days: days,
        });
        if (simErr) {
          return { ...r, _price: null, _old_price: null, _price_error: simErr.message };
        }
        // deno-lint-ignore no-explicit-any
        const s = sim as any;
        return {
          ...r,
          _price: s?.price != null ? Number(s.price) : null,
          _old_price: s?.old_price != null ? Number(s.old_price) : null,
          _price_error: s?.error ?? null,
          _days: days,
          _min_stay_days: null as number | null,
          _showcase: false,
        };
      }),
    );
  }

  // 10. Drop unpriceable results — conjunto base das facetas (sem filtro de estacionamento/destino)
  // deno-lint-ignore no-explicit-any
  const priceable: Array<any & FacetItem> = priced
    .filter((r) => r._price != null)
    .map((r) => ({
      ...r,
      operator: { slug: r.location.company.slug, name: r.location.company.name },
      destination: r.location.destination
        ? {
            code: r.location.destination.code,
            name: r.location.destination.name,
            type: r.location.destination.type,
          }
        : null,
    }));

  // 10b. Facetas — cada eixo considera os DEMAIS filtros, mas não a si mesmo (não colapsa
  // ao selecionar). A faceta de estacionamento reflete a estacionamento que de fato tem lote aqui
  // (corrige o filtro que antes listava todas as empresas globalmente).
  const operatorFacet = aggregateOperators(filterByDestinations(priceable, params.destinations));
  const destinationFacet = aggregateDestinations(filterByOperators(priceable, params.operator));

  // 10c. Resultado final — aplica os dois filtros escolhidos.
  const withPrice = filterByOperators(
    filterByDestinations(priceable, params.destinations),
    params.operator,
  );

  // 11. Sort — esgotados sempre por último, depois o critério escolhido
  const sort = params.sort ?? "price_asc";
  withPrice.sort((a, b) => {
    const soldOut = soldOutTiebreak(availabilityFor(availMap, a.id), availabilityFor(availMap, b.id));
    if (soldOut !== 0) return soldOut;
    // Ordena por diária, não pelo total: no modo "from" a lista mistura durações (um lote de
    // 3 diárias ao lado de um de 2), e comparar totais poria o mais barato por dia embaixo.
    // Com duração igual em todos, que é o caso da /search, a ordem é a mesma de sempre.
    const ap = a._price != null ? a._price / (a._days ?? days) : null;
    const bp = b._price != null ? b._price / (b._days ?? days) : null;
    if (sort === "price_asc") return (ap ?? Infinity) - (bp ?? Infinity);
    if (sort === "price_desc") return (bp ?? -Infinity) - (ap ?? -Infinity);
    if (sort === "rating_desc") {
      // Só nota com volume ordena, e o desempate é a contagem: um 5,0 de uma avaliação
      // ficava acima de um 4,9 de trezentas, que é ranking premiando quem mal foi avaliado.
      const an = temVolumeParaNota(a.location.review_count) ? Number(a.location.review_avg) || 0 : 0;
      const bn = temVolumeParaNota(b.location.review_count) ? Number(b.location.review_avg) || 0 : 0;
      if (bn !== an) return bn - an;
      return (b.location.review_count ?? 0) - (a.location.review_count ?? 0);
    }
    if (sort === "distance_asc") {
      const ad = a._distance ?? Infinity;
      const bd = b._distance ?? Infinity;
      return ad - bd;
    }
    return 0;
  });

  // 12. Paginate
  const limit = Math.min(params.limit ?? 20, 50);
  const offset = params.offset ?? 0;
  const total = withPrice.length;
  const page = withPrice.slice(offset, offset + limit);

  // 12b. Sinal de demanda honesto (E3.6, recorte "N reservaram hoje") — só pras locations
  // da página atual. Nunca expõe a contagem (mesmo princípio de `popular_locations`): o RPC
  // devolve apenas os location_id que cruzaram o limiar, aqui virando um Set de presença.
  const pageLocationIds = Array.from(new Set(page.map((r) => r.location.id as string)));
  let highDemandSet = buildHighDemandSet(null);
  if (pageLocationIds.length > 0) {
    const { data: demandRows } = await supabase.rpc("locations_high_demand_today", {
      p_location_ids: pageLocationIds,
    });
    highDemandSet = buildHighDemandSet((demandRows ?? null) as HighDemandRow[] | null);
  }

  // 12c. Nota do Google como prova social do card. NÃO entra em sort=rating_desc nem em
  // min_rating: ranking e curadoria continuam rodando só sobre a avaliação Movepark.
  const placeIds = Array.from(
    new Set(
      page
        .map((r) => r.location.google_place_id as string | null)
        .filter((id): id is string => !!id),
    ),
  );
  const snapshots = new Map<string, { rating: number | null; count: number }>();
  if (placeIds.length > 0) {
    // Filtro explícito e redundante à RLS de leitura (is_hidden/TTL de 30 dias), que já se
    // aplica aqui porque esta edge lê com a anon key. Mantido de propósito: se um dia o
    // client trocar para service role, o corte não depende só da policy pra continuar valendo.
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: snaps } = await supabase
      .from("google_place_snapshot")
      .select("place_id, rating, user_rating_count")
      .in("place_id", placeIds)
      .eq("is_hidden", false)
      .gt("fetched_at", cutoff);
    // deno-lint-ignore no-explicit-any
    for (const s of (snaps ?? []) as any[]) {
      snapshots.set(s.place_id, {
        rating: s.rating != null ? Number(s.rating) : null,
        count: s.user_rating_count ?? 0,
      });
    }
  }

  // 13. Map to response shape
  const results = page.map((r) => ({
    id: r.id,
    operator: {
      slug: r.location.company.slug,
      name: r.location.company.name,
    },
    location: {
      id: r.location.id,
      slug: r.location.slug,
      // O caminho da ficha vai pronto: o card não monta URL, e a gramática de
      // `/estacionamentos/<destino>/<lote>` vive num lugar só.
      public_path:
        r.location.destination?.public_slug && r.location.public_slug
          ? `/estacionamentos/${r.location.destination.public_slug}/${r.location.public_slug}`
          : null,
      // O nome canônico da ficha, o mesmo do H1 e do card em toda superfície.
      public_name: r.location.public_name ?? null,
      name: r.location.name,
      address: r.location.address,
      latitude: r.location.latitude != null ? Number(r.location.latitude) : null,
      longitude: r.location.longitude != null ? Number(r.location.longitude) : null,
      distance_km: r._distance != null ? Number(r._distance.toFixed(2)) : null,
      // Terminal mais próximo do destino buscado (PRD-09 · DAT-05), calculado no banco (PostGIS).
      // null se o destino não tem terminais ou o lote não tem geo — aí vale a proximidade ao centro.
      nearest_terminal: proximity.get(r.location.id)?.nearest_terminal ?? null,
      review_avg: r.location.review_avg != null ? Number(r.location.review_avg) : null,
      review_count: r.location.review_count ?? 0,
      // Prova social complementar (avaliacoes-google.md §4/§6): só preenche o selo do card
      // quando não há avaliação Movepark (ver pickCardBadge). NÃO alimenta ranking/curadoria.
      google_rating: snapshots.get(r.location.google_place_id ?? "")?.rating ?? null,
      google_rating_count: snapshots.get(r.location.google_place_id ?? "")?.count ?? 0,
      // Capa = 1ª foto da galeria (location.photos). null → o card usa o placeholder.
      cover_image:
        Array.isArray(r.location.photos) && r.location.photos.length > 0
          ? (r.location.photos[0] as string)
          : null,
      // Sinal de demanda honesto — nunca um número, só presença (E3.6).
      high_demand_today: isHighDemandToday(highDemandSet, r.location.id as string),
      // Transfer com rastreio ao vivo (Go2Park). Fato da unidade, não promessa de transação
      // (ADR-009): vale inclusive nas unidades de checkout externo, que são as três que o têm.
      go2park: r.location.go2park_enabled === true,
      // Rascunho: só chega para testador; o card e a ficha mostram o selo para não confundir
      // com unidade publicada.
      is_draft: r.location.is_draft === true,
    },
    parking_type: {
      code: r.company_parking_type.parking_type.code,
      name: r.company_parking_type.parking_type.name,
    },
    capacity: r.capacity,
    availability: availabilityFor(availMap, r.id),
    price: {
      total: r._price,
      old_price: r._old_price,
      // `_days` é a duração de fato precificada: a janela pedida no modo "exact", a estadia em
      // que a diária é mais barata no modo "from". Dividir pela janela daria um "por dia" que
      // não corresponde ao total mostrado.
      per_day: r._price != null ? Number((r._price / (r._days ?? days)).toFixed(2)) : null,
      days: r._days ?? days,
      // O card só escreve "a partir de" quando o preço é o de vitrine.
      showcase: r._showcase === true,
    },
    /** Estadia mínima do lote, quando ele exige mais de uma diária. */
    min_stay_days: r._min_stay_days ?? null,
    // deno-lint-ignore no-explicit-any
    amenities: (r.location.amenities ?? []).map((a: any) => a.amenity_code),
  }));

  return jsonResponse({
    destination: destInfo
      ? { ...destInfo, latitude: destLat, longitude: destLng }
      : destLat != null
        ? { latitude: destLat, longitude: destLng }
        : null,
    days,
    total,
    limit,
    offset,
    results,
    facets: {
      operators: operatorFacet,
      destinations: destinationFacet,
    },
  });
});
