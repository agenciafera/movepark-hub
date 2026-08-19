# Destinos (Destinations)

> Status: ✅ Implementado — migration `20260609120000_destination_seo.sql`, CRUD no
> Manager, índice SSG `/destinos` + página pública SSG `/destinos/<slug>` (ambos no sitemap),
> menu "Destinos" no header do consumer.
>
> **Vínculo com lotes:** cada `location` aponta para o seu destino-âncora via
> `location.destination_id`, e a proximidade lote→destino sai por **PostGIS** `ST_Distance`
> (ADR-001) — ver [location-destination-proximity.md](./location-destination-proximity.md) (DAT-04).
>
> **Pontos (terminais):** destinos multi-terminal (GRU: T1/T2/T3) têm pontos próprios em
> `destination_point`, com distância por terminal e badge "mais perto do Tx" — ver
> [destination-points.md](./destination-points.md) (DAT-05).

## O que é

Um **destino** é um ponto de referência geográfico em torno do qual o cliente busca
estacionamento — tipicamente um **aeroporto** (GRU, CGH, SDU…), mas também rodoviária,
centro de cidade ou bairro. Os destinos cumprem dois papéis:

1. **Busca:** alimentam o seletor "Onde" da home/busca e servem de âncora geográfica
   (lat/lng) para o ranking por distância em `search`.
2. **SEO / conteúdo:** cada destino publicado é uma **página de conteúdo própria**
   (`/destinos/<slug>`) pré-renderizada no build (SSG), com texto, lista de
   estacionamentos próximos, FAQ, mapa e dados estruturados — capturando busca orgânica
   do tipo "estacionamento perto do aeroporto de Guarulhos".

A entidade já existia (catálogo de aeroportos da busca, lido pela Edge Function `search`
e pela home). Esta feature adicionou a camada de **conteúdo/SEO** e o **CRUD de gestão**.

## Modelo de dados

Tabela `public.destination` (singular, convenção do schema). Colunas de catálogo já
existiam; a migration `20260609120000_destination_seo` adicionou o bloco de SEO/conteúdo:

```
destination
├── id uuid pk
├── code            text        — código curto/IATA (GRU, CGH, SDU)
├── name            text        — nome completo ("Aeroporto de Guarulhos")
├── short_name      text|null   — rótulo curto ("Guarulhos") p/ chips e menu
├── type            text        — airport | bus_terminal | city_center | district | custom
├── city, state, country        — localização administrativa (country default "BR")
├── latitude, longitude         — âncora geográfica p/ ranking por distância
├── is_popular      bool        — destaca na home e no topo do menu ("Mais buscados")
├── sort_order      int         — ordenação no menu/listagens
│   ── colunas SEO/conteúdo (migration 20260609120000) ──
├── slug            text unique not null — segmento da URL /destinos/<slug>
├── seo_label       text|null   : rótulo de SEO na ordem de busca ("Aeroporto Curitiba, Afonso Pena (CWB)")
├── meta_title      text|null   : override do <title>/og:title; vazio usa o seo_label
├── meta_description text|null  — meta description / og:description
├── intro           text|null   — corpo da página; parágrafos separados por linha em branco
├── hero_image_url  text|null   — imagem de topo (opcional; ver procedencia-imagens.md)
├── is_published    bool not null default true — controla visibilidade pública/SSG
└── created_at, updated_at, deleted_at
```

**Slug.** Único (`destination_slug_key`). Backfill na migration a partir de `slugify(name)`
com desempate por sufixo `-2`/`-3` em colisões. Um trigger `destination_set_slug_trg`
(BEFORE INSERT) preenche o slug a partir do nome quando vier vazio — assim o `seed.sql`
e inserts manuais sem slug continuam funcionando. Índice `destination_published_idx
(is_published, sort_order)` para o caminho de leitura pública.

### RLS

| Política | Regra |
|---|---|
| `destination_select` | `SELECT USING (true)` — leitura pública (catálogo é informação pública). |
| `destination_admin_write` | `ALL USING/WITH CHECK is_hub_admin()` — só `hub_admin` cria/edita/exclui. |

> `is_published` **não** é filtrado na RLS — a policy de leitura é `true`. A exclusão de
> rascunhos do público é feita na **camada de query** (`.eq("is_published", true)` nos
> fetchers públicos e no `getStaticPaths`), não na RLS. Isso é intencional: o Manager
> (hub_admin) precisa enxergar rascunhos pela mesma policy.

## Rotas e UI

| Rota | Shell / Role | Descrição |
|---|---|---|
| `/destinos` | `ConsumerAppShell` (público) | **Índice** de destinos (`src/routes/destinos.tsx`). Página-hub que lista os destinos publicados (populares + demais), com link interno para cada `/destinos/<slug>` — alvo do breadcrumb e ponto de descoberta para o crawler. SSG via `loader` (`destinosLoader`). |
| `/destinos/:slug` | `ConsumerAppShell` (público) | Página de conteúdo SEO. SSG: `getStaticPaths` busca slugs publicados; `loader` busca o destino por slug+publicado. |
| `/manager/destinations` | `ManagerLayout` / `hub_admin` | Lista + criar/editar/excluir destinos (`DestinationForm`). |

