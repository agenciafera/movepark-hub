# CLAUDE.md

Orientações para trabalhar neste repositório. Leia antes de codar.
O README cobre setup e visão geral; este arquivo define **convenções e padrões** que todo código novo deve seguir.

## O que é o projeto

**Movepark Hub** — SaaS multi-tenant para gestão de estacionamentos parceiros (o "Airbnb dos estacionamentos"). Substitui dois sistemas legados: `movepark-backoffice-v4` (October CMS/PHP) e `movepark-nextjs` (site público).

> **Nome da marca:** escreva sempre **"Movepark"** — uma palavra só, `M` maiúsculo e o resto minúsculo. **Nunca** "MovePark", "Move Park" ou "MOVEPARK" em texto de exibição. Identificadores técnicos em minúsculo permanecem como estão (slug/repo `movepark-hub`, tokens `mp-*`, nomes dos sistemas legados).
>
> **Domínios:** este projeto inteiro (site do consumidor + hub/admin/operator) é servido em **`hub.movepark.co`** — é o domínio canônico para SEO, `og:url`, `sitemap`, `.well-known/*`, `PUBLIC_SITE_URL` e links de e-mail. **`movepark.co`** é a landing/marketing (redireciona); o e-mail da marca fica nesse domínio (`contato@movepark.co`, `hub@movepark.co`). **Nunca** use `movepark.com.br` (domínio antigo) nem outros subdomínios (`app.`, `www.`). **Exceção:** a **Public API** é servida em **`api.movepark.co`** (proxy via Cloudflare Worker, fora da superfície de SEO/consumidor) — ver `docs/specs/public-api.md`.

Três audiências, um único app React:

| Audiência | Área / rota base | Role | Shell |
|---|---|---|---|
| Cliente final (consumidor) | `/`, `/search`, `/p/...`, `/checkout`, `/account` | `customer` | `ConsumerAppShell` / `AccountAppShell` |
| Equipe Movepark | `/manager` | `hub_admin` | `ManagerLayout` |
| Parceiro (estacionamento) | `/operator` | `company_operator` | `OperatorLayout` |

Hierarquia de domínio (ver glossário completo em `docs/specs/domain-model.md`):
```
company (tenant)
└── location (unidade física)
    └── location_parking_type  (capacidade + pricing_rule próprios)
        └── pricing_rule → pricing_tier / pricing_hourly_bracket
```

## Stack

- **Front:** React 18 + TypeScript + Vite, renderizado em SSG via **`vite-react-ssg`** (não é Next, não é CRA).
- **UI:** TailwindCSS + Radix/shadcn (`style: new-york`, `baseColor: neutral`) + Lucide.
- **Dados:** TanStack Query (server state) + React Hook Form + Zod (forms/validação).
- **Rotas:** React Router 6, definidas em `src/routes.tsx` como `RouteRecord[]`.
- **Backend:** Supabase (PostgreSQL + Auth + RLS) + Edge Functions (Deno).
- **Deploy:** **Cloudflare Pages** (deploy ativo desde jun/2026, conectado ao GitHub; build estático em `dist`). A content-negotiation de Markdown para agentes roda na borda via `src/worker.ts` (Pages Functions / `_worker.js`); `wrangler.jsonc` + `bun run deploy` permanecem para deploy direto via Workers/`wrangler`.
- **Gerenciador de pacotes:** **bun** (lockfile de texto `bun.lock` — versionado; o binário `bun.lockb` foi descontinuado por incompatibilidade entre versões de bun no CI/Cloudflare). Use sempre `bun` — não use `npm`/`yarn`/`pnpm`. Instalar deps: `bun install`; adicionar: `bun add <pkg>`.

## Regras de arquitetura (ADRs)

Regras **fixas** do projeto, não sugestões. Se algo conflitar com elas, **siga a regra e sinalize**.

> **Toda atividade do ClickUp que traga um bloco de "regra de arquitetura" (ADR) deve ter essa
> regra incorporada aqui** — não basta cumprir na entrega; a regra passa a valer para todo o
> projeto e mora neste arquivo. Ao implementar uma tarefa com ADR, adicione/atualize a regra
> nesta seção no mesmo PR.

