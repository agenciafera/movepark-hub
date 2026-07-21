/**
 * Bypass de auth da suíte E2E.
 *
 * O app é passwordless (Google, OTP de e-mail, OTP de WhatsApp) e o ADR do
 * projeto manda manter o password grant desligado. Então o bypass NÃO usa
 * `signInWithPassword`. Em vez disso:
 *
 *   1. o service_role gera um magic link com `auth.admin.generateLink`
 *      (isso não dispara e-mail, só devolve o link assinado);
 *   2. o navegador do Playwright abre esse link;
 *   3. o Supabase redireciona de volta para o app com os tokens na URL e o
 *      próprio client do app (`detectSessionInUrl: true`) grava a sessão no
 *      localStorage, no formato que ele usa hoje;
 *   4. o Playwright salva isso como `storageState`.
 *
 * A vantagem de deixar o app gravar a sessão: a suíte não precisa saber o
 * formato interno do `sb-<ref>-auth-token`. Se o supabase-js mudar o formato,
 * o bypass continua valendo.
 */
import { expect, type Page } from "@playwright/test";
import { admin } from "./supabaseAdmin";
import { env, projectRef } from "./env";

export const MANAGER_STATE = ".auth/manager.json";
export const OPERATOR_STATE = ".auth/operator.json";
export const CUSTOMER_STATE = ".auth/customer.json";

async function generateMagicLink(email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: env.baseUrl },
  });

  if (error) {
    throw new Error(
      `[e2e] Não consegui gerar o magic link para ${email}: ${error.message}\n` +
        `      Confira se o usuário existe no projeto ${projectRef} e se o ` +
        `SUPABASE_SERVICE_ROLE_KEY do .env.e2e é desse projeto.`,
    );
  }

  const link = data.properties?.action_link;
  if (!link) throw new Error(`[e2e] generateLink não devolveu action_link para ${email}.`);
  return link;
}

/** Lê a sessão que o app gravou no localStorage, ou null se ainda não gravou. */
async function readStoredSession(page: Page) {
  return page.evaluate(() => {
    const key = Object.keys(window.localStorage).find(
      (k) => k.startsWith("sb-") && k.endsWith("-auth-token"),
    );
    if (!key) return null;
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as { access_token?: string }) : null;
    } catch {
      return null;
    }
  });
}

/**
 * Abre o magic link e espera o app persistir a sessão.
 * Ao voltar, a página está logada e o `storageState` do contexto já serve.
 */
export async function signInAs(page: Page, email: string) {
  const link = await generateMagicLink(email);
  const appOrigin = new URL(env.baseUrl).origin;

  await page.goto(link);

  await page.waitForURL((url) => url.origin === appOrigin, { timeout: 30_000 }).catch(() => {
    throw new Error(
      `[e2e] O magic link não redirecionou de volta para ${appOrigin}.\n` +
        `      Adicione "${appOrigin}/**" em Supabase > Authentication > URL Configuration > Redirect URLs.`,
    );
  });

  await expect
    .poll(async () => (await readStoredSession(page))?.access_token ?? null, {
      timeout: 20_000,
      message: `[e2e] O app não persistiu a sessão de ${email} no localStorage.`,
    })
    .not.toBeNull();
}
