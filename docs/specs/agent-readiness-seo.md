# Spec Técnica — Fundação SEO + Agent-Readiness

> Spec de implementação para o Movepark Hub (React 18 + Vite 5 + react-router-dom v6, deploy Cloudflare Pages).
> Baseada em pesquisa de jun/2026 (fontes ao final). A decisão de arquitetura de renderização é do
> Kallef (com Pedro). Esta spec recomenda e justifica; o "como" final é dele.

## Problema (por que isso é prioridade zero)

O projeto hoje é um **SPA client-rendered**: o HTML servido é uma casca (`<div id="root">` + JS),
e todo o conteúdo é montado no navegador. Medições primárias mostram que **os crawlers de IA não
executam JavaScript**: o estudo Vercel+MERJ analisou >500 milhões de fetches do GPTBot e não achou
**nenhuma** evidência de execução de JS; ClaudeBot/GPTBot às vezes baixam o `.js`, mas não o rodam.

**Consequência:** para GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, PerplexityBot, Bytespider,
CCBot e Meta-ExternalAgent, as páginas da Movepark são **brancas**. Só o Googlebot reconstrói o
conteúdo (render em 2 ondas, com atraso). Ou seja: para ser **citado por IA** (a tese do hub),
HTML rastreável é o **bloqueador nº 1** — sem isso, schema, llms.txt e conteúdo são inúteis.

## Decisão de renderização (recomendação)

**Recomendado: `vite-react-ssg` (SSG/prerender no build).** É a menor mudança a partir do stack atual
— mantém `react-router-dom` v6, gera HTML real no build (resolve crawlers de IA, Googlebot e cards
sociais de uma vez) e tem o gancho certo para rotas data-driven: `getStaticPaths()` lista os paths a
pré-renderizar (aeroportos, unidades, posts de blog) e o `loader` do react-router roda **em build time**,
buscando o conteúdo do Supabase. Deploy = estático no Cloudflare Pages, **sem servidor para manter**.

Alternativas avaliadas:
- **Vike** (ex vite-plugin-ssr): permite SSG/SSR/SPA por página e roda em Cloudflare Pages/Workers.
  Mais flexível (SSR seletivo), mas é framework próprio → migração maior. Reservar para rotas que
  exijam frescor por request.
- **@prerenderer/puppeteer**: prerender via Chrome headless, bom até ~centenas de páginas; tapa-buraco.
- **react-snap**: ❌ morto, quebra no React 18 (`createRoot`/`hydrateRoot`). Não usar.
- **Dynamic rendering / prerender.io**: ❌ o Google desencorajou oficialmente; Rendertron foi arquivado.
  Só como último recurso para um bot específico.

⚠️ **Atenção Cloudflare:** o plugin oficial `@cloudflare/vite-plugin` **não** suporta SPA mode +
prerendering. O prerender/SSG tem que vir da ferramenta de build (vite-react-ssg/Vike) e ser publicado
como estático; o plugin Cloudflare não resolve isso.

### Frescor dos dados (Supabase)
Não há ISR nativo ("revalidate: 60") no Vite/Cloudflare. Padrão: **build-time fetch + rebuild via
webhook** (Supabase dispara deploy no Cloudflare Pages quando o conteúdo muda). Só promover rotas
específicas para **SSR em Worker** (Vike) se medir que o rebuild não acompanha a frequência. **Começar
por SSG, não por SSR.** (POC recomendado para validar o ciclo webhook→deploy.)

## SEO por página

- **Head por rota:** migrar para **`@unhead/react`** (componente `<Head>`/`useHead`, com shim `<Helmet>`
  drop-in). Motivo: `react-helmet-async` teve >1 ano sem manutenção e só voltou na v3 (mar/2026) — risco.
  Gerencia `title`, `meta description`, `canonical` e Open Graph por rota. Para SSG, envolver com `<UnheadProvider>`.
- **JSON-LD / structured data** por página de unidade:
  - `LocalBusiness`/`ParkingFacility` para **contexto** (name, address, geo, openingHours, image, priceRange, telefone). Não garante rich result, mas alimenta IA e Maps.
  - **`Product` + `Offer`** para **preço** (`price`/`priceCurrency`/`availability`). Importante: a regra
    "self-serving" do Google **não exibe estrelas** para review em `LocalBusiness` no próprio site; modelar
    a vaga como `Product` é o caminho para snippet de preço e, eventualmente, de rating.
  - `BreadcrumbList` para a trilha (ainda suportado no SERP).
  - `FAQPage` por **GEO** (o rich result de FAQ foi aposentado em 7/mai/2026, mas o schema segue valioso para extração por LLM).
  - Ressalva honesta: schema **não é fator de ranking direto** (John Mueller); o ganho comprovado é
    **acurácia de extração** por IA, não citação garantida.

## Descoberta (robots, sitemap, llms.txt)

