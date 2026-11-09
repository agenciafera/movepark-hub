// Edge Function: /admin-user-login-link
// Link de acesso de um usuário, gerado pela equipe Movepark (Manager › Usuários). O login do
// Hub é passwordless (não há senha para redefinir: o gatilho block_new_password zera qualquer
// uma), então o "redefinir acesso" é um link de uso único que entra logado na conta. O hub_admin
// copia o link, ou pede para a Edge mandar por e-mail à própria pessoa.
//
// POST /functions/v1/admin-user-login-link   Authorization: Bearer <JWT de hub_admin>
//   { user_id, send_email?: boolean }
// → { url, email, sent }   |  403 se não for hub_admin  |  404 sem conta  |  422 conta sem e-mail
//
// O e-mail vem de auth.users, nunca do corpo (ADR-006). Nada é gravado: o link é o do Supabase
// Auth (generateLink magiclink), vale uma vez e expira no prazo do OTP do projeto.

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEmailConfig, sendEmail, siteUrl, tplAccessLink } from "../_shared/email.ts";
import { accountEmail, parseLoginLinkInput } from "./logic.ts";

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
  const parsed = parseLoginLinkInput(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const { user_id: targetId, send_email: sendMail } = parsed.input;

  const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

  const { data: target, error: getErr } = await admin.auth.admin.getUserById(targetId);
  if (getErr || !target?.user) return json({ error: "Conta não encontrada." }, 404);
  const email = accountEmail(target.user.email);
  if (!email) {
    return json({ error: "Essa conta entra por WhatsApp e não tem e-mail. Não dá para gerar link." }, 422);
  }

  const link = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${siteUrl()}/login` },
  });
  const url = link.data?.properties?.action_link;
  if (link.error || !url) return json({ error: link.error?.message ?? "Falha ao gerar o link." }, 400);

  // Rastro: quem gerou o link de quem. Só log; a conta não guarda o segredo.
  console.log(`[admin-user-login-link] ${userData.user.id} gerou link para ${targetId} (email=${sendMail})`);

  let sent = false;
  if (sendMail) {
    const { from } = await getEmailConfig(admin);
    if (!from) return json({ error: "Remetente de e-mail não configurado." }, 500);
    const mail = tplAccessLink(url);
    const r = await sendEmail({ from, to: email, subject: mail.subject, html: mail.html });
    if (!r.ok) return json({ error: `O link foi gerado, mas o e-mail não saiu: ${r.error ?? "erro de envio"}`, url, email, sent: false }, 502);
    sent = true;
  }

  return json({ url, email, sent });
});
