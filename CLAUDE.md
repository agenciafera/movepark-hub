# CLAUDE.md

Orientações para trabalhar neste repositório. Leia antes de codar.
O README cobre setup e visão geral; este arquivo define **convenções e padrões** que todo código novo deve seguir.

## O que é o projeto

**Movepark Hub** — SaaS multi-tenant para gestão de estacionamentos parceiros (o "Airbnb dos estacionamentos"). Substitui dois sistemas legados: `movepark-backoffice-v4` (October CMS/PHP) e `movepark-nextjs` (site público).

> **Nome da marca:** escreva sempre **"Movepark"** — uma palavra só, `M` maiúsculo e o resto minúsculo. **Nunca** "MovePark", "Move Park" ou "MOVEPARK" em texto de exibição. Identificadores técnicos em minúsculo permanecem como estão (slug/repo `movepark-hub`, tokens `mp-*`, nomes dos sistemas legados).
>
> **Domínios:** este projeto inteiro (site do consumidor + hub/admin/operator) é servido em **`hub.movepark.co`** — é o domínio canônico para SEO, `og:url`, `sitemap`, `.well-known/*`, `PUBLIC_SITE_URL` e links de e-mail. **`movepark.co`** é a landing/marketing (redireciona); o e-mail da marca fica nesse domínio (`contato@movepark.co`, `hub@movepark.co`). **Nunca** use `movepark.com.br` (domínio antigo) nem outros subdomínios (`app.`, `www.`).

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
- **Deploy:** Cloudflare Worker (`src/worker.ts`, `wrangler.jsonc`) servindo o build estático com content-negotiation de Markdown para agentes.
- **Gerenciador de pacotes:** **bun** (lockfile `bun.lockb`). Use sempre `bun` — não use `npm`/`yarn`/`pnpm`. Instalar deps: `bun install`; adicionar: `bun add <pkg>`.

## Comandos

Sempre via **bun**:

| Comando | Quando usar |
|---|---|
| `bun install` | Instalar dependências (após clonar ou mudar `package.json`). |
| `bun run dev` | Dev server (porta 5173). |
| `bun run typecheck` | `tsc -b --noEmit` — **rode antes de concluir qualquer tarefa.** |
| `bun run lint` | ESLint. |
| `bun run build` | `tsc -b && vite-react-ssg build` (gera SSG; puxa rotas dinâmicas do Supabase). |
| `bun run gen:types` | Regenera `src/types/database.ts` do Supabase linkado. **Rode após toda migration.** |
| `bun run deploy` | Build + `wrangler deploy`. |

Não há suíte de testes automatizada hoje — validação é via `typecheck` + `lint` + verificação manual no app.

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
| `design-tokens.md` + `docs/design-system/` | cores, tipografia, espaçamento, UI kit |

## Pendências conhecidas (ver `docs/specs/README.md`)

- Seed de capacidade real em `location_parking_type.capacity` (hoje placeholder 0).
- Decisão sobre modelo de staff/backoffice (necessário para RLS de escrita).
- Preço dinâmico por janela/dia/feriado é **v2**, fora do MVP.
- Guest checkout é v2 — `create-booking` exige JWT hoje.

## Checklist antes de concluir

1. `bun run typecheck` limpo.
2. `bun run lint` limpo.
3. Mudou schema? → migration nova + `bun run gen:types` + spec atualizada.
4. Mudou regra de negócio? → spec correspondente em `docs/specs/` atualizada no mesmo PR.
5. Tipos vindos de `@/types/domain`, imports via `@/`, soft-delete respeitado.
