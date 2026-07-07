// Edge Function: /lookup-vehicle-plate
// Consulta a placa no serviço externo (services.movepark.co, Strapi) e devolve os dados já
// normalizados pro nosso domínio, pra autocompletar o cadastro de veículo (conta + checkout).
// O Bearer da API externa é SEGREDO — mora só aqui (env), nunca no front (bundle é SSG/estático).
// Exige JWT: todo cadastro de veículo já roda logado e a API externa é paga (evita abuso anônimo).
//
// POST /functions/v1/lookup-vehicle-plate
// Authorization: Bearer <JWT>
// { "plate": "EQH1120" }
// → { found: true, vehicle: { license_plate, model, color, raw_color, brand, year, fuel } }
// → { found: false }   (placa não está na base)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildLookupUrl, isValidPlate, normalizeLookupResponse, normalizePlate } from "./logic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extraHeaders },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  // Auth: exige um USUÁRIO logado de verdade. A plataforma (verify_jwt) só garante um JWT
  // válido — a anon key (pública no bundle) passaria. Então validamos com getUser() e
  // rejeitamos anon, pra não expor a API externa paga a qualquer um com a anon key.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "Autenticação necessária" }, 401);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return jsonResponse({ error: "Sessão inválida" }, 401);

  const BASE_URL = Deno.env.get("PLATE_LOOKUP_BASE_URL");
  const TOKEN = Deno.env.get("PLATE_LOOKUP_TOKEN");
  if (!BASE_URL || !TOKEN) {
    console.error("lookup-vehicle-plate: PLATE_LOOKUP_BASE_URL/PLATE_LOOKUP_TOKEN não configurados");
    return jsonResponse({ error: "Consulta de placa indisponível." }, 503);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }
  const rawPlate = (body as { plate?: unknown })?.plate;
  const plate = normalizePlate(typeof rawPlate === "string" ? rawPlate : "");
  if (!isValidPlate(plate)) {
    return jsonResponse({ error: "Placa inválida." }, 400);
  }

  // Chamada à API externa com timeout (não deixa o usuário pendurado).
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(buildLookupUrl(BASE_URL, plate), {
      method: "GET",
      headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`lookup-vehicle-plate: upstream HTTP ${res.status}`);
      return jsonResponse({ error: "Serviço de consulta indisponível no momento." }, 502);
    }
    const json = await res.json();
    const result = normalizeLookupResponse(json, plate);
    return jsonResponse(result, 200, { "Cache-Control": "private, max-age=300" });
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === "AbortError";
    console.error("lookup-vehicle-plate: falha na consulta", err);
    return jsonResponse(
      { error: aborted ? "A consulta demorou demais. Tente de novo." : "Falha ao consultar a placa." },
      502,
    );
  } finally {
    clearTimeout(timeout);
  }
});