- **`robots.txt`** com regras de bots de IA — separar **treino** de **retrieval ao vivo**:
  - *Permitir* (geram tráfego de citação): `OAI-SearchBot`, `ChatGPT-User`, `Claude-Web`, `PerplexityBot`, `Perplexity-User`, `Applebot`.
  - *Decidir* (treino, sem referral): `GPTBot`, `ClaudeBot`, `CCBot`, `Google-Extended`, `Applebot-Extended`, `Bytespider`.
  - Recomendado: **permitir os de retrieval** (queremos ser citados); avaliar bloquear os de treino.
  - Incluir diretiva `Sitemap:`. Usar o repo `ai-robots-txt/ai.robots.txt` como fonte viva da lista de user-agents.
  - Nota: robots.txt é **cooperação, não enforcement** — bloqueio real exige WAF/bot management da Cloudflare.
- **`sitemap.xml`:** usar **`vite-plugin-sitemap`** (gera sitemap.xml **e** robots.txt no build). Alimentar
  `dynamicRoutes` com função async que busca unidades/aeroportos/posts do Supabase no build. Sitemap index se passar de 50k URLs.
- **`llms.txt` / `llms-full.txt`:** implementar como **baixo esforço / baixo risco**, sem expectativa de
  impacto mensurável em 2026. Contexto honesto: Google rejeita publicamente; nenhuma big AI se comprometeu;
  tráfego real ao arquivo é marginal (~0,1% dos hits de bots). Tração real existe em ferramentas de dev.
  Formato: Markdown, H1 (nome) + blockquote (resumo) + seções H2 com listas de links descritos.

## Recursos agênticos Cloudflare (isitagentready.com)

A ferramenta (lançada 17/abr/2026) pontua 4 dimensões. Priorizar os **maduros/produção**, que casam com a tese do MCP-rail:
- **Markdown content negotiation** ("Markdown for agents"): servir markdown limpo quando o agente manda `Accept: text/markdown` (até ~80% menos tokens). Em Cloudflare dá pra fazer via Rule/Snippet (reescrever `/index.md`). Adoção baixa = oportunidade de diferenciação.
- **Content Signals** no robots.txt (`ai-train`/`ai-input`/`search`) via **AI Crawl Control** (managed robots.txt) da Cloudflare.
- **API Catalog** (`/.well-known/api-catalog`, RFC 9727): arquivo estático trivial.
- **MCP Server Card** (`/.well-known/mcp/server-card.json`): **on-thesis** — descreve o MCP da Movepark para agentes. Barato (JSON estático + o MCP que já existe).
- Experimentais (deixar para depois): Web Bot Auth, WebMCP, Agent Skills discovery, e todo o bloco de **comércio agêntico** (x402/ACP/UCP) — ACP (OpenAI+Stripe) é o mais avançado, mas é roadmap, não fundação.

## Sequenciamento (ordem de prioridade)

1. **HTML rastreável** (vite-react-ssg + build-time fetch Supabase) — bloqueador nº 1.
2. **Head por rota + JSON-LD** (@unhead/react; Product/Offer, LocalBusiness, Breadcrumb, FAQ).
3. **Conteúdo no padrão GEO** (ver plano `gestao/plano-organico-geo.md`): estatísticas com fonte, quotes, FAQ, **datas de atualização visíveis** (conteúdo fresco recebe ~3,2× mais citações de IA).
4. **robots.txt + sitemap.xml** (permitir bots de retrieval; sitemap dinâmico).
5. **llms.txt + recursos agênticos** (Markdown negotiation, MCP server card, Content Signals) — baixo custo, on-thesis, payoff incerto.

## Pré-requisito de validação
A `isitagentready.com` precisa do site **no ar** para escanear. Sequência: deploy Cloudflare Pages →
rodar o scan → corrigir o que faltar. Os itens acima já antecipam o que o scanner cobra.

## Fontes (jun/2026)
- Crawlers de IA não executam JS: [Vercel+MERJ](https://vercel.com/blog/the-rise-of-the-ai-crawler)
- vite-react-ssg: [npm](https://www.npmjs.com/package/vite-react-ssg) · Vike Cloudflare: [vike.dev/cloudflare-pages](https://vike.dev/cloudflare-pages)
- Cloudflare vite-plugin não faz SPA prerender: [Cloudflare docs](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)
- Google desencorajou dynamic rendering: [Search Central](https://developers.google.com/search/docs/crawling-indexing/javascript/dynamic-rendering)
- @unhead/react: [unhead.unjs.io](https://unhead.unjs.io/docs/react/head/guides/get-started/migrate-from-react-helmet)
- Review self-serving rule / Product: [Google Review snippet](https://developers.google.com/search/docs/appearance/structured-data/review-snippet)
- FAQ rich result aposentado (mai/2026): [SEOcrawl](https://seocrawl.ai/blog/faq-structured-data-google-2026)
- robots.txt bots de IA: [ai.robots.txt](https://github.com/ai-robots-txt/ai.robots.txt) · vite-plugin-sitemap: [npm](https://www.npmjs.com/package/vite-plugin-sitemap)
- llms.txt (formato e ceticismo): [llmstxt.org](https://llmstxt.org/) · [State of llms.txt 2026](https://presenc.ai/research/state-of-llms-txt-2026)
- Cloudflare agent-readiness: [blog.cloudflare.com/agent-readiness](https://blog.cloudflare.com/agent-readiness/)
- GEO (o que faz citar): [GEO paper, arXiv](https://arxiv.org/html/2311.09735v3)
