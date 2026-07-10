// Edge Function: /capture-partner-lead
// Captura PROGRESSIVA de lead de parceiro (público, sem login). Salva o que o
// parceiro já preencheu no modal de "Seja parceiro" — o passo 1 (e-mail + WhatsApp)
// entra na hora, pra capturar quem desiste antes de concluir. Upsert por e-mail.
// A submissão COMPLETA continua no /submit-partner-lead.
//
// POST /functions/v1/capture-partner-lead
// apikey: <ANON>  Authorization: Bearer <ANON>
// { contact_email, contact_phone?, contact_name?, company_name?, city?, state?,
//   estimated_spots?, step?, utm_source?, utm_medium?, utm_campaign?, referrer?, hp_field? }

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// @ts-expect-error - Deno global
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  // deno-lint-ignore no-explicit-any
  let input: any;
  try {
    input = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  // Honeypot: bot preencheu campo oculto → finge sucesso e não grava.
  if (typeof input.hp_field === "string" && input.hp_field.trim() !== "") {
    return jsonResponse({ ok: true }, 201);
  }

  const email = String(input.contact_email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return jsonResponse({ error: "E-mail inválido." }, 400);
  }

  const admin = createClient(
    // @ts-expect-error - Deno env
    Deno.env.get("SUPABASE_URL")!,
    // @ts-expect-error - Deno env
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Só grava o que veio — não sobrescreve campos já preenchidos com null.
  // deno-lint-ignore no-explicit-any
  const row: Record<string, any> = { contact_email: email, status: "partial" };
  const opt = (k: string, v: unknown) => {
    if (typeof v === "string" && v.trim() !== "") row[k] = v.trim();
  };
  opt("contact_phone", input.contact_phone);
  opt("contact_name", input.contact_name);
  opt("company_name", input.company_name);
  opt("city", input.city);
  opt("state", input.state);
  opt("utm_source", input.utm_source);
  opt("utm_medium", input.utm_medium);
  opt("utm_campaign", input.utm_campaign);
  opt("referrer", input.referrer);
  if (typeof input.estimated_spots === "number" && input.estimated_spots > 0) {
    row.estimated_spots = Math.floor(input.estimated_spots);
  }
  if (typeof input.step === "number" && input.step > 0) {
    row.step = Math.floor(input.step);
  }

  const { error } = await admin
    .from("partner_lead")
    .upsert(row, { onConflict: "contact_email" });

  if (error) {
    return jsonResponse({ error: error.message }, 400);
  }

  return jsonResponse({ ok: true }, 200);
});