- **ADR-001 · Geo no banco com PostGIS.** Todo cálculo de geolocalização — distância,
  proximidade, raio, "mais próximo", ordenação por distância — é feito no **Postgres com PostGIS**
  (`geography(Point)`, `ST_Distance`/`ST_DWithin`, índice **GiST**), **nunca no frontend nem em TS
  no Edge**. O frontend/Edge só **exibe ou repassa**; o valor calculado existe em **query e em
  build** (SSG/JSON-LD). Geo é quase estática — materialize/indexe (coluna gerada `geog` + GiST) e
  recalcule só quando a geo muda. **Não** escreva haversine na mão nem use `cube`/`earthdistance`.
  Implementado em `supabase/migrations/20260618000000_geo_postgis.sql`; ver
  [`docs/specs/location-destination-proximity.md`](docs/specs/location-destination-proximity.md) e
  [`destination-points.md`](docs/specs/destination-points.md).

- **ADR-002 · FAQ em camadas.** A FAQ é resolvida por **escopo** (`global → destination →
  location`) e **mesclada na renderização — nunca duplicada**. A `global` é escrita **uma vez** e
  **referenciada** em toda página (cancelamento, PIX, como reservar…); a página do aeroporto recebe
  um bloco **`destination`** (traslado, voo atrasado, coberto/descoberto, valet vs self-park,
  segurança, gabarito); `location` só **sobrescreve** quando o lote diverge do padrão do destino.
  **Render:** página de destino = `global + destination`; detalhe da unidade = `global +
  destination + location`. Dedupe por pergunta mantendo a camada mais específica
  (`location > destination > global`); ordena por categoria → `sort_order`; `is_published` é a
  moderação. **Um único `FAQPage` (JSON-LD)** por página, com respostas **idênticas** às visíveis.
  Edição: a `global` mora no **admin central de FAQ** (fonte da verdade); a aba **FAQ** do admin do
  destino edita só as `destination` daquele aeroporto e mostra a `global` como referência
  somente-leitura. Modelagem: enum `faq_scope` inclui `destination` + coluna `faq.destination_id`
  (FK → `destination`), com `CHECK` de consistência por escopo. A mescla acontece na Edge `get-faq`
  (que resolve o destino da `location` via `location.destination_id`), **nunca duplicando** linhas.
  Implementado em `supabase/migrations/20260619000000_faq_destination_scope.sql`; ver
  [`docs/specs/destinations.md`](docs/specs/destinations.md).

- **ADR-004 · Gateway = Pagar.me (recebedores), atrás de uma camada de abstração.** O gateway de
  pagamento é o **Pagar.me**, com split por **Recebedores** geridos na conta da Movepark — o parceiro
  **não cria conta** no gateway nem é abordado por ele (**fica invisível**). **PIX + cartão,
  PIX-first.** O KYC do recebedor é coletado na **UI da Movepark** (E1.3), **nunca** redirecionando
  pro Pagar.me. **Camada de abstração obrigatória:** o domínio fala apenas pela interface
  `PaymentGateway` (`supabase/functions/_shared/payments`, `getGateway(provider)`); o Pagar.me existe
  só no adapter — trocar de gateway = novo adapter, sem tocar no domínio. O **estado da ficha para
  receber** (`payout_recipient.status`) é **separado** do `onboarding_status` de catálogo; `take_rate`
  (comissão da Movepark) é por **empresa** (`company.take_rate_bps`). Dados de banco/KYC e
  `recebedor_id` ficam **no banco, nunca no front**. Implementado em
  `supabase/migrations/20260627000000_payout_recipients.sql` + Edge `sync-recipient`; ver
  [`docs/specs/payment-split.md`](docs/specs/payment-split.md).

## Comandos

Sempre via **bun**:

