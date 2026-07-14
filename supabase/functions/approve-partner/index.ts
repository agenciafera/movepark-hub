// Edge Function: /approve-partner
// Aprovação manual do lead pelo hub_admin (Manager Panel).
// Ações: approve | reject | resend_invite
//  - approve: gera convite (cria auth.user), seta profiles.role=company_operator,
//             vincula profile_company, onboarding_status=approved, envia e-mail (AWS SES).
//  - reject:  onboarding_status=rejected + motivo, envia e-mail de recusa.
//  - resend_invite: regenera o magic link e reenvia.
//
// POST /functions/v1/approve-partner
// Authorization: Bearer <JWT hub_admin>
// { company_id, action: "approve" | "reject" | "resend_invite", rejection_reason? }

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail, siteUrl, getEmailConfig, tplApprovalInvite, tplRejection } from "../_shared/email.ts";

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

/**
 * Grava o resultado do último envio em app_setting.partner_email_last_result (diagnóstico),
 * no mesmo formato que submit-partner-lead usa. Nunca derruba a ação principal.
 */
// deno-lint-ignore no-explicit-any
async function recordEmailResult(admin: any, note: string) {
  try {
    await admin.from("app_setting").upsert(
      { key: "partner_email_last_result", value: `${new Date().toISOString()} ${note}` },
      { onConflict: "key" },
    );
  } catch (e) {
    console.error("[approve] falha ao gravar last_result (ignorado):", e);
  }
}

interface Input {
  company_id?: string;
  action?: "approve" | "reject" | "resend_invite";
  rejection_reason?: string | null;
}

// @ts-expect-error - Deno global
Deno.serve(async (req: Request) => {
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
  const adminUid = userData.user.id;

  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

  // Garante que o chamador é hub_admin
  const { data: caller } = await admin.from("profiles").select("role").eq("id", adminUid).maybeSingle();
  if (!caller || caller.role !== "hub_admin") {
    return jsonResponse({ error: "Acesso restrito a administradores." }, 403);
  }

  let input: Input;
  try {
    input = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const companyId = input.company_id;
  const action = input.action;
  if (!companyId || !action) {
    return jsonResponse({ error: "company_id e action são obrigatórios." }, 400);
  }

  // Lead + empresa
  const { data: lead, error: leadErr } = await admin
    .from("company_onboarding")
    .select("company_id, contact_name, contact_email, company:company!inner(name, onboarding_status)")
    .eq("company_id", companyId)
    .maybeSingle();

  if (leadErr || !lead) return jsonResponse({ error: "Cadastro não encontrado." }, 404);
  const contactEmail = (lead.contact_email as string).toLowerCase();
  const contactName = (lead.contact_name as string) ?? "parceiro";
  // deno-lint-ignore no-explicit-any
  const currentStatus = (lead as any).company?.onboarding_status as string;

  const redirectTo = `${siteUrl()}/onboarding`;
  let from: string | null = null;
  try {
    from = (await getEmailConfig(admin)).from;
  } catch (e) {
    console.error("[approve] falha ao ler config de e-mail (ignorado):", e);
  }

  if (action === "reject") {
    const { error } = await admin
      .from("company_onboarding")
      .update({ rejected_at: new Date().toISOString(), rejection_reason: input.rejection_reason ?? null })
      .eq("company_id", companyId);
    if (error) return jsonResponse({ error: error.message }, 400);
    await admin.from("company").update({ onboarding_status: "rejected" }).eq("id", companyId);

    let emailSent = false;
    let emailError: string | null = null;
    if (!from) {
      emailError = "Remetente (partner_email_from) não configurado";
    } else {
      const mail = tplRejection(contactName, input.rejection_reason);
      const r = await sendEmail({ from, to: contactEmail, subject: mail.subject, html: mail.html });
      emailSent = r.ok;
      emailError = r.error ?? null;
    }
    await recordEmailResult(admin, `recusa→${contactEmail}: ${emailSent ? "ok" : `falhou (${emailError})`}`);
    return jsonResponse({ ok: true, status: "rejected", emailSent, emailError });
  }

  // approve | resend_invite → precisa de um link de acesso
  // tenta convite (cria usuário); se já existir, usa magiclink
  let actionLink: string | null = null;
  let invitedUserId: string | null = null;

  const invite = await admin.auth.admin.generateLink({
    type: "invite",
    email: contactEmail,
    options: { redirectTo },
  });

  if (invite.error) {
    const magic = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: contactEmail,
      options: { redirectTo },
    });
    if (magic.error) return jsonResponse({ error: magic.error.message }, 400);
    actionLink = magic.data.properties?.action_link ?? null;
    invitedUserId = magic.data.user?.id ?? null;
  } else {
    actionLink = invite.data.properties?.action_link ?? null;
    invitedUserId = invite.data.user?.id ?? null;
  }

  if (action === "approve") {
    if (invitedUserId) {
      // promove a operador e vincula à empresa
      await admin.from("profiles").update({ role: "company_operator" }).eq("id", invitedUserId);
      await admin
        .from("profile_company")
        .upsert({ profile_id: invitedUserId, company_id: companyId }, { onConflict: "profile_id,company_id", ignoreDuplicates: true });
    }
    if (currentStatus === "pending_review" || currentStatus === "rejected") {
      await admin.from("company").update({ onboarding_status: "approved" }).eq("id", companyId);
    }
    await admin
      .from("company_onboarding")
      .update({ approved_at: new Date().toISOString(), approved_by: adminUid, rejected_at: null, rejection_reason: null })
      .eq("company_id", companyId);
  }

  let emailSent = false;
  let emailError: string | null = null;
  if (!actionLink) {
    emailError = "Não foi possível gerar o link de acesso";
  } else if (!from) {
    emailError = "Remetente (partner_email_from) não configurado";
  } else {
    const mail = tplApprovalInvite(contactName, actionLink);
    const r = await sendEmail({ from, to: contactEmail, subject: mail.subject, html: mail.html });
    emailSent = r.ok;
    emailError = r.error ?? null;
  }
  await recordEmailResult(admin, `${action}→${contactEmail}: ${emailSent ? "ok" : `falhou (${emailError})`}`);

  return jsonResponse({
    ok: true,
    status: action === "approve" ? "approved" : "invited",
    emailSent,
    emailError,
  });
});
