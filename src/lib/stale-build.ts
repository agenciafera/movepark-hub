/**
 * Recuperação de "build velho" (client-side).
 *
 * O app é SSG (vite-react-ssg) servido como SPA no Cloudflare Pages. Os assets do
 * build têm hash no nome (imutáveis) e o loader de rotas SSG busca, no cliente, um
 * arquivo `static-loader-data-manifest-<HASH>.json`. Quando um novo deploy sobe, um
 * cliente que ainda roda o HTML antigo (aba aberta, HTML em cache de borda/navegador)
 * carrega um `<HASH>` que não existe mais. Como o `not_found_handling` do Cloudflare é
 * `single-page-application`, o arquivo ausente volta como `index.html` (200, text/html);
 * o `.json()` do loader então estoura com `Unexpected token '<' ... is not valid JSON`
 * e o React Router mostra "Unexpected Application Error!". Um refresh resolve porque
 * carrega o HTML novo com o hash certo.
 *
 * A cura é a mesma que o usuário faz na mão: detectar a assinatura de "build velho" e
 * recarregar UMA vez (guardado por um cooldown pra nunca entrar em loop de reload).
 */

const RELOAD_FLAG = "mp:stale-build-reloaded-at";
const RELOAD_COOLDOWN_MS = 30_000;

/**
 * Erro típico de um cliente rodando um build que não existe mais no servidor:
 * ou um asset com hash antigo caiu no fallback de HTML (JSON inválido), ou um chunk
 * dinâmico (lazy import) sumiu.
 */
export function isStaleBuildError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    // `.json()` recebeu HTML (fallback SPA) onde esperava JSON
    message.includes("is not valid JSON") ||
    message.includes("Unexpected token '<'") ||
    // `.json()` recebeu corpo vazio (ex.: 404 sem corpo)
    message.includes("Unexpected end of JSON input") ||
    // chunk dinâmico com hash antigo não existe mais
    message.includes("Failed to fetch dynamically imported module") ||
    message.includes("error loading dynamically imported module") ||
    message.includes("Importing a module script failed")
  );
}

/**
 * Decide se deve recarregar agora. Retorna `true` se o cooldown permite (e registra o
 * momento); `false` se já recarregamos há pouco — nesse caso o chamador deve mostrar um
 * erro amigável em vez de recarregar de novo (evita loop quando o build novo também falha).
 *
 * `now` é injetável só para teste.
 */
export function shouldReloadForStaleBuild(now: number = Date.now()): boolean {
  try {
    const raw = sessionStorage.getItem(RELOAD_FLAG);
    if (raw !== null) {
      const last = Number(raw);
      if (Number.isFinite(last) && now - last < RELOAD_COOLDOWN_MS) {
        return false;
      }
    }
    sessionStorage.setItem(RELOAD_FLAG, String(now));
  } catch {
    // sessionStorage indisponível (modo privado/SSR): não dá pra guardar o cooldown,
    // mas ainda vale uma tentativa única de reload — deixe seguir.
  }
  return true;
}

/**
 * Recarrega a página para pegar o build atual, se o cooldown permitir.
 * Retorna `true` quando disparou o reload; `false` quando foi bloqueado pelo cooldown.
 */
export function recoverFromStaleBuild(): boolean {
  if (typeof window === "undefined") return false;
  if (!shouldReloadForStaleBuild()) return false;
  window.location.reload();
  return true;
}
