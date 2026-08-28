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
  "/metodologia",
  "/termos",
  "/privacidade",
  "/seja-parceiro",
  "/calculadora-estacionamento-aeroporto",
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
  "/404": "página de erro; indexá-la seria criar um soft 404 nosso, e o worker responde 404 nela",
  "/login": "autenticação",
  "/conversa/:token":
    "leitura de conversa compartilhada por link; o token vive na URL e indexá-la publicaria a conversa de um cliente",
  "/entrar": "redireciona para /login",
  "/signup": "redireciona para /login",
  "/uber-ou-estacionamento-aeroporto":
    "redireciona para a calculadora; o comparador de app foi centralizado nela (15/08/2026)",
  "/auth/callback": "retorno de autenticação",
  "/descadastro":
    "ação de saída da lista de marketing, aberta pelo link do e-mail; sem conteúdo e sem valor de busca",
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
  // Uma pasta para o catálogo, e uma ficha por estacionamento nas duas famílias.
  // Ver docs/specs/url-estacionamentos.md.
  "/estacionamentos",
  "/estacionamentos/:destino",
  "/estacionamentos/:destino/:lote",
  "/estacionamentos/:destino/precos",
  "/estacionamentos/:destino/mais-barato",
  "/blog",
  "/blog/:slug",
  "/faq/:slug",
  "/precos",
  // Taxonomia e paginação do blog (18/08/2026): `getBlogTaxonomyRoutes` no `vite.config.ts`
  // espelha a mesma contagem do `getStaticPaths` de `src/routes.tsx` (48 arquivos no dist/)
  // e entra na seção `blog` do sitemap. Até aqui viviam em `SITEMAP_BLOG_TAXONOMY_PENDING`,
  // como débito visível; a consulta de agrupamento foi escrita e o débito fechou.
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
