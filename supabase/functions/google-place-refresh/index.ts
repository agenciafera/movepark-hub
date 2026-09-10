// Edge Function: /google-place-refresh
// Atualiza o espelho `google_place_snapshot` a partir da Places API (New).
//
// Candidatos: place_id de `location` viva e listada + `prospect_location` publicada e não
// convertida. Refresha os sem snapshot e os com mais de 7 dias (REFRESH_AFTER_DAYS).
//
// Falha da Places API grava `fetch_error` e PRESERVA o snapshot bom: erro de rede não pode
// apagar prova social.
//
// GOOGLE_PLACES_SERVER_KEY pode ser uma chave de servidor propria OU a chave do projeto
// (VITE_GOOGLE_MAPS_API_KEY), que e restrita por referrer: por isso a chamada manda o header
// Referer do dominio, que satisfaz a restricao tambem em chamada de servidor. Segredo fica
// nos secrets da Edge, nunca no bundle nem no SQL.
//
// Ao mudar algum snapshot, dispara o rebuild do site: o HTML do SSG também é cache do
// conteúdo do Google e precisa respeitar o mesmo limite de 30 dias.
//
// Chamada interna pelo pg_cron (pg_net), header x-google-place-key. verify_jwt = false.
//
// POST /functions/v1/google-place-refresh   (header: x-google-place-key: <GOOGLE_PLACE_REFRESH_KEY>)
// body opcional: { place_id?: string }  → limita a um lugar (útil para rodar na mão)
//                 { skip_lookup?: true } → pula a resolução e só refresha quem já tem place_id
// → { ok, candidates, refreshed, failed, resolved, unresolved, enqueued }
//
// Antes do refresh, resolve o place_id das fichas que ainda não têm: sem a chave elas nunca
// entram no cron e ficam sem selo para sempre. Critérios de aceite e histórico da rodada
// manual em docs/specs/place-id-lote-mapeado.md.

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  isAuthorized,
  mapPlaceDetails,
  type PlaceCandidate,
  pickPlaceMatch,
  RETRY_LOOKUP_AFTER_DAYS,
  SEARCH_BIAS_RADIUS_M,
  selectStale,
} from "./logic.ts";
import { siteUrl } from "../_shared/site.ts";