- **Página pública** (`src/routes/destino.tsx`): `<Helmet>` com title/description (fallbacks),
  canonical e og para `<SITE_URL>/destinos/<slug>` (host de `@/lib/site`); três blocos **JSON-LD**
  (`destinationSchema` → `@type: Place`, `breadcrumbSchema`, `faqSchema`); H1
  "Estacionamento <seo_label sem o código>" (ver "Estrutura de palavra-chave" abaixo); `intro` dividido em parágrafos; hero opcional;
  **lista de estacionamentos** via `useSearchResults({ dest: code, … })` (próximos 7 dias,
  ordenado por preço) — o Edge `search` restringe ao destino pelo vínculo
  `location.destination_id` (DAT-04), listando só os lotes **ancorados** àquele destino, não o
  catálogo inteiro; módulo **"Mais bem avaliados em <name>"** (PRD-08.6) — 2ª chamada de busca
  com `sort=rating_desc`/`min_rating`, filtrada por `review_count > 0` (`topRated()`), acima da
  lista geral e oculta sem dados; **FAQ em camadas** (`global + destination`, ADR-002) via
  `useFaqCombined({ destinationId })` — a Edge `get-faq` mescla e deduplica, e o `faqSchema`
  é montado do mesmo conjunto (um único `FAQPage`, respostas idênticas às visíveis); **mapa** do
  Google (Maps Embed API via `GoogleMapEmbed`) centrado em lat/lng, zoom 13 para pegar o entorno
  do aeroporto.

### Busca: destino é escopo (topo), sidebar refina

Modelo tipo Booking/Airbnb: o **destino é o escopo macro** da busca (escolhido no topo, no
combobox), e a **barra lateral refina dentro** do destino escolhido. O catálogo de destinos vive
**só no autocomplete** (`DestinationCombobox`), nunca como lista chapada na sidebar.

- **Busca no header (sticky)** — em páginas de consumer que **não** são a home, o `ConsumerTopbar`
  renderiza o **mesmo `SearchBarPill`** (variant `compact`) no centro, **persistente no scroll**
  (header `sticky`). Ele é semeado com o escopo da URL (`initialDest`/`initialFrom`/`initialTo`/
  `initialVehicle`; `key` força re-seed quando o escopo muda) e usa `preserveParams`, então re-buscar
  **mantém os filtros já aplicados** (estacionamento, comodidades, ordenação, categoria, distância) e só
  sobrescreve o escopo — lógica pura testada em `SearchBarPill.logic.ts` (`buildSearchParams`). Em
  mobile, o header mostra uma pill compacta que leva pra busca grande na home. Na home, a barra é o
  hero (`preserveParams` off, busca do zero); não há barra duplicada no corpo da `/search`. É a
  única forma de trocar destino — não há combobox de destino na sidebar.
- **Sidebar (`SearchFilters.tsx`)** — só refinamentos dentro do destino: **estacionamento** (faceta),
  **distância do destino**, **comodidades**, **categoria** (pills). **Não** há filtro de destino na
  sidebar.
- **Estacionamento** — vem da faceta `facets.operators` (estacionamentos que de fato têm lote no resultado
  atual, com contagem). Antes listava **todas** as empresas ativas globalmente, então escolher uma
  estacionamento sem lote no destino zerava a busca; agora só aparece quem tem resultado. A seção só
  renderiza com 2+ estacionamentos.
- **`ResultsHeader`** vira só resumo (H1 "N vagas em <destino>" + datas/duração + ordenação) — sem
  editar busca (quem edita é o `SearchBarPill`). O `Hero` da home também semeia o pill com os params
  da URL, então qualquer link pra `/?dest=…&from=…&to=…` chega preenchido.

**Facetas (Edge `search`):** cada eixo é agregado considerando os demais filtros, mas **não a si
mesmo** (`facets.ts` · `aggregate*`/`filterBy*`), pra lista não colapsar ao selecionar. Estacionamento e
destino deixam de ser filtrados antes da precificação e recortam o resultado só no fim (passo
10b/10c de `supabase/functions/search/index.ts`). A faceta/param `destinations` (multi) continua
disponível na Edge (capacidade de backend / Public API), mas o front de consumidor não usa —
busca é escopada a **um** destino via `dest`.

**Ícones de tipo de destino:** registro central em `src/lib/destination-types.ts`
(`destinationTypeMeta` → `{ label, icon }` por tipo; `destinationTypeIcon`/`destinationTypeLabel`
com fallback `MapPin`). Fonte única usada pelo `DestinationCombobox` (autocomplete + header) — ao
adicionar um tipo novo ao enum `destination.type`, atualize esse mapa.

