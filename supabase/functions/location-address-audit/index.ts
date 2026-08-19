// Edge Function: /location-address-audit
// Camada 2 da auditoria de endereço das unidades: confere no Google o que o banco afirma.
// Spec: docs/specs/auditoria-enderecos.md
//
// Fluxo de uma passada:
//   1. roda a triagem local (RPC location_address_scan) - custo zero, pega o que dá para ver
//      só olhando o banco;
//   2. pega a fila (RPC location_address_audit_queue): nunca verificadas ou vencidas;
//   3. para cada unidade, resolve o lugar no Google. Com google_place_id de estabelecimento,
//      vai direto no Place Details; sem ele, faz searchText de "nome, endereço" com viés na
//      coordenada atual;
//   4. grava o veredito pela RPC location_address_audit_record, que é quem mede a distância
//      entre os dois pinos (PostGIS, ADR-001) e classifica ok/divergente.
//
// A função NUNCA escreve em `location`. Ela propõe; quem corrige é hub_admin pela tela do
// Manager (RPC manager_location_address_apply). O E0.17-i já mostrou o custo de aceitar match
// automático: publicar o nome de um lugar com o pino de outro.
//
// Credencial: GOOGLE_PLACES_SERVER_KEY (restrita por IP, nunca vai para o bundle). É a mesma
// chave da Edge google-place-refresh. A chave pública do front (VITE_GOOGLE_MAPS_API_KEY) é
// restrita por referrer e recusa chamada de servidor com
// API_KEY_HTTP_REFERRER_BLOCKED, o que está correto e não deve ser afrouxado.
//
// Autorização: header x-location-audit-key (cron, via pg_net + vault) OU Bearer JWT de
// hub_admin (botão "Verificar no Google" do Manager). verify_jwt = false.
//
// POST /functions/v1/location-address-audit
// body opcional: { location_id?: string, limit?: number }
// -> { ok, scanned, checked, ok_count, divergent, no_match, failed }

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildTextQuery,
  isAuthorized,
  isEstablishmentPlaceId,
  pickMatch,
  type MatchPolicy,
  type PlaceCandidate,
} from "./logic.ts";

const SEARCH_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.businessStatus",
  "places.primaryType",
  "places.types",
  "places.googleMapsUri",
].join(",");

const DETAILS_FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "businessStatus",
  "primaryType",
  "types",
  "googleMapsUri",
].join(",");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type QueueRow = {
  location_id: string;
  location_name: string;
  address: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  google_place_id: string | null;
  destination_code: string | null;
};

function num(v: number | string | null): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