| Comando | Quando usar |
|---|---|
| `bun install` | Instalar dependências (após clonar ou mudar `package.json`). |
| `bun run dev` | Dev server (porta 5173). |
| `bun run typecheck` | `tsc -b --noEmit` — **rode antes de concluir qualquer tarefa.** |
| `bun run lint` | ESLint. |
| `bun run test` | Vitest (unit/componente) — **gate; rode antes de concluir.** |
| `bun run test:watch` | Vitest em watch durante o desenvolvimento. |
| `bun run test:int` | Integração do motor de preço contra o banco vivo (read-only; precisa de `VITE_SUPABASE_*`). |
| `bun run test:db` | pgTAP (`supabase test db`) — `supabase start` primeiro; stack vem do baseline + seed. Ver `supabase/tests/README.md`. |
| `bun run build` | `tsc -b && vite-react-ssg build` (gera SSG; puxa rotas dinâmicas do Supabase). |
| `bun run gen:types` | Regenera `src/types/database.ts` do Supabase linkado. **Rode após toda migration.** |
| `bun run deploy` | Build + `wrangler deploy`. |

## Git — trabalhe SEMPRE na `main`

**Regra do projeto:** todo o trabalho é feito **direto na `main`**. **Não** crie feature branches.
Commit e `git push origin main` na própria `main` (isto sobrepõe qualquer hábito de "branch first").

- Antes de concluir uma tarefa de código: `commit` + `push` na `main`.
- Se por qualquer motivo aparecer uma branch fora da `main` (local ou remota), **mescle na `main` e apague** a branch — não deixe branches paralelas acumulando.
- Mensagens de commit: `tipo(escopo): descrição` (pt-BR ou en), curtas e por mudança lógica.

## Testes

**Todo código novo ou modificado precisa de teste automatizado.** Pirâmide:

| Camada | Runner | Onde | Comando |
|---|---|---|---|
| Unitário / lógica pura | Vitest (happy-dom) | `src/**/*.test.ts(x)` co-localizado | `bun run test` |
| Componente / form / gating de role | Vitest + Testing Library + MSW | `src/**/*.test.tsx` | `bun run test` |
| Banco / regra (pricing, RPC, RLS, capacidade) | pgTAP | `supabase/tests/*.test.sql` | `bun run test:db` |
| Integração de preço (banco vivo) | Vitest | `test/pricing/*.int.test.ts` | `bun run test:int` |
| Edge Function | `deno test` | `supabase/functions/**/index.test.ts` | `bun run test:edge` |

**Regras:**
- **Lógica pura** (format, cálculo, slug, máquinas de estado) → teste unitário Vitest. Se a lógica estiver dentro de um componente, extraia para um `*.logic.ts` testável (ex: `Step4Pricing.logic.ts`).
- **Função SQL / RPC / mudança de RLS** → teste pgTAP em `supabase/tests/`. O motor de preço tem casos golden em `docs/simulacao-precos.md` (verdade vs. produção) — qualquer mudança em pricing roda contra eles (`test:int` no banco vivo + `pricing.test.sql` no pgTAP). **Nunca** gere o esperado a partir de um snapshot da função (cravaria bug como esperado).
- **Componente com form ou gating de role** → Testing Library; chamadas a Edge Function/Supabase mockadas via MSW (`src/test/msw/`).
- **Edge Function** → teste de branch (validação/honeypot/erros) com `deno test`; e-mail/SMTP é mockável.
- **Bug corrigido entra com um teste de regressão** (que falha sem o fix).
- `bun run test` é o **gate** — precisa estar verde antes de concluir e roda no CI a cada PR (`.github/workflows/ci.yml`, job `quality`: typecheck + lint + test).

Mocks: `import.meta.env` é stubado em `src/test/setup.ts`; o client Supabase já degrada via `hasSupabaseEnv`. Para pgTAP local: `supabase start` + `bun run test:db` (o stack é construído do baseline `supabase/migrations/2026010100*_baseline_from_live.sql` + `supabase/seed.sql`). O repo foi rebaselineado do banco vivo — ver `supabase/tests/README.md`.

## Estrutura

