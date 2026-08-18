/**
 * Host canônico do site, do lado do Deno.
 *
 * O Deno das Edge Functions não enxerga `src/`, então este é o segundo (e último) lugar onde
 * o domínio aparece. Quem impede este arquivo de divergir de `src/lib/site.mjs` é
 * `src/lib/site.contract.test.ts`, que lê os dois e reprova se o host não bater.
 *
 * `PUBLIC_SITE_URL` sobrescreve. Antes de 18/08/2026 cada função tinha o seu
 * `?? "https://hub.movepark.co"` copiado à mão, e a `assistant-tools.ts` nem lia a env:
 * tinha o host cravado numa const.
 */
export const DEFAULT_SITE_URL = "https://movepark.co";

/** Host sem barra final. */
export function siteUrl(): string {
  return (Deno.env.get("PUBLIC_SITE_URL") || DEFAULT_SITE_URL).replace(/\/+$/, "");
}

/**
 * URL absoluta a partir de um caminho, sem `//` no meio.
 *
 * Aceita com ou sem barra inicial. A concatenação à mão era o que produzia
 * `https://movepark.co//verificar` quando a env vinha com barra no fim.
 */
export function sitePath(path = "/"): string {
  return `${siteUrl()}/${path.replace(/^\/+/, "")}`;
}