### FAQ por destino (GEO-07 · ADR-002)

A FAQ é resolvida por **escopo** e mesclada na renderização — **nunca duplicada**:

- **`global`** — vale pro hub inteiro (cancelamento, PIX, como reservar). Escrita uma vez,
  referenciada em toda página.
- **`destination`** — específica do aeroporto (traslado, voo atrasado, coberto/descoberto, valet
  vs self-park, segurança, gabarito). Camada adicionada por GEO-07.
- **`location`** — exceção da unidade, só quando o lote diverge do padrão do destino.

**Render:** página de destino = `global + destination`; detalhe da unidade
(`src/routes/listing.tsx`) = `global + destination + location` (+ `auto`), agrupado por
`FaqList`/`FaqList.logic`. A Edge `get-faq` resolve o `destination` da `location` via
`location.destination_id`, deduplica por pergunta mantendo a camada mais específica
(`location > destination > global`) e ordena por categoria → `sort_order`.

**Schema:** enum `faq_scope` inclui `destination`; `faq.destination_id` (FK → `destination`, nullable)
com `CHECK` de consistência por escopo. RLS: leitura pública de FAQ publicada; escrita de
`destination` é do `hub_admin`. Migration `20260621000000_faq_destination_scope.sql`.

**Páginas por pergunta (ago/2026):** toda FAQ `global`/`destination` publicada tem URL própria em
**`/faq/<slug>`** (answer-first), pré-renderizada no build com `FAQPage` + `BreadcrumbList` no HTML.
A estrutura da página segue o padrão de mercado e vai além: **palavra-chave de tráfego de
aeroporto no title e no primeiro parágrafo** ("estacionamento aeroporto guarulhos", helpers em
`faqPagina.logic.ts`), resposta rápida, `body_md` opcional, seção **"Quanto custa estacionar"**
com a tabela 1/7/15/30 diárias do índice de preços (dado do motor, o mesmo de `/precos/<slug>`),
"Como reservar com a Movepark", checklist do que conferir e **dois CTAs** (reservar no destino +
comparar preços). **Coerência pós-resposta (ago/2026):** aeroporto **sem parceiro precificado**
não promete reserva pela Movepark depois da resposta rápida: a intro não anuncia "preços logo
abaixo", o fechamento vira "Como escolher o estacionamento no <aeroporto>" (cotar direto, com a
página do destino como mapa da região), o checklist ganha variante sem vitrine e os CTAs viram
"Ver estacionamentos" + "Comparar preços em outros aeroportos" (`/precos/<slug>` não existe sem
unidade precificada). A mesma regra vale no gêmeo Markdown, e as respostas `destination` desses
aeroportos falam "confirme com o estacionamento" em vez de apontar pra página de oferta.
**Contexto por pergunta (ago/2026):** os blocos de preço do motor, "Como reservar/escolher" e o
checklist só renderizam em página de **categoria `pagamentos`** (onde preço é o assunto); nas
demais perguntas, quem sustenta a página depois da resposta rápida é o **`body_md` específico do
tema**. Todas as perguntas têm corpo: as 6 base de cada aeroporto (traslado, voo atrasado,
coberta/descoberta, valet, segurança, gabarito) com H2 de palavra-chave e fato real da praça
(nomes de lotes, preços coberta vs descoberta, tipo do oficial) mais links internos entre as
perguntas do mesmo aeroporto, e as 8 globais com o detalhe do produto (passo a passo, tolerâncias,
PIX). A intro tem três fechos, sempre batendo com o que a página renderiza: "preços e o passo a
passo" (pagamentos com parceiro), "o comparativo da região" (pagamentos sem parceiro) e "os
detalhes" (demais). A página do lote mapeado (`/estacionamentos/*`) mostra o FAQ do **aeroporto**
(escopo `destination`, nunca global: a global fala de reserva pela Movepark, que o lote não
oferece), com o mesmo `FAQPage` espelhando o visível. O `slug` é preenchido
por trigger no insert (`faq_slug_autofill`; FAQ de destino ganha o nome do aeroporto no slug) e é
**contrato de URL**: não muda quando a pergunta é editada. Migrations
`20260814145144_faq_slug_pages.sql` + `20260814145303_faq_slug_destination_suffix.sql`. O hub
`/faq` lista globais por categoria e uma seção por destino, com `ItemList` das páginas; o FAQ das
três superfícies sai no HTML do build (loaders SSG) e cada pergunta tem versão Markdown no mesmo
endereço via `Accept: text/markdown` (`scripts/generate-geo-artifacts.mjs`).

**Admin:** o **admin central de FAQ** (`/manager/faq`) é a fonte da `global` e lista todos os
escopos (filtro de escopo). A aba **FAQ** do admin do destino (`DestinationFaqDialog`) edita só as
`destination` daquele aeroporto e mostra a `global` como referência somente-leitura.

