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
├── meta_title      text|null   — <title>/og:title (fallback: "Estacionamento em <name> | Movepark")
├── meta_description text|null  — meta description / og:description
├── intro           text|null   — corpo da página; parágrafos separados por linha em branco
├── hero_image_url  text|null   — imagem de topo (opcional)
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
  canonical e og para `https://hub.movepark.co/destinos/<slug>`; três blocos **JSON-LD**
  (`destinationSchema` → `@type: Place`, `breadcrumbSchema`, `faqSchema`); H1
  "Estacionamento em <short_name ?? name>"; `intro` dividido em parágrafos; hero opcional;
  **lista de estacionamentos** via `useSearchResults({ dest: code, … })` (próximos 7 dias,
  ordenado por preço) — o Edge `search` restringe ao destino pelo vínculo
  `location.destination_id` (DAT-04), listando só os lotes **ancorados** àquele destino, não o
  catálogo inteiro; módulo **"Mais bem avaliados em <name>"** (PRD-08.6) — 2ª chamada de busca
  com `sort=rating_desc`/`min_rating`, filtrada por `review_count > 0` (`topRated()`), acima da
  lista geral e oculta sem dados; **FAQ em camadas** (`global + destination`, ADR-002) via
  `useFaqCombined({ destinationId })` — a Edge `get-faq` mescla e deduplica, e o `faqSchema`
  é montado do mesmo conjunto (um único `FAQPage`, respostas idênticas às visíveis); **mapa** OSM
  embed centrado em lat/lng.

### Busca: destino é escopo (topo), sidebar refina

Modelo tipo Booking/Airbnb: o **destino é o escopo macro** da busca (escolhido no topo, no
combobox), e a **barra lateral refina dentro** do destino escolhido. O catálogo de destinos vive
**só no autocomplete** (`DestinationCombobox`), nunca como lista chapada na sidebar.

- **Trocar destino no header** (`src/features/search/ResultsHeader.tsx`): além do H1 "N vagas em
  <destino>", há um `DestinationCombobox` compacto que reescopa a busca (atualiza o param `dest`)
  sem voltar pra home. Mostra o destino atual com o **ícone do tipo** (registro central) e abre o
  catálogo buscável pra trocar.
- **Sidebar (`SearchFilters.tsx`)** — só refinamentos dentro do destino: **operadora** (faceta),
  **distância do destino**, **comodidades**, **categoria** (pills). **Não** há filtro de destino na
  sidebar.
- **Operadora** — vem da faceta `facets.operators` (operadoras que de fato têm lote no resultado
  atual, com contagem). Antes listava **todas** as empresas ativas globalmente, então escolher uma
  operadora sem lote no destino zerava a busca; agora só aparece quem tem resultado. A seção só
  renderiza com 2+ operadoras.
- **Editar datas** ("Editar"/"Escolher datas" no header) volta pra home com os params na URL; o
  `Hero` semeia o `SearchBarPill` com `dest`/`from`/`to` da URL pra não perder a busca.

**Facetas (Edge `search`):** cada eixo é agregado considerando os demais filtros, mas **não a si
mesmo** (`facets.ts` · `aggregate*`/`filterBy*`), pra lista não colapsar ao selecionar. Operadora e
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
`destination` é do `hub_admin`. Migration `20260619000000_faq_destination_scope.sql`.

**Admin:** o **admin central de FAQ** (`/manager/faq`) é a fonte da `global` e lista todos os
escopos (filtro de escopo). A aba **FAQ** do admin do destino (`DestinationFaqDialog`) edita só as
`destination` daquele aeroporto e mostra a `global` como referência somente-leitura.

**Pendência de conteúdo:** as FAQs `destination` por aeroporto (Viracopos primeiro) saem de
`gestao/conteudo-onda1.md` (conteúdo manual Pedro/Peu + parceiro) — ainda não no repo. A
engenharia (schema + render + admin + JSON-LD) está pronta para recebê-las.
- **Índice** (`src/routes/destinos.tsx`): `<Helmet>` com title/description próprios,
  canonical/og para `https://hub.movepark.co/destinos` e dois blocos **JSON-LD**
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
| Componente (Vitest) | `src/features/search/SearchFilters.test.tsx` | Sidebar de busca: operadora vem da faceta (não global) com contagem, some com ≤1 opção, toggle dispara callback; sem seção de destino (destino é escopo, fica no header). |
| Edge (deno test) | `supabase/functions/search/facets.test.ts` | `aggregate*`/`filterBy*`: contagem, ordenação, descarte de destino nulo e independência de eixo (operadora reflete destino escolhido). |
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