// `reviews` traz o objeto Review inteiro, e é dele que sai o `originalText` (o texto na
// língua em que o autor escreveu), que é o que o espelho guarda: a chamada manda
// `languageCode=pt-BR`, então o campo `text` volta traduzido por máquina e publicá-lo como
// palavra do autor quebra a regra de atribuição (§11 da spec).
//
// Não dá para pedir `reviews.originalText` sozinho: field mask não atravessa campo repetido,
// e um caminho com sub-campo depois de `reviews` é recusado com 400. Pedir `reviews` é o
// jeito de ter o original, e a preferência entre os dois textos fica no `mapPlaceDetails`.
const FIELD_MASK = "id,rating,userRatingCount,googleMapsUri,reviews";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// @ts-expect-error - Deno global
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // @ts-expect-error - Deno env
  const expected = Deno.env.get("GOOGLE_PLACE_REFRESH_KEY");
  if (!isAuthorized(req.headers.get("x-google-place-key"), expected)) {
    return json({ error: "unauthorized" }, 401);
  }

  // @ts-expect-error - Deno env
  const googleKey = Deno.env.get("GOOGLE_PLACES_SERVER_KEY");
  if (!googleKey) return json({ error: "GOOGLE_PLACES_SERVER_KEY ausente" }, 500);

  const admin = createClient(
    // @ts-expect-error - Deno env
    Deno.env.get("SUPABASE_URL")!,
    // @ts-expect-error - Deno env
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const body = (await req.json().catch(() => ({}))) as {
    place_id?: string;
    skip_lookup?: boolean;
  };

  // Resolve antes de refreshar: quem ganha place_id agora já entra como candidato na mesma passada.
  const lookup = { resolved: 0, unresolved: 0 };
  if (!body.place_id && !body.skip_lookup) {
    Object.assign(lookup, await resolverPlaceIds(admin, googleKey));
  }

  const [locs, prospects, snaps] = await Promise.all([
    admin
      .from("location")
      .select("google_place_id")
      .not("google_place_id", "is", null)
      .is("deleted_at", null)
      .eq("is_listed", true),
    admin
      .from("prospect_location")
      .select("google_place_id")
      .not("google_place_id", "is", null)
      .eq("is_published", true)
      .is("converted_at", null),
    admin.from("google_place_snapshot").select("place_id, fetched_at"),
  ]);
  if (locs.error) return json({ error: locs.error.message }, 500);
  if (prospects.error) return json({ error: prospects.error.message }, 500);
  if (snaps.error) return json({ error: snaps.error.message }, 500);

  const all = [
    ...new Set([
      ...(locs.data ?? []).map((r: { google_place_id: string }) => r.google_place_id),
      ...(prospects.data ?? []).map((r: { google_place_id: string }) => r.google_place_id),
    ]),
  ];
  const candidates = body.place_id
    ? all.filter((id) => id === body.place_id)
    : selectStale(all, snaps.data ?? [], new Date());

  let refreshed = 0;
  let failed = 0;

  for (const placeId of candidates) {
    try {
      const res = await fetch(
        `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}` +
          `?languageCode=pt-BR&regionCode=BR`,
        {
          headers: {
            "X-Goog-Api-Key": googleKey,
            "X-Goog-FieldMask": FIELD_MASK,
            // Satisfaz a restricao por referrer quando a chave usada e a do projeto.
            // O host vem de _shared/site.ts: escrito a mao aqui, ficou preso no
            // hub.movepark.co depois do cutover (o contract test pegou).
            Referer: `${siteUrl()}/`,
          },
        },
      );
      if (!res.ok) throw new Error(`Places ${res.status}: ${await res.text()}`);
      const mapped = mapPlaceDetails(await res.json());
      const { error } = await admin.from("google_place_snapshot").upsert(
        {
          place_id: placeId,
          rating: mapped.rating,
          user_rating_count: mapped.user_rating_count,
          maps_uri: mapped.maps_uri,
          reviews: mapped.reviews,
          fetched_at: new Date().toISOString(),
          fetch_error: null,
        },
        { onConflict: "place_id" },
      );
      if (error) throw new Error(error.message);
      refreshed++;
    } catch (e) {
      failed++;
      const message = e instanceof Error ? e.message : String(e);
      // Sem snapshot prévio o update abaixo não casa nenhuma linha (é update, não upsert, de
      // propósito: um lugar sem linha segue candidato e tenta de novo na próxima passada em vez
      // de nascer "fresco" com fetch_error). Nesse caso a falha ficaria só no contador efêmero
      // da resposta, então loga para aparecer nos logs da Edge também.
      console.error(`google-place-refresh: falha ao buscar place_id=${placeId}: ${message}`);
      // Preserva o snapshot bom: só carimba o erro, sem tocar em rating/reviews.
      await admin
        .from("google_place_snapshot")
        .update({ fetch_error: message })
        .eq("place_id", placeId);
    }
  }

  // O HTML do SSG também é cache do conteúdo do Google, então mudou snapshot, precisa republicar.
  //
  // Enfileira em vez de chamar o Deploy Hook direto. A publicação automática do site já tem fila,
  // debounce e alarme (docs/specs/deploy-automatico.md), e manter um segundo caminho para o mesmo
  // hook significava a URL guardada em dois lugares, duas rotações e duas formas de ficar meio
  // configurado. Aqui o refresh só declara que mudou conteúdo; quem decide quando publicar é o
  // `site_rebuild_decision`.
  let enqueued = false;
  if (refreshed > 0) {
    const { error } = await admin
      .from("site_rebuild_request")
      .insert({ source_table: "google_place_snapshot", op: "UPDATE" });
    if (error) {
      console.error(`google-place-refresh: falha ao enfileirar rebuild: ${error.message}`);
    }
    enqueued = !error;
  }

  return json({
    ok: true,
    candidates: candidates.length,
    refreshed,
    failed,
    resolved: lookup.resolved,
    unresolved: lookup.unresolved,
    enqueued,
  });
});

type Alvo = {
  tabela: "location" | "prospect_location";
  id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
};

/**
 * Preenche `google_place_id` das fichas vivas que estão sem ele, por Text Search.
 *
 * Toda tentativa carimba `google_place_lookup_at`, inclusive a que não casa. Sem esse carimbo
 * as fichas sem match (eram 10 na rodada manual) voltariam a ser consultadas toda semana, para
 * sempre, pagando Places API por uma resposta que já se sabe qual é.
 *
 * Quando o match é aceito, o endereço do Google substitui o nosso, porque o nosso já veio errado
 * antes (Talentos Park). O **nome não**: o Google devolve "Fulano Park - Estacionamento
 * Aeroporto", que polui a listagem, e nome é decisão editorial.
 */
