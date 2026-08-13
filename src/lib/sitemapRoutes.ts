/**
 * Rotas estáticas que entram no sitemap, e as que ficam de fora de propósito.
 *
 * Por que esta lista existe à mão: o `vite-plugin-sitemap` roda no `closeBundle`, ou seja,
 * ANTES de o `vite-react-ssg` pré-renderizar as páginas. Naquele instante o `dist/` só tem o
 * `index.html` do build de cliente, então o plugin não tem como descobrir sozinho que
 * `/sobre` e `/faq` existem. O resultado medido em 13/08/2026: o sitemap publicado tinha 135
 * URLs e nenhuma página institucional, mesmo com todas elas pré-renderizadas no `dist/`.
 *
 * Este arquivo NÃO pode importar nada. Ele é carregado pelo `vite.config.ts`, que o Vite
 * empacota com esbuild antes de conhecer o alias `@`: qualquer import aqui (mesmo indireto,
 * via `@/routes`) quebra o build inteiro. Por isso a lista é literal, e quem impede que ela
 * envelheça é o teste `sitemapRoutes.test.ts`, que lê o `routes.tsx` e reprova rota nova sem
 * decisão tomada.
 */

/** Páginas estáticas públicas e indexáveis. As dinâmicas vêm do banco no `vite.config.ts`. */
export const SITEMAP_STATIC_ROUTES = [
  "/",
  "/sobre",
  "/como-funciona",
  "/faq",
  "/ajuda",
  "/contato",
  "/cancelamento",
  "/termos",
  "/privacidade",
  "/seja-parceiro",
] as const;

/**
 * Rotas públicas que existem e NÃO devem entrar no índice, cada uma com o motivo.
 * Estar aqui é decisão, não esquecimento: o teste exige que toda rota do `routes.tsx` esteja
 * ou no sitemap, ou nesta lista, ou sob um prefixo privado.
 */
export const SITEMAP_OPT_OUT: Record<string, string> = {
  "/search": "resultado parametrizado; /search?dest=POA já apareceu indexado como duplicata",
  "/docs": "documentação técnica da API, fora da superfície de consumidor",
  "/motor-preview": "ferramenta interna de preço",
  "/design-system": "catálogo visual interno",
  "/voucher/validate": "tela de operação, exige código de reserva",
  "/onboarding": "fluxo de cadastro de parceiro, sem conteúdo indexável",
  "/login": "autenticação",
  "/entrar": "redireciona para /login",
  "/signup": "redireciona para /login",
  "/auth/callback": "retorno de autenticação",
  "*": "catch-all do React Router, não é URL",
};

/** Prefixos de área logada. Tudo abaixo deles fica fora do sitemap. */
export const SITEMAP_PRIVATE_PREFIXES = [
  "/manager",
  "/operator",
  "/account",
  "/checkout",
  "/bookings",
] as const;

/**
 * Padrões de rota dinâmica cujas URLs concretas o `vite.config.ts` busca no banco.
 * Ficam listados para o teste saber que já estão cobertos e não cobrar decisão de novo.
 */
export const SITEMAP_DYNAMIC_PATTERNS = [
  "/p/:operatorSlug/:locationSlug/:parkingTypeCode",
  "/destinos",
  "/destinos/:slug",
  "/estacionamentos/:destino/:slug",
  "/blog",
  "/blog/:slug",
] as const;

/**
 * Taxonomia e paginação do blog. Existem no `dist/` (48 arquivos) e ainda não entram no
 * sitemap, porque cada uma exige uma consulta própria de slugs e de contagem de páginas.
 * Ficam declaradas para o teste não cobrar decisão a cada build, e o débito fica visível.
 */
export const SITEMAP_BLOG_TAXONOMY_PENDING = [
  "/blog/page/:page",
  "/blog/categoria/:slug",
  "/blog/categoria/:slug/page/:page",
  "/blog/tag/:slug",
  "/blog/tag/:slug/page/:page",
  "/blog/autor/:slug",
  "/blog/autor/:slug/page/:page",
  "/blog/aeroporto/:slug",
  "/blog/aeroporto/:slug/page/:page",
] as const;
