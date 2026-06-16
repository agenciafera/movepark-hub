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
//   "limit": 20,
//   "offset": 0
// }

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  availabilityFor,
  buildAvailabilityMap,
  soldOutTiebreak,
  type AvailabilityRow,
} from "./availability.ts";
import {
  aggregateDestinations,
  aggregateOperators,
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

  const supabase = createClient(
    // @ts-expect-error - Deno env
    Deno.env.get("SUPABASE_URL")!,
    // @ts-expect-error - Deno env
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { auth: { persistSession: false } },
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
        id, slug, name, address, latitude, longitude, status, deleted_at,
        review_avg, review_count,
        company:company!inner(id, slug, name, status),
        destination:destination(code, name, type),
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
    if (!r.location.company || r.location.company.status !== "active") return false;
    return true;
  });

  // 5. Apply category filter
  if (params.category?.length) {
    filtered = filtered.filter((r) =>
      params.category!.includes(r.company_parking_type.parking_type.code),
    );
  }

  // Operadora e destino NÃO são filtrados aqui — viram facetas (passo 10b) e só então
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
    distanceFiltered = distanceFiltered.filter(
      (r) => r.location.review_avg != null && Number(r.location.review_avg) >= params.min_rating!,
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

  // 9. Run simulate_price in parallel
  const priced = await Promise.all(
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
      };
    }),
  );

  // 10. Drop unpriceable results — conjunto base das facetas (sem filtro de operadora/destino)
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
  // ao selecionar). A faceta de operadora reflete a operadora que de fato tem lote aqui
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
    if (sort === "price_asc") return (a._price ?? Infinity) - (b._price ?? Infinity);
    if (sort === "price_desc") return (b._price ?? -Infinity) - (a._price ?? -Infinity);
    if (sort === "rating_desc") {
      return (Number(b.location.review_avg) || 0) - (Number(a.location.review_avg) || 0);
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
      per_day: r._price != null ? Number((r._price / days).toFixed(2)) : null,
      days,
    },
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