**Cobertura de conteúdo (ago/2026):** os **22 aeroportos** do catálogo têm pack `destination`
completo de **8 perguntas**: as 6 do padrão (traslado, voo atrasado, coberto/descoberto, valet vs
self-park, segurança, gabarito) mais duas de preço, **"Quanto custa estacionar no <aeroporto>?"**
(comparativo em tabela Markdown no `body_md`, com os principais estacionamentos da região, o
parceiro Movepark destacado em negrito e preço real do motor; concorrentes com valor público
pesquisado em ago/2026 e "Sob consulta" quando o lote não publica tabela) e **"Qual o
estacionamento mais barato perto do <aeroporto>?"**. Nos aeroportos sem parceiro, o comparativo
fecha com CTA de `/seja-parceiro`; nos com parceiro, com links pra `/precos/<slug>` e
`/destinos/<slug>`. O conteúdo mora no banco (admin de FAQ é a fonte); preço de concorrente é
datado no texto ("consultados em agosto de 2026") para não virar promessa congelada.
- **Índice** (`src/routes/destinos.tsx`): `<Helmet>` com title/description próprios,
  canonical/og para `<SITE_URL>/destinos` e dois blocos **JSON-LD**
  (`breadcrumbSchema` Início→Destinos e `itemListSchema` com a coleção de destinos); H1
  "Destinos atendidos pela Movepark"; grade de cards (populares + demais) linkando cada
  `/destinos/<slug>`. Existe para que o breadcrumb das páginas de detalhe aponte para uma
  URL real (não 404) e para dar ao crawler uma página de descoberta dos destinos.
- **Header do consumer** (`ConsumerTopbar`): dropdown **"Destinos"** com item topo
  "Ver todos os destinos" (→ `/destinos`) e submenus — `is_popular` sob "Mais buscados", o
  resto sob "Outros destinos". Some no mobile; escondido se não houver destinos.
- **Manager** (`src/routes/manager/destinations.tsx` + `DestinationForm`): tabela com
  status (Publicado/Rascunho), popular, ordem e link para a página pública; form com
  slug auto-derivado do nome, seletor de tipo, flags `is_popular`/`is_published` e o bloco
  de SEO (meta_title, meta_description, intro). O **hero** usa `ImageUploadField`
  (`@/components/shared/ImageUpload`) → `uploadDestinationImage(code, "hero", file)` sobe em
  `assets-public/destinations/<code>/…` (bucket OPS-05) e grava a URL em `hero_image_url`;
  também aceita colar URL. O envio fica travado até o `code` estar preenchido (define a pasta).
  Ver [storage-buckets.md](./storage-buckets.md).

## Acesso a dados

- `src/features/destinations/api.ts` — TanStack Query:
  - **público:** `useDestinationBySlug(slug)` (slug + `is_published`, `maybeSingle`).
  - **admin:** `useAdminDestinations()` (todos, por `sort_order`), `useCreateDestination`,
    `useUpdateDestination`, `useDeleteDestination` (soft via mutations; invalidam a key raiz).
- `src/features/search/api.ts` — `useDestinations()`/`usePopularDestinations()` passam a
  selecionar `slug` e filtrar `is_published = true` (alimentam home, busca e o menu do header).

## SSG / build

As páginas `/destinos/*` e o índice `/destinos` são **pré-renderizados no build**
(`vite-react-ssg`). Ao publicar/despublicar um destino, o efeito na malha de páginas
estáticas só aparece no **próximo build/deploy** — não é dinâmico em runtime.
`getStaticPaths` (`fetchAllDestinationPaths` em `routes.tsx`) só emite slugs com
`is_published = true`.

**Sitemap** (`vite.config.ts`): além das listagens `/p/...`, `getDestinationRoutes()`
adiciona `/destinos` e uma URL por destino publicado às `dynamicRoutes` do
`vite-plugin-sitemap` — sem isso o Google não descobre as páginas de destino pelo
`sitemap.xml`.

## Testes

| Camada | Arquivo | Cobre |
|---|---|---|
| Unitário (Vitest) | `src/lib/jsonld.test.ts` | `destinationSchema`: `@type: Place`, URL canônica `/destinos/<slug>`, address/geo, coalescing de `state`/`meta_description` nulos; `itemListSchema`: `@type: ItemList`, posições a partir de 1. |
| Componente (Vitest) | `src/routes/destinos.test.tsx` | Índice `/destinos`: H1, separação populares/outros e links internos para cada `/destinos/<slug>`; estado vazio sem destinos. |
| Unitário (Vitest) | `src/lib/destination-types.test.ts` | Registro central de tipos: ícone/label por tipo do enum e fallback (`MapPin`/code) para tipo desconhecido/nulo. |
| Componente (Vitest) | `src/features/search/SearchFilters.test.tsx` | Sidebar de busca: estacionamento vem da faceta (não global) com contagem, some com ≤1 opção, toggle dispara callback; sem seção de destino (destino é escopo, fica no header). |
| Edge (deno test) | `supabase/functions/search/facets.test.ts` | `aggregate*`/`filterBy*`: contagem, ordenação, descarte de destino nulo e independência de eixo (estacionamento reflete destino escolhido). |
| Banco / RLS (pgTAP) | `supabase/tests/destination.test.sql` | Leitura pública (anon lê publicado); escrita bloqueada para anon (42501) e customer (UPDATE filtrado pelo USING); `hub_admin` insere/edita. |