async function resolverPlaceIds(
  // deno-lint-ignore no-explicit-any
  admin: any,
  googleKey: string,
): Promise<{ resolved: number; unresolved: number }> {
  const corte = new Date(
    Date.now() - RETRY_LOOKUP_AFTER_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const semTentativa = `google_place_lookup_at.is.null,google_place_lookup_at.lt.${corte}`;

  const [locs, prospects, usadosLoc, usadosProsp] = await Promise.all([
    admin
      .from("location")
      .select("id, name, address, latitude, longitude, company:company_id(name)")
      .is("google_place_id", null)
      .is("deleted_at", null)
      .eq("is_listed", true)
      .or(semTentativa),
    admin
      .from("prospect_location")
      .select("id, name, address, latitude, longitude")
      .is("google_place_id", null)
      .eq("is_published", true)
      .is("converted_at", null)
      .or(semTentativa),
    // Guarda do D-009: place_id preso a qualquer ficha, publicada ou não, não pode ser
    // reaproveitado. MultiPark e Bandeira Park têm coordenada idêntica e IDs distintos.
    admin.from("location").select("google_place_id").not("google_place_id", "is", null),
    admin.from("prospect_location").select("google_place_id").not("google_place_id", "is", null),
  ]);

  const emUso = new Set<string>(
    [...(usadosLoc.data ?? []), ...(usadosProsp.data ?? [])].map(
      (x: { google_place_id: string }) => x.google_place_id,
    ),
  );

  const alvos: Alvo[] = [
    // A unidade parceira se chama "Aeroporto de Guarulhos" no catálogo, ou seja, o único token
    // que sobra depois de tirar as palavras genéricas é a cidade, que casa com qualquer pátio
    // da praça. A marca vem da empresa (Aeropark, Plenty Park, Garageinn), e é ela que
    // distingue. Sem isso o match dependeria só da distância.
    ...((locs.data ?? []) as (Omit<Alvo, "tabela" | "name"> & {
      name: string;
      company: { name: string } | null;
    })[]).map((r) => ({
      ...r,
      name: [r.company?.name, r.name].filter(Boolean).join(" "),
      tabela: "location" as const,
    })),
    ...((prospects.data ?? []) as Omit<Alvo, "tabela">[]).map((r) => ({
      ...r,
      tabela: "prospect_location" as const,
    })),
  ];

  let resolved = 0;
  let unresolved = 0;

  for (const alvo of alvos) {
    const carimbo = { google_place_lookup_at: new Date().toISOString() };
    try {
      if (alvo.latitude === null || alvo.longitude === null) {
        // Sem coordenada não há locationBias nem critério de distância: reprova sem gastar chamada.
        throw new Error("ficha sem coordenada");
      }
      const achados = await buscarPorTexto(googleKey, alvo);
      const escolhido = pickPlaceMatch(
        { name: alvo.name, latitude: alvo.latitude, longitude: alvo.longitude },
        achados,
        emUso,
      );
      if (!escolhido) {
        unresolved++;
        await admin.from(alvo.tabela).update(carimbo).eq("id", alvo.id);
        console.log(
          `google-place-refresh: sem match para ${alvo.tabela}/${alvo.id} (${alvo.name})`,
        );
        continue;
      }
      emUso.add(escolhido.id);
      const patch: Record<string, unknown> = { ...carimbo, google_place_id: escolhido.id };
      if (escolhido.formattedAddress) patch.address = escolhido.formattedAddress;
      const { error } = await admin.from(alvo.tabela).update(patch).eq("id", alvo.id);
      if (error) throw new Error(error.message);
      resolved++;
      console.log(
        `google-place-refresh: ${alvo.tabela}/${alvo.id} (${alvo.name}) -> ${escolhido.id}`,
      );
    } catch (e) {
      unresolved++;
      const message = e instanceof Error ? e.message : String(e);
      console.error(
        `google-place-refresh: lookup falhou em ${alvo.tabela}/${alvo.id}: ${message}`,
      );
      await admin.from(alvo.tabela).update(carimbo).eq("id", alvo.id);
    }
  }

  return { resolved, unresolved };
}

/** Text Search da Places API (New), com viés na coordenada que já temos. */
async function buscarPorTexto(googleKey: string, alvo: Alvo): Promise<PlaceCandidate[]> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": googleKey,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location," +
        "places.businessStatus,places.primaryType",
      Referer: `${siteUrl()}/`,
    },
    body: JSON.stringify({
      textQuery: [alvo.name, alvo.address].filter(Boolean).join(", "),
      languageCode: "pt-BR",
      regionCode: "BR",
      maxResultCount: 3,
      locationBias: {
        circle: {
          center: { latitude: alvo.latitude, longitude: alvo.longitude },
          radius: SEARCH_BIAS_RADIUS_M,
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`searchText ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as {
    places?: {
      id?: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      businessStatus?: string;
      primaryType?: string;
      location?: { latitude?: number; longitude?: number };
    }[];
  };
  return (data.places ?? []).map((p) => ({
    id: p.id ?? "",
    displayName: p.displayName?.text ?? "",
    formattedAddress: p.formattedAddress ?? null,
    businessStatus: p.businessStatus ?? null,
    primaryType: p.primaryType ?? null,
    latitude: p.location?.latitude ?? null,
    longitude: p.location?.longitude ?? null,
  }));
}