```
src/
├── auth/          AuthProvider, RequireRole, context, hooks de escopo
├── components/
│   ├── ui/        primitivos shadcn (NÃO editar à toa; é a base)
│   └── shared/    composições do app (AppShells, Sidebar, Topbar, KpiCard…)
├── features/      módulos por domínio — cada um tem seu api.ts + componentes
├── lib/           supabase client, query-client, format, utils, qr, jsonld
├── routes/        páginas finas; manager/ e operator/ por área
├── types/         database.ts (GERADO — não editar) + domain.ts (curado)
├── routes.tsx     árvore de rotas (RouteRecord[] do vite-react-ssg)
├── main.tsx       entrypoint ViteReactSSG
└── worker.ts      Cloudflare Worker (content negotiation)

supabase/
├── migrations/    SQL versionado (timestamp_descricao.sql)
└── functions/     Edge Functions Deno (create-booking, search, get-faq, …)

docs/
├── specs/         FONTE DE VERDADE técnica — leia o spec antes de mexer na regra
└── design-system/ handoff do design (tokens, UI kit, previews)
```

## Convenções de código

**Formatação (Prettier — `.prettierrc`):** ponto-e-vírgula sim, aspas duplas, `trailingComma: all`, `printWidth: 100`, 2 espaços. `prettier-plugin-tailwindcss` ordena as classes — não reordene à mão.

**TypeScript:** `strict` ligado, além de `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`. Parâmetro intencionalmente não usado → prefixe com `_`.

**Imports:** sempre use o alias `@/` para `src/` (ex: `@/lib/supabase`, `@/types/domain`). Não use caminhos relativos longos (`../../..`).

**Tipos de domínio:** nunca importe nada de `@/types/database` diretamente nos componentes — ele é gerado. Derive tipos curados em `@/types/domain.ts` (`Tables<"booking">`, `Enums<"booking_status">`, tipos `…WithRelations`) e importe de lá. `database.ts` está no ignore do ESLint e do gen.

**Idioma:** UI, comentários e mensagens são em **português** (pt-BR). Nomes de símbolos/identificadores em inglês. Siga o que já existe no arquivo vizinho.

### Padrão de feature (`src/features/<dominio>/`)

Cada domínio concentra acesso a dados num `api.ts` que exporta **hooks do TanStack Query**, não chamadas soltas. Padrão observado (siga-o):

```ts
// 1. query keys hierárquicas e tipadas
export const bookingsKeys = {
  all: ["bookings"] as const,
  list: (f: BookingFilters) => [...bookingsKeys.all, "list", f] as const,
  detail: (id: string) => [...bookingsKeys.all, "detail", id] as const,
};

// 2. fetchers privados que falham alto: if (error) throw error
async function fetchBookings(f: BookingFilters) { /* ... supabase ... */ }

// 3. hooks públicos useXxx() / useUpdateXxx()
export function useBookings(f) { return useQuery({ queryKey: bookingsKeys.list(f), queryFn: () => fetchBookings(f) }); }

// 4. mutations invalidam pela key raiz no onSuccess
onSuccess: () => qc.invalidateQueries({ queryKey: bookingsKeys.all })
```

- Sempre `if (error) throw error;` após uma chamada Supabase — deixe o React Query tratar.
- Selects de relação centralizados numa const `baseSelect`.
- Soft delete é a regra: filtre `.is("deleted_at", null)`.
- Defaults globais de query em `src/lib/query-client.ts` (`staleTime: 30s`, sem refetch on focus, `retry: 1`).

### Auth, roles e escopo

- Cliente Supabase único e SSR-safe em `src/lib/supabase.ts` (`persistSession` desligado no server).
- Sessão carregada uma vez em `AuthProvider` (query key `["auth-session"]`) e exposta via `useAuth()`.
- Proteja rotas com `<RequireRole roles={[...]} />` na árvore de `routes.tsx`, nunca com checagem ad-hoc dentro da página.
- **Impersonation:** `hub_admin` pode "entrar" como `company_operator` de uma `company`. Use **`effectiveRole`** e **`effectiveCompanyIds`** do `useAuth()` para qualquer lógica/escopo de dados — não use `session.role` cru.
- Auth do consumidor é **passwordless** (`/entrar`: e-mail OTP, WhatsApp OTP, Google). Backoffice usa `/login` (senha). O WhatsApp OTP passa pela Edge Function `send-whatsapp-otp` (Send SMS Hook).