Ambos rodam no CI (`quality` → `test:unit`; `db` → `supabase test db` auto-descobre o
`*.test.sql`). Mudança em regra de destino → atualize esta spec no mesmo PR.

## Integração com o MCP (`MCP_Movepark_Hub`)

O servidor MCP da Movepark (hospedado no n8n) expõe ferramentas de leitura do catálogo
(`list_companies`, `get_locations`, `get_parking_types`, `get_faq`, `simulate_price`).
Com a entidade de destinos virando conteúdo de primeira classe, o MCP deve ganhar:

- **`list_destinations`** — lista destinos publicados (filtros opcionais por `type`/`is_popular`),
  retornando `code, name, short_name, slug, city, state, type, latitude, longitude`.
- **`get_destination`** — detalhe por `slug` ou `code` (inclui `intro`, `meta_*`, geo) +,
  opcionalmente, os estacionamentos próximos (reusando o `search`).

Fonte de verdade: tabela `public.destination` com `deleted_at is null and is_published = true`.

### SQL pronto para o workflow n8n (turnkey)

O MCP é um workflow n8n com um nó por tool (Postgres/Supabase → Respond). Para adicionar
as duas tools, replique o padrão das existentes (`list_companies` etc.) com estes SELECTs:

```sql
-- list_destinations  (params opcionais: type text, only_popular bool)
select code, name, short_name, slug, type, city, state, country,
       latitude, longitude, is_popular, sort_order
from public.destination
where deleted_at is null
  and is_published = true
  and ($1::text is null or type = $1)         -- type
  and ($2::bool  is null or is_popular = $2)  -- only_popular
order by is_popular desc, sort_order, name;

-- get_destination  (param: identifier text = slug OU code)
select code, name, short_name, slug, type, city, state, country,
       latitude, longitude, is_popular, sort_order,
       meta_title, meta_description, intro, hero_image_url
from public.destination
where deleted_at is null
  and is_published = true
  and (slug = $1 or code = $1)                -- identifier
limit 1;
```

> Ambas só expõem destinos publicados (`is_published = true`) — coerente com a página
> pública e o `getStaticPaths`. Para os estacionamentos próximos em `get_destination`,
> encadeie a Edge Function `search` passando `dest = code` (mesmo caminho da página).

## Estrutura de palavra-chave (title, H1, H2)

Medido no Search Console em 13/08/2026 (propriedade `sc-domain:movepark.co`, 3 meses,
4.260 cliques e 521.377 impressões):

| Padrão da consulta | Cliques | Impressões |
|---|---|---|
| `estacionamento aeroporto <X>` (colado) | 647 | 50.402 |
| `estacionamento <prep> aeroporto <X>` | 177 | 14.061 |
| consulta contendo "aeroporto" | 998 (40,6%) | 97.501 |
| "estacionamento" no singular | 1.480 (60,2%) | 127.017 |
| "estacionamentos" no plural | 71 (2,9%) | 5.473 |
| marca de parceiro (`virapark`, `aeropark`, `congonhas park`…) | 785 | 114.327 |

Daí as três regras, implementadas em [`src/lib/seo.ts`](../../src/lib/seo.ts) e travadas em
`src/lib/seo.test.ts`:

1. **Sem preposição entre "Estacionamento" e o lugar.** O bigrama colado vale 3,7x mais
   clique que a forma com preposição. Singular, nunca plural.
2. **A palavra "aeroporto" entra no rótulo**, porque ela aparece em 40,6% dos cliques e o
   H1 antigo ("Estacionamento em Afonso Pena") não a tinha.
3. **A segunda forma de chamar o aeroporto entra separada por vírgula**, e só quando tem
   volume: pelo menos 15% dos cliques do destino e no mínimo 50 cliques no período. Isso
   deu Afonso Pena (108 cliques em CWB), Campinas (109 em VCP) e Belo Horizonte (56 em CNF).

