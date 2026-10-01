import { DEFAULT_SITE_URL } from "./site-host.mjs";

/**
 * Host canônico do site, sem barra final.
 *
 * `VITE_PUBLIC_SITE_URL` sobrescreve, para build de preview responder com o próprio host em
 * vez de apontar canonical e og:url para produção. Fora isso, o valor vem de `site.mjs`.
 *
 * O `?.` não é decoração: o `vite.config.ts` importa este módulo, e lá o esbuild empacota o
 * config antes de existir qualquer `import.meta.env`. Sem a guarda, o build quebra no config.
 */
export const SITE_URL = (import.meta.env?.VITE_PUBLIC_SITE_URL || DEFAULT_SITE_URL).replace(
  /\/+$/,
  "",
);

/**
 * Monta uma URL absoluta a partir de um caminho.
 *
 * Aceita com ou sem barra inicial, e nunca produz `//` no meio: concatenação à mão foi o que
 * gerou `https://hub.movepark.co//verificar` no e-mail de voucher.
 */
export function siteUrl(path = "/"): string {
  return `${SITE_URL}/${path.replace(/^\/+/, "")}`;
}

/**
 * Garante URL absoluta para quem roda fora do site (og:image, JSON-LD, preview de WhatsApp).
 *
 * URL que já tem esquema passa intacta (Storage do Supabase, CDN). Caminho relativo, como a
 * capa de post versionada em `public/images/blog/`, ganha o host canônico: crawler de rede
 * social não resolve `/images/...` contra a página, e o preview saía sem imagem.
 */
export function absoluteUrl(url: string): string {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : siteUrl(url);
}
