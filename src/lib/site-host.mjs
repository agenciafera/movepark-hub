/**
 * O domínio canônico do site. Uma linha, um lugar.
 *
 * Por que este arquivo é `.mjs` separado do `site.ts`: o host precisa ser lido por três consumidores
 * que não compartilham runtime. O front e o `vite.config.ts` são TypeScript; o
 * `scripts/generate-geo-artifacts.mjs` roda em node puro depois do build e não consegue
 * importar TS (node 20 não descasca tipo). Um `.mjs` com declaração ao lado (`site-host.d.mts`)
 * atende os dois sem duplicar o valor, do mesmo jeito que `sitemap-split.logic.mjs` já é
 * compartilhado entre o config e o script do split.
 *
 * O nome não é `site.mjs` de propósito: a ordem de extensões do Vite tenta `.mjs` ANTES de
 * `.ts`, então `import ... from "@/lib/site"` resolveria para cá e o app inteiro receberia
 * um `SITE_URL` undefined, sem erro de build.
 *
 * O terceiro consumidor é o Deno das Edge Functions, que não enxerga `src/`. A cópia dele
 * vive em `supabase/functions/_shared/site.ts` e quem impede as duas de divergirem é
 * `src/lib/site.contract.test.ts`.
 *
 * Histórico: até 18/08/2026 o Hub respondia em `hub.movepark.co` e essa string estava
 * escrita à mão em 44 pontos de `src/`, mais os artefatos estáticos. Ver
 * docs/specs/seo-indexacao.md.
 */
export const DEFAULT_SITE_URL = "https://movepark.co";
