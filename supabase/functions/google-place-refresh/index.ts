// Edge Function: /google-place-refresh
// Atualiza o espelho `google_place_snapshot` a partir da Places API (New).
//
// Candidatos: place_id de `location` viva e listada + `prospect_location` publicada e não
// convertida. Refresha os sem snapshot e os com mais de 7 dias (REFRESH_AFTER_DAYS).
//
// Falha da Places API grava `fetch_error` e PRESERVA o snapshot bom: erro de rede não pode
// apagar prova social.
//
// A chave do projeto (VITE_GOOGLE_MAPS_API_KEY) é restrita por referrer e recusa chamada de
// servidor. Aqui usa-se GOOGLE_PLACES_SERVER_KEY, restrita por IP, que nunca vai para o bundle.
//
// Ao mudar algum snapshot, dispara o rebuild do site: o HTML do SSG também é cache do
// conteúdo do Google e precisa respeitar o mesmo limite de 30 dias.
//
// Chamada interna pelo pg_cron (pg_net), header x-google-place-key. verify_jwt = false.
//
// POST /functions/v1/google-place-refresh   (header: x-google-place-key: <GOOGLE_PLACE_REFRESH_KEY>)
// body opcional: { place_id?: string }  → limita a um lugar (útil para rodar na mão)
// → { ok, candidates, refreshed, failed, rebuilt }

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isAuthorized, mapPlaceDetails, selectStale } from "./logic.ts";

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

  const body = (await req.json().catch(() => ({}))) as { place_id?: string };

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
        { headers: { "X-Goog-Api-Key": googleKey, "X-Goog-FieldMask": FIELD_MASK } },
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

  // O HTML do SSG também é cache do conteúdo do Google, então mudou snapshot, rebuilda.
  let rebuilt = false;
  if (refreshed > 0) {
    const { data: setting } = await admin
      .from("app_setting")
      .select("value")
      .eq("key", "google_place_rebuild_hook_url")
      .maybeSingle();
    const hook = (setting?.value as string | null) ?? null;
    if (hook) {
      const r = await fetch(hook, { method: "POST" }).catch(() => null);
      rebuilt = !!r?.ok;
    }
  }

  return json({ ok: true, candidates: candidates.length, refreshed, failed, rebuilt });
});