| Elemento | Forma | Exemplo (CWB) |
|---|---|---|
| `<title>` | `Estacionamento {seo_label} \| Movepark` | Estacionamento Aeroporto Curitiba, Afonso Pena (CWB) \| Movepark |
| H1 | `Estacionamento {seo_label sem código}` | Estacionamento Aeroporto Curitiba, Afonso Pena |
| H2 da lista | `Estacionamentos {primeira forma + código}` | Estacionamentos Aeroporto Curitiba (CWB) |
| H2 do traslado | `Traslado até o {primeira forma}` | Traslado até o Aeroporto Curitiba |
| H2 do mapa | `Onde fica o {primeira forma}` | Onde fica o Aeroporto Curitiba |
| H2 da FAQ | `Perguntas frequentes: estacionamento {primeira forma}` | Perguntas frequentes: estacionamento Aeroporto Curitiba |

Os H2 variam a forma de propósito. Repetir o bigrama exato em título, H1 e todos os H2 da
mesma página é sinal de spam, não de relevância.

**Destino que não é aeroporto** (`type != 'airport'`) não recebe a palavra "aeroporto", e os
H2 de traslado e mapa voltam ao texto genérico, porque o artigo mudaria de gênero
("Traslado até o Rodoviária Tietê" está errado). O Tietê também trocou de rótulo: é buscado
como "rodoviária tietê" (2.842 impressões somadas), não como "terminal rodoviário".

**Página da unidade** (`/p/...`) segue a mesma fonte, com a marca na frente:

| Elemento | Forma | Exemplo |
|---|---|---|
| `<title>` | `{Empresa}: Estacionamento {primeira forma}, {tipo de vaga} \| Movepark` | Abbapark: Estacionamento Aeroporto Curitiba, Vaga Coberta \| Movepark |
| H1 | `{Empresa} · {tipo de vaga} · {primeira forma}` | Abbapark · Vaga Coberta · Aeroporto Curitiba |

O tipo de vaga no H1 é o que faz as três páginas da mesma unidade (`covered`, `premium`,
`uncovered`) deixarem de ter cabeçalho idêntico. Elas continuam indexáveis, cada uma com
canonical própria, e por isso precisam de conteúdo de fato diferente (preço, capacidade e
regras do tipo). Enquanto isso não existir, elas seguem competindo entre si.

Migration: `20261019090000_destination_seo_label.sql`.

## A lista de estacionamentos no HTML do build

Medido em 13/08/2026: `dist/destinos/aeroporto-afonso-pena.html` saía com **zero** ocorrências
de `/p/`, nenhum nome de unidade, nenhum preço e 41 skeletons. A lista vinha de
`useSearchResults`, que é fetch no cliente. A página que disputa "estacionamento aeroporto
curitiba" (12.321 impressões no trimestre) chegava ao crawler sem oferta e sem um único link
interno para as unidades. Os lotes mapeados, esses já saíam, porque o `destinoLoader` já os
buscava.

O corte que resolve é entre **fato da unidade** e **o que depende de data**:

| Sai no HTML do build | Continua vindo da busca no cliente |
|---|---|
| a unidade existe naquele destino | vaga restante |
| link para `/p/...`, nome, tipo de vaga | esgotado |
| endereço, distância, terminal mais próximo | escassez ("últimas vagas") |
| nota e número de avaliações | total da janela escolhida |
| preço "a partir de" e estadia mínima | sinal de alta demanda |

A disponibilidade nasce **neutra** na semente. Afirmar "resta 1 vaga" num HTML congelado vira
mentira na hora seguinte, e ADR-009 não permite renderizar promessa que a unidade não
sustenta.

> **O `ItemList` deixou de ser só nome e URL em 17/08/2026.** Enquanto a página não mostrava
> preço, afirmar preço no JSON-LD descrevia algo invisível, e é isso que o Google trata como
> spam. Com a tabela de preços saindo no HTML do build (seção abaixo), o schema passou a
> espelhá-la: `Product` + `AggregateOffer` por vaga com preço na matriz, `ParkingFacility` seco
> por lote mapeado. O que continua fora é `availability`: `InStock` é promessa de vaga
> garantida, e em `checkout_mode = external` quem controla o estoque é o parceiro (ADR-009).
> A **lista** sai da vitrine, não da matriz, para o schema seguir descrevendo a tela quando o
> motor não responde no build; nesse caso o item fica sem `offers`, em vez de chutar preço.

Implementação: `fetchDestinationUnits` em [`src/features/destinations/api.ts`](../../src/features/destinations/api.ts)
(duas leituras: `location_parking_type` com a tabela de preço aninhada, e a RPC
`locations_proximity` para distância, que é PostGIS por ADR-001), mapeada por
[`units.logic.ts`](../../src/features/destinations/units.logic.ts) e semeada no `destinoLoader`.

Três armadilhas que custaram tempo e estão travadas em teste:

1. **Não existe FK direta de `location_parking_type` para `parking_type`.** O caminho passa por
   `company_parking_type`; embutir direto devolve `PGRST200`.
2. **`pricing_rule` tem duas FKs para `location_parking_type`** (a própria e `surcharge_source_id`),
   então o hint `!location_parking_type_id` é obrigatório.
