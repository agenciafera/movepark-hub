// Edge Function: /submit-go2park-interest
// O dono do estacionamento (autenticado) demonstra interesse na Go2Park (produto irmão
// de rastreio de vans de transfer em tempo real). Grava o flag na company_onboarding e
// dispara um lead por e-mail para a caixa da Go2Park (app_setting go2park_leads_inbox).
//
// POST /functions/v1/submit-go2park-interest
// Authorization: Bearer <JWT do operador membro da empresa>
// { company_id }
//
// Idempotente: se o interesse já estava marcado, não reenvia o e-mail.

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail, getEmailConfig, tplGo2ParkInterest } from "../_shared/email.ts";

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

// deno-lint-ignore no-explicit-any
async function recordEmailResult(admin: any, note: string) {
  try {
    await admin.from("app_setting").upsert(
      { key: "go2park_email_last_result", value: `${new Date().toISOString()} ${note}` },
      { onConflict: "key" },
    );
  } catch (e) {
    console.error("[go2park] falha ao gravar last_result (ignorado):", e);
  }
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Autenticação necessária" }, 401);
  }

  // @ts-expect-error - Deno env
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  // @ts-expect-error - Deno env
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  // @ts-expect-error - Deno env
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return jsonResponse({ error: "Sessão inválida" }, 401);
  const uid = userData.user.id;

  let input: { company_id?: string };
  try {
    input = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }
  const companyId = input.company_id;
  if (!companyId) return jsonResponse({ error: "company_id é obrigatório." }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

  // Só um membro da empresa (dono/operador) pode marcar interesse por ela.
  const { data: member } = await admin
    .from("profile_company")
    .select("profile_id")
    .eq("company_id", companyId)
    .eq("profile_id", uid)
    .maybeSingle();
  if (!member) return jsonResponse({ error: "Você não pertence a esta empresa." }, 403);

  const { data: onb, error: onbErr } = await admin
    .from("company_onboarding")
    .select(
      "contact_name, contact_email, contact_phone, city, state, estimated_spots, go2park_interest, company:company!inner(name)",
    )
    .eq("company_id", companyId)
    .maybeSingle();
  if (onbErr || !onb) return jsonResponse({ error: "Estacionamento não encontrado." }, 404);

  // Idempotente: já interessado, nada a fazer (não reenvia e-mail).
  if (onb.go2park_interest) return jsonResponse({ ok: true, already: true });

  const { error: upErr } = await admin
    .from("company_onboarding")
    .update({ go2park_interest: true, go2park_interest_at: new Date().toISOString() })
    .eq("company_id", companyId);
  if (upErr) return jsonResponse({ error: "Não foi possível registrar o interesse." }, 500);

  // Dispara o lead para a Go2Park (em background, para não travar a resposta).
  const emailJob = (async () => {
    try {
      const { from } = await getEmailConfig(admin);
      const { data: inboxRow } = await admin
        .from("app_setting")
        .select("value")
        .eq("key", "go2park_leads_inbox")
        .maybeSingle();
      const to = (inboxRow?.value || "").trim() || "contato@go2park.com.br";
      if (!from) {
        await recordEmailResult(admin, `SKIP sem remetente (partner_email_from) para ${companyId}`);
        return;
      }
      // deno-lint-ignore no-explicit-any
      const companyName = (onb as any).company?.name ?? "Estacionamento";
      const { subject, html } = tplGo2ParkInterest({
        companyName,
        contactName: onb.contact_name ?? "",
        contactEmail: onb.contact_email ?? "",
        contactPhone: onb.contact_phone ?? "",
        city: onb.city,
        state: onb.state,
        estimatedSpots: onb.estimated_spots,
      });
      const res = await sendEmail({ from, to, subject, html, replyTo: onb.contact_email ?? undefined });
      await recordEmailResult(admin, res.ok ? `OK -> ${to} (${companyId})` : `FAIL ${res.error} (${companyId})`);
    } catch (e) {
      await recordEmailResult(admin, `ERROR ${String(e)} (${companyId})`);
    }
  })();
  // @ts-expect-error - EdgeRuntime global
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(emailJob);
  else await emailJob;

  return jsonResponse({ ok: true });
}

// @ts-expect-error - Deno global
if (import.meta.main) Deno.serve(handler);