### Rotas

- Adicione páginas em `src/routes.tsx`, agrupando por shell e por `RequireRole`. Páginas em `src/routes/` devem ser finas — a lógica vai para `features/`.
- Páginas de listing usam SSG: `loader` + `getStaticPaths`/`getStaticPaths` puxando de `location_parking_type` ativo. Ao mexer nessas rotas, lembre que elas são pré-renderizadas no build.

### Banco de dados e migrations

- Toda mudança de schema é uma **migration nova** em `supabase/migrations/` (`AAAAMMDDHHMMSS_descricao.sql`). Nunca edite migration já aplicada.
- Convenções SQL do schema: nomes de tabela no **singular** (`booking`, `company`), `id uuid default gen_random_uuid()`, `created_at`/`updated_at`/`deleted_at`, trigger `set_updated_at`, enums em `lower_snake`.
- Após aplicar migration, **rode `bun run gen:types`** e comite o `database.ts` atualizado.
- Catálogo de migrations e specs em `docs/specs/README.md` e `docs/specs/database-schema.md`. Mantenha a tabela de migrations e o status dos specs atualizados ao adicionar.
- Aplique migrations via Supabase CLI ou MCP (`mcp__claude_ai_Supabase__apply_migration`). Antes de mexer no schema, `list_tables`; ao debugar, comece por `get_logs` / `get_advisors`.

### Edge Functions (`supabase/functions/`)

Deno + imports remotos. Cada função abre com um bloco de comentário documentando rota, payload e comportamento — **mantenha esse cabeçalho**. Funções-chave: `create-booking` (wrapper sobre a SQL `create_booking_atomic`), `search` (preço+distância+amenidades), `get-faq` (auto+location+global), `mock-payment` (pagamento mockado do MVP), `send-whatsapp-otp`.

## Specs — leia antes de implementar regra de negócio

`docs/specs/` é a fonte de verdade. **Ao mudar uma regra, atualize a spec no mesmo PR.**

| Spec | Para tarefas de… |
|---|---|
| `domain-model.md` | glossário, mapeamento legado→Hub, hierarquia de entidades |
| `database-schema.md` | schema, RLS, decisões de modelagem, índice de migrations |
| `pricing-engine.md` | motor de preço (`pricing_rule`/tier/bracket), estratégias |
| `capacity-rules.md` | disponibilidade por data e checagem de capacidade |
| `booking-flow.md` | state machine da reserva, checkout, expiração, cancelamento |
| `coupon-rules.md` | validação de cupom e desconto |
| `voucher-qrcode.md` | voucher PDF e check-in por QR |
| `manager-panel.md` / `operator-panel.md` | escopo de cada painel |
| `destinations.md` | destinos (aeroportos): catálogo de busca, páginas SEO `/destinos/<slug>`, CRUD no Manager, RLS |
| `design-tokens.md` + `docs/design-system/` | cores, tipografia, espaçamento, UI kit |

## Pendências conhecidas (ver `docs/specs/README.md`)

- Seed de capacidade real em `location_parking_type.capacity` (hoje placeholder 0).
- Decisão sobre modelo de staff/backoffice (necessário para RLS de escrita).
- Preço dinâmico por janela/dia/feriado é **v2**, fora do MVP.
- Guest checkout é v2 — `create-booking` exige JWT hoje.

## Checklist antes de concluir

1. `bun run typecheck` limpo.
2. `bun run lint` limpo.
3. **`bun run test` verde** — e há teste novo/atualizado cobrindo o que você mudou (regra de negócio → pgTAP/`test:int`; lógica pura/UI → Vitest; bug → teste de regressão).
4. Mudou schema? → migration nova + `bun run gen:types` + spec atualizada.
5. Mudou regra de negócio? → spec correspondente em `docs/specs/` atualizada no mesmo PR.
6. Tipos vindos de `@/types/domain`, imports via `@/`, soft-delete respeitado.