3. **`defaultWindow()` roda no build.** Se `from`/`to` entrarem no href do card, todo link
   publicado aponta para um D+7 do dia do deploy e envelhece até o build seguinte. A janela só
   entra depois que a busca do cliente responde.

**Destino sem unidade vendável** (Recife, Navegantes, Confins) passa a sair com a frase
"Ainda não temos reserva online em ...". Antes ia com 41 skeletons, o que não diz nada a
ninguém. O loader já sabe no build que ali não há reserva online, então o HTML pode dizer.

**Fica de fora da semente** quem usa estratégia de preço que o `calcFromPrice` não cobre
(`tiered_progressive`, `surcharge`, `monthly_remainder`): somar faixas fora do motor viraria
preço errado no card. Hoje são 3 regras no banco. Essas unidades continuam aparecendo pela
busca no cliente, só não estão no HTML estático.

## Quanto custa e distância no HTML do build (17/08/2026)

Auditoria de 17/08/2026 comparando `/destinos/aeroporto-de-viracopos` com a página
equivalente de um comparador concorrente (`xpark.ai/aeroportos/estacionamento-aeroporto-viracopos`):

| | Movepark (antes) | Concorrente |
|---|---|---|
| Palavras visíveis | 1.249 | 2.319 |
| Tabelas `<table>` | **0** | 2 |
| Onde estava o preço | dentro de uma resposta de accordion | duas tabelas comparativas |
| Distância por unidade | só nos lotes mapeados | tabela própria |
| Procedência do número | ausente | fonte e data por linha |
| Links internos no build | 45, **menos os 6 de cross-link** | 15 |

A consulta que a página disputa ("estacionamento aeroporto X") é consulta de **preço**, e a
página respondia em prosa. Quem compara em tabela, com número e data, é citado por LLM; quem
descreve não é.

O que passou a sair no HTML pré-renderizado:

1. **Tabela de preços** (`DestinationPriceTable`), a matriz 1/7/15/30 diárias por vaga de
   parceiro, com total, valor por diária, balcão riscado, economia em % e a marcação de menor
   preço por coluna. Antecedida da resposta rápida (menor preço por duração) e da frase de
   permanência, que mede no dado real quanto a diária cai da estadia curta para a longa.
2. **Ranking de distância** (`DestinationProximity`), parceiro e lote mapeado na mesma régua,
   ordenados pela distância **medida com PostGIS** (ADR-001). O concorrente digita a distância
   à mão e erra: para a mesma unidade em Viracopos ele publica 4,5 km onde a nossa geodésica
   mede 1,3 km. Só entra quem tem medida.
3. **Meta description com número**, derivada do dado (`destinationMetaDescription`). A antiga
   não trazia um único valor ("Compare preços e reserve a sua vaga"). `meta_description`
   escrita à mão no banco continua mandando.
4. **Cross-link entre destinos**, que dependia de `usePublishedDestinations` (hook de cliente)
   e por isso **não existia** no HTML do build. Eram 6 links internos por página que nenhum
   crawler via. Passou para o `destinoLoader`; o hook segue cobrindo a navegação no cliente.

**Os números não podem divergir de `/precos/<slug>`.** `buildDestinoPrices` compõe em cima de
`buildMatrix` e `destinationSummary` do índice de preços, sem reimplementar conta nenhuma
(`src/features/destinations/destinoPrices.logic.ts`). O layout das duas páginas difere de
propósito; a aritmética é a mesma função. A auditoria do concorrente mostra por que isso
importa: na mesma página dele, a tabela dizia R$ 25,00/dia para o estacionamento oficial e a
FAQ dizia R$ 75,00/dia, e a data de coleta aparecia como "junho" em três lugares e "julho" em
outros dois.

**Procedência.** A nota sob a tabela carimba "conferido no motor de reservas em <data>" a
partir de `generatedAt` (carimbo do loader) e a tabela de parceiro mais recente a partir de
`price_updated_at`, com link para `/metodologia`. A frase **não** promete "o valor cobrado no
checkout": em unidade com `checkout_mode = external` quem cobra é o parceiro, e prometer o
checkout da Movepark ali seria promessa de transação sem capacidade (ADR-009). Há teste que
falha se essa frase reaparecer.

**Custo no build.** O `destinoLoader` chama `fetchPriceIndex()`, que é single-flight com cache
de 5 minutos: os 27 destinos compartilham **uma** chamada da RPC. Sem isso seriam 27
simultâneas, e o papel `anon` derruba a query por statement timeout.

**Gêmeo Markdown.** `scripts/generate-geo-artifacts.mjs` passou a emitir a mesma matriz por
operadora (antes só o "a partir de" por duração) e a lista de distância, com a linha de
procedência e o link de metodologia. Os lotes mapeados entram via `destination_prospect_cards`,
em blocos de 6 pelo mesmo motivo de timeout.

