// Edge Function: /invite-company-member
// Convite de novo usuário para a equipe da empresa (E1.7). Quem tem `team:write` (Dono) convida
// por e-mail; cria/encontra o auth.user, vincula em profile_company com o papel escolhido e manda
// o magic link. Espelha o padrão do approve-partner, mas a autorização é por ESCOPO (ADR-005),
// não por hub_admin: o convidante é o auth.uid() do JWT, validado via RPC member_has_scope.
//
// POST /functions/v1/invite-company-member
// Authorization: Bearer <JWT do convidante>
// { company_id, email, role: "owner"|"manager"|"operator"|"finance" }
// → { ok: true, status: "invited" }

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail, siteUrl, getEmailConfig, tplTeamInvite } from "../_shared/email.ts";
import { isAssignableRole, normalizeEmail, ROLE_LABEL, type AssignableRole } from "./logic.ts";

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

function runBg(p: Promise<unknown>) {
  try {
    // @ts-expect-error - EdgeRuntime global
    EdgeRuntime.waitUntil(p);
  } catch {
    /* já roda em background */
  }
}

interface Input {
  company_id?: string;
  email?: string;
  role?: string;
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

  // Client com o JWT do convidante → auth.uid() é quem convida (member_has_scope usa isso).
  const userClient = createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return jsonResponse({ error: "Sessão inválida" }, 401);

  let input: Input;
  try {
    input = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const companyId = input.company_id;
  const email = normalizeEmail(input.email);
  const role = input.role;
  if (!companyId) return jsonResponse({ error: "company_id é obrigatório." }, 400);
  if (!email) return jsonResponse({ error: "E-mail inválido." }, 400);
  if (!isAssignableRole(role)) return jsonResponse({ error: "Papel inválido." }, 400);
  const newRole: AssignableRole = role;

  // Autorização por escopo: o convidante precisa de team:write nesta empresa (Dono).
  const { data: canManage, error: scopeErr } = await userClient.rpc("member_has_scope", {
    p_company_id: companyId,
    p_scope: "team:write",
  });
  if (scopeErr) return jsonResponse({ error: scopeErr.message }, 400);
  if (canManage !== true) {
    return jsonResponse({ error: "Seu papel não permite convidar usuários (team:write)." }, 403);
  }

  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

  // Nome da empresa para o e-mail.
  const { data: company } = await admin
    .from("company")
    .select("name")
    .eq("id", companyId)
    .maybeSingle();
  const companyName = (company?.name as string) ?? "sua empresa";

  // Cria o convite (novo auth.user) ou cai pra magic link se já existir.
  const redirectTo = `${siteUrl()}/operator`;
  let actionLink: string | null = null;
  let invitedUserId: string | null = null;

  const invite = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo },
  });
  if (invite.error) {
    const magic = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    });
    if (magic.error) return jsonResponse({ error: magic.error.message }, 400);
    actionLink = magic.data.properties?.action_link ?? null;
    invitedUserId = magic.data.user?.id ?? null;
  } else {
    actionLink = invite.data.properties?.action_link ?? null;
    invitedUserId = invite.data.user?.id ?? null;
  }

  if (!invitedUserId) return jsonResponse({ error: "Falha ao provisionar usuário." }, 400);

  // Promove a operador SÓ se ainda for customer/sem papel — nunca rebaixa um hub_admin.
  const { data: prof } = await admin
    .from("profiles")
    .select("role")
    .eq("id", invitedUserId)
    .maybeSingle();
  if (!prof || prof.role === "customer") {
    await admin.from("profiles").update({ role: "company_operator" }).eq("id", invitedUserId);
  }

  // Vincula à empresa com o papel escolhido (atualiza se já era membro).
  const { error: linkErr } = await admin
    .from("profile_company")
    .upsert(
      { profile_id: invitedUserId, company_id: companyId, role: newRole },
      { onConflict: "profile_id,company_id" },
    );
  if (linkErr) return jsonResponse({ error: linkErr.message }, 400);

  // E-mail de convite (background; não derruba a resposta).
  if (actionLink) {
    let from: string | null = null;
    try {
      from = (await getEmailConfig(admin)).from;
    } catch (e) {
      console.error("[invite] falha ao ler config de e-mail (ignorado):", e);
    }
    if (from) {
      const mail = tplTeamInvite(companyName, ROLE_LABEL[newRole], actionLink);
      runBg(sendEmail({ from, to: email, subject: mail.subject, html: mail.html }));
    }
  }

  return jsonResponse({ ok: true, status: "invited" });
});
