// Edge Function: /submit-partner-lead
// Stage 1 do onboarding de parceiro — captura de lead PÚBLICA (sem login).
// Cria company (status=inactive, onboarding_status=pending_review) + company_onboarding
// via RPC submit_partner_lead (service_role). Honeypot + dedup por e-mail/CNPJ.
//
// POST /functions/v1/submit-partner-lead
// apikey: <ANON>  Authorization: Bearer <ANON>
// {
//   company_name, contact_name, contact_email, contact_phone,
//   tax_id?, contact_role?, city?, state?, estimated_spots?, message?, accept_terms,
//   utm_source?, utm_medium?, utm_campaign?, referrer?, hp_field?
// }

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail, getEmailConfig, tplLeadReceived, tplLeadAlert } from "../_shared/email.ts";

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

interface LeadInput {
  company_name?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  tax_id?: string | null;
  contact_role?: string | null;
  city?: string | null;
  state?: string | null;
  estimated_spots?: number | null;
  message?: string | null;
  accept_terms?: boolean;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  referrer?: string | null;
  hp_field?: string | null; // honeypot — precisa vir vazio
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// @ts-expect-error - Deno global
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  let input: LeadInput;
  try {
    input = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  // Anti-spam: honeypot preenchido → finge sucesso e descarta.
  if (input.hp_field && String(input.hp_field).trim() !== "") {
    return jsonResponse({ ok: true }, 201);
  }

  const companyName = (input.company_name ?? "").trim();
  const contactName = (input.contact_name ?? "").trim();
  const contactEmail = (input.contact_email ?? "").trim().toLowerCase();
  const contactPhone = (input.contact_phone ?? "").trim();
  const taxId = (input.tax_id ?? "").trim();

  if (!companyName || !contactName || !contactEmail || !contactPhone) {
    return jsonResponse({ error: "Preencha empresa, nome, e-mail e telefone." }, 400);
  }
  if (!EMAIL_RE.test(contactEmail)) {
    return jsonResponse({ error: "E-mail inválido." }, 400);
  }
  if (input.accept_terms !== true) {
    return jsonResponse({ error: "É necessário aceitar os termos." }, 400);
  }

  const admin = createClient(
    // @ts-expect-error - Deno env
    Deno.env.get("SUPABASE_URL")!,
    // @ts-expect-error - Deno env
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Dedup por e-mail: já existe um lead/parceiro com esse contato?
  const { data: existing } = await admin
    .from("company_onboarding")
    .select("company_id, company:company!inner(onboarding_status)")
    .eq("contact_email", contactEmail)
    .limit(1)
    .maybeSingle();

  if (existing) {
    // deno-lint-ignore no-explicit-any
    const status = (existing as any).company?.onboarding_status as string | undefined;
    if (status === "active") {
      return jsonResponse({ error: "Este e-mail já pertence a um parceiro ativo." }, 409);
    }
    // pending_review / approved / in_progress / rejected → já recebemos
    return jsonResponse({ ok: true, already_submitted: true }, 200);
  }

  // Dedup por CNPJ ativo
  if (taxId) {
    const { data: taxDup } = await admin
      .from("company")
      .select("id")
      .eq("tax_id", taxId)
      .eq("onboarding_status", "active")
      .limit(1)
      .maybeSingle();
    if (taxDup) {
      return jsonResponse({ error: "Este CNPJ já pertence a um parceiro ativo." }, 409);
    }
  }

  const { data: companyId, error } = await admin.rpc("submit_partner_lead", {
    p_company_name: companyName,
    p_contact_name: contactName,
    p_contact_email: contactEmail,
    p_contact_phone: contactPhone,
    p_tax_id: taxId || null,
    p_contact_role: input.contact_role ?? null,
    p_city: input.city ?? null,
    p_state: input.state ?? null,
    p_estimated_spots: input.estimated_spots ?? null,
    p_message: input.message ?? null,
    p_utm_source: input.utm_source ?? null,
    p_utm_medium: input.utm_medium ?? null,
    p_utm_campaign: input.utm_campaign ?? null,
    p_referrer: input.referrer ?? null,
  });

  if (error) {
    return jsonResponse({ error: error.message }, 400);
  }

  // E-mails em background: não bloqueiam nem derrubam o request.
  // O resultado do último envio fica em app_setting.partner_email_last_result (diagnóstico).
  const emailJob = (async () => {
    let note = "";
    try {
      const { from, inbox } = await getEmailConfig(admin);
      if (!from) {
        note = "sem remetente configurado";
      } else {
        const partnerMail = tplLeadReceived(contactName);
        const r = await sendEmail({ from, to: contactEmail, subject: partnerMail.subject, html: partnerMail.html });
        note = `lead→${contactEmail}: ${r.ok ? "ok" : r.error}`;
        if (inbox) {
          const alert = tplLeadAlert({
            companyName, contactName, contactEmail, contactPhone,
            city: input.city, state: input.state, estimatedSpots: input.estimated_spots, utmSource: input.utm_source,
          });
          const r2 = await sendEmail({ from, to: inbox, subject: alert.subject, html: alert.html, replyTo: contactEmail });
          note += ` | alerta→${inbox}: ${r2.ok ? "ok" : r2.error}`;
        }
      }
    } catch (mailErr) {
      note = `exceção: ${String(mailErr)}`;
      console.error("[lead] falha ao enviar e-mail (ignorado):", mailErr);
    }
    try {
      await admin.from("app_setting").upsert(
        { key: "partner_email_last_result", value: `${new Date().toISOString()} ${note}` },
        { onConflict: "key" },
      );
    } catch { /* ignore */ }
  })();
  try {
    // @ts-expect-error - EdgeRuntime global
    EdgeRuntime.waitUntil(emailJob);
  } catch {
    /* já roda em background */
  }

  return jsonResponse({ ok: true, company_id: companyId }, 201);
});
