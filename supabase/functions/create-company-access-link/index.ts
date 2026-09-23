// Edge Function: /create-company-access-link
// Link de acesso ao Recebimento (23/09/2026): o Manager gera, por empresa, um link que faz o dono
// cair LOGADO em /operator/recebimento (KYC + contrato). Cria ou reaproveita o usuário do dono
// (auth.users + profile_company como Dono), grava o segredo (e o hash, que é o que o resgate
// compara) em company_access_link e devolve a URL; o Manager copia de novo quando quiser. Gerar de novo revoga o link anterior da empresa. Não vence em dias: morre quando
// a empresa termina o Recebimento (RPC company_access_link_done) ou quando o Manager revoga.
// Ver docs/specs/link-de-acesso-recebimento.md
//
// POST /functions/v1/create-company-access-link   Authorization: Bearer <JWT de hub_admin>
//   { company_id, email }
// → { id, url, email }   |  403 se não for hub_admin  |  409 se a empresa já terminou

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { makeToken, sha256Hex } from "../create-checkout-handoff/logic.ts";
import { siteUrl } from "../_shared/site.ts";
import { accessUrl, parseCreateInput } from "./logic.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
function env(k: string): string {
  // @ts-expect-error - Deno env
  return Deno.env.get(k)!;
}

// @ts-expect-error - Deno global
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Autenticação necessária" }, 401);

  const userClient = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: "Sessão inválida" }, 401);
  const { data: isAdmin } = await userClient.rpc("is_hub_admin");
  if (isAdmin !== true) return json({ error: "Só a equipe Movepark gera link de acesso." }, 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const parsed = parseCreateInput(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const { company_id: companyId, email } = parsed.input;

  const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

  const { data: company } = await admin.from("company").select("id, name").eq("id", companyId).is("deleted_at", null).maybeSingle();
  if (!company) return json({ error: "Empresa não encontrada." }, 404);

  const { data: done } = await admin.rpc("company_access_link_done", { p_company_id: companyId });
  if (done === true) return json({ error: "Esta empresa já enviou os dados de recebimento e aceitou o contrato." }, 409);

  // Usuário do dono: cria (invite) ou reaproveita (magiclink). Nenhum e-mail sai daqui.
  let profileId: string | null = null;
  const invite = await admin.auth.admin.generateLink({ type: "invite", email });
  if (invite.error) {
    const magic = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (magic.error) return json({ error: magic.error.message }, 400);
    profileId = magic.data.user?.id ?? null;
  } else {
    profileId = invite.data.user?.id ?? null;
  }
  if (!profileId) return json({ error: "Falha ao provisionar o usuário do dono." }, 400);

  // Promove a operador só se ainda for customer/sem papel; nunca rebaixa um hub_admin.
  const { data: prof } = await admin.from("profiles").select("role").eq("id", profileId).maybeSingle();
  if (!prof || prof.role === "customer") {
    await admin.from("profiles").update({ role: "company_operator" }).eq("id", profileId);
  }
  const { error: linkErr } = await admin
    .from("profile_company")
    .upsert({ profile_id: profileId, company_id: companyId, role: "owner" }, { onConflict: "profile_id,company_id" });
  if (linkErr) return json({ error: linkErr.message }, 400);

  // Um link vivo por empresa: gerar outro revoga o anterior.
  await admin.from("company_access_link").update({ revoked_at: new Date().toISOString() }).eq("company_id", companyId).is("revoked_at", null);

  const { secret, prefix } = makeToken();
  const { data: row, error: insErr } = await admin
    .from("company_access_link")
    .insert({ company_id: companyId, profile_id: profileId, email, token_prefix: prefix, token_hash: await sha256Hex(secret), token_secret: secret, created_by: userData.user.id })
    .select("id")
    .single();
  if (insErr) return json({ error: insErr.message }, 400);

  return json({ id: row.id, url: accessUrl(siteUrl(), secret), email });
});