| Camada | Arquivo | O que trava |
|---|---|---|
| Unitário (Vitest) | `src/features/destinations/destinoPrices.logic.test.ts` | queda por permanência (inclusive o caso "sem desconto", que tem que calar), paridade do resumo com `destinationSummary`, meta description com número e corte em 160 sem quebrar palavra, ranking de distância (ordem, dedupe por location, lote sem medida no fim da lista, endereço e nota que a lista absorveu do card) |
| Componente (Vitest) | `src/routes/destino.test.tsx` | a `<table>` existe com o cabeçalho do período ativo e os demais escondidos por classe (não desmontados), total, valor por diária, balcão e economia; a frase de permanência; a nota de procedência com as duas datas e sem "cobrado no checkout"; a seção some sem parceiro precificado; o ranking de distância na ordem certa; a meta description com número; `AggregateOffer` presente com matriz e ausente sem, e `InStock` nunca emitido em checkout externo |

---

## Redesenho da página (19/08/2026)

Implementa o desenho `Página de destino Movepark.dc.html` do Claude Design (projeto
`51065888-8930-4272-950c-7612f726c3dc`). Mudou o **desenho e o inventário de seções**; o
motor de preço, a Edge de busca, a FAQ em camadas e o JSON-LD continuam iguais.

A página trocou de faixa: era **página de conteúdo** (cabeçalho branco, `max-w-5xl`, foto no
meio do texto) e virou **hero de marketing**, na tabela da skill `harmonizar-paginas`. A
justificativa é a mesma da `/sobre` e da `/como-funciona`: quem abre `/destinos/<slug>` está
decidindo **onde deixar o carro**, e a foto do aeroporto é o que responde "é aqui mesmo?" antes
de qualquer parágrafo. Com o cabeçalho branco a página abria com um h1 solto e a foto só
aparecia depois de rolar.

| Antes | Agora |
|---|---|
| Cabeçalho branco, container 1024, foto abaixo do texto | Hero sangrado com a foto, trilha e h1 em branco sobre ela, container 1280 |
| Preço "a partir de" em uma linha de texto | Cartão flutuante no hero, com o "a partir de" e o CTA para a vitrine (`#parceiros`) |
| Intro corrida | Intro em duas colunas, com a ficha do destino (terminais, quantos parceiros, quantos mapeados, distância mais curta, diária a partir de) |
| Bloco "Mais bem avaliados" + vitrine | Vitrine única |
| Cards de lote mapeado + lista de distância | Lista de distância única, com selo por linha |
| Tabela de preço com 4 colunas de duração | Seletor de período + duas colunas (total e por diária) |
| Seções empilhadas no mesmo fundo | Faixas alternadas (`bg-surface-soft`) em preço, traslado e FAQ |

Três decisões que valem além do layout:

1. **"Mais bem avaliados" saiu.** Ele repetia de 1 a 4 cards da vitrine logo abaixo, e a nota
   já aparece dentro de cada `ResultCard`. Em catálogo pequeno (GRU tem 2 parceiros e 6 vagas)
   os dois blocos mostravam praticamente o mesmo conjunto. `pickTopRated` e a segunda chamada
   da Edge `search` (`sort=rating_desc`) saíram junto, o que é também uma requisição a menos
   por página.
2. **Lote mapeado aparece uma vez só**, na lista de distância. Ver a atualização de 19/08/2026
   em [`lote-mapeado-vitrine.md`](lote-mapeado-vitrine.md).
3. **O seletor de período não desmonta os outros períodos.** Eles ficam no DOM com a classe
   `hidden`, pelo mesmo motivo da `/precos`: a página é pré-renderizada num período só, e
   desmontar os demais tiraria a maior parte dos preços do HTML que buscador e crawler de IA
   leem. É **classe**, não o atributo `hidden`, porque o atributo perde para o
   `tablet:table-cell` que o layout responsivo aplica dentro de media query.

**O que o loader passou a trazer:** `destination_point` (os terminais, para a ficha) e o
"a partir de" de cada destino irmão, calculado por `destinationFromPrice` sobre o índice de
preço que o loader **já** buscava. Nenhuma chamada nova ao banco por página.

**Traslado.** O bloco só renderiza onde existe parceiro. Em destino que a Movepark ainda está
mapeando ele descreveria um serviço que a página não entrega, e "você deixa o carro no
estacionamento parceiro" não teria parceiro para apontar. Onde entra, descreve o modelo sem
prometer preço nem inclusão na diária, porque isso varia por unidade (ADR-009). A abertura do
bloco fala de "quem oferece traslado", não dos parceiros no plural: traslado é comodidade de
cada unidade.

**Rolagem suave.** O CTA do hero e o atalho do estado vazio são âncoras na própria página. O
`scroll-behavior: smooth` entrou em `src/index.css`, dentro de
`@media (prefers-reduced-motion: no-preference)`, e vale para o site inteiro.