// @ts-expect-error - Deno global
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // @ts-expect-error - Deno env
  const expectedKey = Deno.env.get("LOCATION_AUDIT_KEY");
  const serviceKeyOk = isAuthorized(req.headers.get("x-location-audit-key"), expectedKey);

  const admin = createClient(
    // @ts-expect-error - Deno env
    Deno.env.get("SUPABASE_URL")!,
    // @ts-expect-error - Deno env
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Sem a chave de serviço, o caminho é o JWT de hub_admin: é o botão do Manager. A checagem
  // do papel usa o próprio banco (is_hub_admin), e não uma claim do token, para não existir
  // uma segunda definição de quem é admin.
  if (!serviceKeyOk) {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
    const userClient = createClient(
      // @ts-expect-error - Deno env
      Deno.env.get("SUPABASE_URL")!,
      // @ts-expect-error - Deno env
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { auth: { persistSession: false }, global: { headers: { Authorization: authHeader } } },
    );
    const { data: isAdmin, error } = await userClient.rpc("is_hub_admin");
    if (error || isAdmin !== true) return json({ error: "unauthorized" }, 401);
  }

  // @ts-expect-error - Deno env
  const googleKey = Deno.env.get("GOOGLE_PLACES_SERVER_KEY");
  if (!googleKey) {
    return json(
      {
        error: "GOOGLE_PLACES_SERVER_KEY ausente",
        hint: "Chave de servidor da Places API (restrita por IP). Ver docs/specs/auditoria-enderecos.md.",
      },
      500,
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    location_id?: string;
    limit?: number;
  };

  // Triagem local primeiro: barata, e deixa as flags frescas mesmo se o Google falhar depois.
  const { data: scanned } = await admin.rpc("location_address_scan");

  const { data: policyRaw } = await admin.rpc("location_address_audit_policy");
  const policy = (policyRaw ?? {}) as Partial<MatchPolicy>;
  const matchPolicy: MatchPolicy = {
    name_similarity_strong: policy.name_similarity_strong ?? 0.85,
    name_similarity_weak: policy.name_similarity_weak ?? 0.6,
    max_km_strong: policy.max_km_strong ?? 15,
    max_km_weak: policy.max_km_weak ?? 3,
  };

  const { data: queue, error: queueError } = await admin.rpc("location_address_audit_queue", {
    p_limit: body.limit ?? 50,
  });
  if (queueError) return json({ error: queueError.message }, 500);

  const rows = ((queue ?? []) as QueueRow[]).filter(
    (r) => !body.location_id || r.location_id === body.location_id,
  );

  let okCount = 0;
  let divergent = 0;
  let noMatch = 0;
  let failed = 0;

  for (const row of rows) {
    const lat = num(row.latitude);
    const lng = num(row.longitude);

    try {
      let candidates: PlaceCandidate[] = [];

      if (isEstablishmentPlaceId(row.google_place_id)) {
        const res = await fetch(
          `https://places.googleapis.com/v1/places/${encodeURIComponent(row.google_place_id!)}` +
            `?languageCode=pt-BR&regionCode=BR`,
          { headers: { "X-Goog-Api-Key": googleKey, "X-Goog-FieldMask": DETAILS_FIELD_MASK } },
        );
        if (!res.ok) throw new Error(`Places details ${res.status}: ${await res.text()}`);
        candidates = [(await res.json()) as PlaceCandidate];
      } else {
        const payload: Record<string, unknown> = {
          textQuery: buildTextQuery(row.location_name, row.address),
          languageCode: "pt-BR",
          regionCode: "BR",
          maxResultCount: 5,
        };
        // Viés na coordenada atual quando ela existe. Raio generoso de propósito: se o pino
        // está errado, um raio apertado esconderia justamente o lugar certo.
        if (lat !== null && lng !== null) {
          payload.locationBias = {
            circle: { center: { latitude: lat, longitude: lng }, radius: 20000 },
          };
        }
        const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": googleKey,
            "X-Goog-FieldMask": SEARCH_FIELD_MASK,
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`Places searchText ${res.status}: ${await res.text()}`);
        const parsed = (await res.json()) as { places?: PlaceCandidate[] };
        candidates = parsed.places ?? [];
      }

      const match = pickMatch(
        { name: row.location_name, latitude: lat, longitude: lng },
        candidates,
        matchPolicy,
      );

      if (!match.accepted) {
        noMatch++;
        const { error } = await admin.rpc("location_address_audit_record", {
          p_location_id: row.location_id,
          p_status: "no_match",
          p_error: match.reason,
        });
        if (error) throw new Error(error.message);
        continue;
      }

      const { data: recorded, error } = await admin.rpc("location_address_audit_record", {
        p_location_id: row.location_id,
        p_status: "ok",
        p_place_id: match.place.id,
        p_name: match.place.displayName?.text ?? null,
        p_address: match.place.formattedAddress ?? null,
        p_latitude: match.place.location?.latitude ?? null,
        p_longitude: match.place.location?.longitude ?? null,
        p_maps_url: match.place.googleMapsUri ?? null,
        p_business_status: match.place.businessStatus ?? null,
        p_name_similarity: match.similarity,
      });
      if (error) throw new Error(error.message);

      // Quem decide entre ok e divergente é a RPC, que mede a distância entre os pinos.
      if ((recorded as { status?: string } | null)?.status === "divergent") divergent++;
      else okCount++;
    } catch (e) {
      failed++;
      const message = e instanceof Error ? e.message : String(e);
      console.error(`location-address-audit: falha em ${row.location_id}: ${message}`);
      await admin.rpc("location_address_audit_record", {
        p_location_id: row.location_id,
        p_status: "error",
        p_error: message,
      });
    }
  }

  return json({
    ok: true,
    scanned: scanned ?? 0,
    checked: rows.length,
    ok_count: okCount,
    divergent,
    no_match: noMatch,
    failed,
  });
});
