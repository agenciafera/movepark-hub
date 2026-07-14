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
- **Deploy/CI rodam `bun install --frozen-lockfile` no Linux — toda dep usada no código TEM que
  estar no `package.json`.** Armadilha que derrubou CI e Cloudflare em jun/2026: um `import` de
  `gsap` foi adicionado com o pacote **só no `bun.lock`** (entrada órfã), **sem** declarar `gsap`
  em `package.json`. No **macOS** o bun tolera a divergência (instala e roda); no **Linux** (CI +
  Cloudflare) o frozen-install é estrito e aborta com `error: lockfile had changes, but lockfile is
  frozen`. Regra: ao usar `bun add <pkg>` confira que `package.json` **e** `bun.lock` foram
  commitados juntos; nunca commite um lockfile com pacote que o `package.json` não declara. O
  próprio CI (job `quality`, frozen-install no Ubuntu) é o guard contra isso.
- **Pino de versão do bun (defesa secundária) — mantenha em lockstep.** O `bun.lock` também é
  sensível à **versão** do bun. Para não depender do default (mutável) do Cloudflare, a versão é
  pinada nos três lugares: (1) **Cloudflare** → variável de build **`BUN_VERSION`** no painel
  (Settings › Build › *Variables and Secrets*, escopos **Production e Preview**) — o CF **não** lê
  arquivo do repo, só a env var; (2) **CI** → `bun-version` fixo no `oven-sh/setup-bun@v2` em
  `.github/workflows/ci.yml` (nunca "latest"); (3) **local** → mesma versão.
  **Versão atual pinada: `1.3.13`.** Ao subir a versão do bun, atualize os três no mesmo PR.

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

- **ADR-003 · Doc-as-you-build (API + MCP nascem documentadas).** Toda capacidade que é (ou pode
  virar) **Public API** ou **tool de MCP** **nasce documentada na mesma entrega** — doc feita depois
  vira dívida e quebra a descoberta por humanos e agentes (o Hub é agent-ready). Um PR que adiciona/
  altera rota ou tool **sem** atualizar a doc é **incompleto** e falha na revisão (e no CI). Checklist
  mínimo por endpoint/tool: (1) `public/openapi.yaml` (path + schema + `security`/escopo) **ou** o card
  MCP (`public/.well-known/mcp/{server,partner}-card.json`); (2) escopo no catálogo `api_scope` (seed em
  migration) com `assignable_to_api_key` correto, se for novo; (3) superfície §9 de `public-api.md` /
  §4 de `mcp.md` atualizada; (4) `agent-skills/index.json` com `sha256` recalculado se um card mudou
  (`bun run gen:cards`); (5) teste (`deno test` do branch do gateway/tool; pgTAP da RPC/escopo). O CI
  roda **`bun run lint:openapi`** (`scripts/check-openapi-drift.mjs`): rota↔OpenAPI, tool↔card e
  **todo escopo `assignable_to_api_key` do catálogo tem ≥1 rota/tool** (sem escopo órfão). As funções
  `api`/`mcp` (e demais públicas) são **`verify_jwt=false`** — fixado em `supabase/config.toml`; deploy
  sempre com `--no-verify-jwt`. Ver [`docs/specs/public-api.md`](docs/specs/public-api.md) (§2, §12) e
  [`docs/specs/mcp.md`](docs/specs/mcp.md).

- **ADR-004 · Gateway = Pagar.me (recebedores), atrás de uma camada de abstração.** O gateway de
  pagamento é o **Pagar.me**, com split por **Recebedores** geridos na conta da Movepark — o parceiro
  **não cria conta** no gateway nem é abordado por ele (**fica invisível**). **PIX + cartão,
  PIX-first.** O KYC do recebedor é coletado na **UI da Movepark** (E1.3), **nunca** redirecionando
  pro Pagar.me. **Camada de abstração obrigatória:** o domínio fala apenas pela interface
  `PaymentGateway` (`supabase/functions/_shared/payments`, `getGateway(provider)`); o Pagar.me existe
  só no adapter — trocar de gateway = novo adapter, sem tocar no domínio. O **estado da ficha para
  receber** (`payout_recipient.status`) é **separado** do `onboarding_status` de catálogo; `take_rate`
  (comissão da Movepark) é por **empresa** (`company.take_rate_bps`). Dados de banco/KYC e
  `recebedor_id` ficam **no banco, nunca no front**. **Cartão:** PAN **nunca** trafega o backend —
  tokenização é **client-side** (`POST api.pagar.me/.../tokens` com a public key). **Parcelamento é
  config dinâmica**, não código: `app_setting.card_installment_policy` (JSON), editável no Manager;
  a Edge `create-card-charge` é **server-authoritative** (revalida parcela + recalcula o financiado).
  Implementado em `supabase/migrations/20260627000000_payout_recipients.sql` + Edge `sync-recipient`
  (recebedores) e `..._card_charges.sql` + Edges `create-card-charge`/`get-payment-config` (cartão); ver
  [`docs/specs/payment-split.md`](docs/specs/payment-split.md).

- **ADR-005 · Permissões por escopo + papéis fixos (server-authoritative).** O controle de acesso
  dentro de uma empresa fala **uma única língua: o escopo** (a tabela `api_scope`, a mesma da Public
  API). "A mesma permissão = o mesmo escopo." São **4 papéis fixos** (`company_role`): **Dono**
  (`owner`, acesso total), **Gerente** (`manager`), **Operação** (`operator`), **Financeiro**
  (`finance`) — pacotes **seedados** em `company_role_scope`, **sem** construtor de regras na UI. O
  enforcement é **server-authoritative**: cada `operator_*`/`payout_*`/`company_*` de escrita exige o
  escopo via `member_has_scope(company_id, scope)` (hub_admin e dono → todos), e as escritas diretas
  de `location`/`location_parking_type` carregam o escopo na policy de UPDATE. A UI **espelha** com
  `useAuth().hasScope` (rota via `<RequireScope>`, sidebar e ações) — nunca é a única barreira.
  Escopos só-internos (`team:*`, `api-keys:write`, `finance:read`, `payouts:*`) têm
  `api_scope.assignable_to_api_key = false` e **não** podem ir pra uma chave de API; `payouts:write`
  (saque/KYC) é **exclusivo do Dono**. Convite de usuário por e-mail exige `team:write` (Edge
  `invite-company-member`). Ao adicionar uma escrita nova: **dê a ela um escopo** e gateie no servidor.
  Implementado em `supabase/migrations/20260712000000_company_role_add_values.sql` +
  `20260713000000_permission_scopes.sql` + `20260714000000_regate_operator_rpcs.sql`; ver
  [`docs/specs/permissions.md`](docs/specs/permissions.md).

- **ADR-006 · Modelo de identidade (auth.users é a fonte única da credencial).** E-mail e telefone
  **verificados** moram no **`auth.users`** (únicos, com `confirmed_at`) — são a credencial de login.
  **`profiles` NÃO guarda `email` nem `phone`** (a coluna `profiles.phone` foi dropada); dados de
  identidade **não** são escritos por formulário nem copiados pra tabela editável. O **contato
  operacional** (o do pedido) mora no **snapshot da `booking`** (`customer_name/email/phone`).
  **Leituras:** contato do **próprio** usuário → via **JWT** (`auth.jwt()`/`session.email`/`session.phone`);
  contato de **terceiros** → snapshot da `booking` (operacional) **ou** RPC security-definer/view sobre
  `auth.users` (contato vivo) — **nunca** cópia editável no `profiles`. Promover um identificador a
  credencial exige **verificação** (OTP/magic-link); merge de contas só sobre identificador
  **recém-verificado** (nunca por igualdade crua — evita sequestro). Se um dia precisar de contato ≠
  credencial (telefone de recado), modele explícito como `profiles.contact_phone`, separado, sem se
  passar por identidade. Épico **E0.10** (identidade unificada: anexar-verificado + merge determinístico
  Google↔WhatsApp); ver [`docs/specs/customer/identity-unification.md`](docs/specs/customer/identity-unification.md).
  - **Exceção consciente (decisão de produto) — anexo silencioso de telefone no checkout.** No passo 1 do
    checkout, se a conta ainda não tem telefone no `auth.users`, o telefone digitado é gravado **sem OTP**
    (Edge `attach-phone-silent`, `admin.updateUserById({ phone, phone_confirm: true })`). A guarda que
    substitui a verificação é a **checagem de colisão**: se o número já pertence a outra conta
    (`find_user_by_identifier`), **não escreve nada** (não sequestra conta alheia). O **pagamento não depende
    disso** — o pagador (nome, CPF, telefone, e-mail) vem do **snapshot do booking** (`customer_*`), não do
    `auth.users`. Fora do checkout, promover identificador a credencial continua exigindo verificação.

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

### Verificação de arquivos não rastreados — OBRIGATÓRIA

**Antes de qualquer `commit` ou `push`, rode `git status` e resolva TODO arquivo `Untracked`.**

Arquivos não rastreados (imagens, fontes, JSONs estáticos, PDFs, ícones, arquivos de seed, etc.) que são referenciados pelo código **devem ser commitados no mesmo PR/commit** que o código que os usa. Nunca versione código que depende de assets sem antes versionar os próprios assets.

Regras práticas:
- `public/images/`, `public/fonts/`, `public/icons/` e similares → adicione ao git se estiverem em uso.
- `.DS_Store`, `*.local`, `dist/`, `node_modules/` → confirme que estão no `.gitignore` e **não** os adicione.
- Se um arquivo untracked não deve ir ao repo (ex: segredo, binário grande), adicione ao `.gitignore` explicitamente e documente o motivo.
- **Nunca** conclua uma tarefa deixando `Untracked files` que o código referencia.

### Segurança — guardas antes do commit (E0.6)

Modelo em 3 camadas — **local leve, CI pesado** (não travar entrega):

1. **Chão duro (roda em TODO commit, qualquer ferramenta, até sem IA):** hook `pre-commit` via
   **lefthook** roda `secretlint` nos arquivos staged. É rápido (segundos) e só barra **segredo
   vazando**. Instala sozinho no `bun install` (script `prepare`). Se aparecer um achado, é segredo
   de verdade → remova/rotacione; a **anon key** do Supabase é pública por design (não é segredo).
2. **Convenção da IA (você, Claude — vale terminal, extensão de IDE e Desktop):** ao mexer em
   **migration, RLS, policy, função `SECURITY DEFINER`, Edge Function ou dependências**, antes de
   concluir a tarefa: (a) rode `/security-review` (revisão de segurança do diff da branch) e
   (b) rode os **advisors do Supabase** (`get_advisors` type `security`, projeto `mgaigbezdalbyuqiofcf`)
   e trate qualquer **regressão** (RLS que caiu, mutação nova exposta a `anon`). Não é opcional
   quando o diff toca esses pontos.
3. **Backstop (CI):** `.github/workflows/security-scan.yml` roda semanal + em PR de deps
   (`bun audit`, `gitleaks` no histórico, advisors do Supabase). É a rede de segurança — o pesado
   mora aqui, não no commit local.

Detalhe operacional e triagem dos achados: `../gestao/E0.6-guardas-nativas.md`.

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

**Idioma:** UI, comentários e mensagens são em **português** (pt-BR). Nomes de símbolos/identificadores em inglês. Siga o que já existe no arquivo vizinho. Sem travessão "—" (ver "Escrita de conteúdo e copy" abaixo).

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
- Auth é **passwordless para todos os papéis** (consumidor, manager e operator): a tela única `/login` (`src/routes/login.tsx`) oferece e-mail OTP, WhatsApp OTP e Google. `/entrar` e `/signup` são rotas legadas que redirecionam pra `/login`. **Não há login por senha** (sem `signInWithPassword`); o password grant do Supabase Auth deve ficar **desligado**. O WhatsApp OTP passa pela Edge Function `send-whatsapp-otp` (Send SMS Hook).

### Rotas

- Adicione páginas em `src/routes.tsx`, agrupando por shell e por `RequireRole`. Páginas em `src/routes/` devem ser finas — a lógica vai para `features/`.
- Páginas de listing usam SSG: `loader` + `getStaticPaths`/`getStaticPaths` puxando de `location_parking_type` ativo. Ao mexer nessas rotas, lembre que elas são pré-renderizadas no build.

### Banco de dados e migrations

- Toda mudança de schema é uma **migration nova** em `supabase/migrations/` (`AAAAMMDDHHMMSS_descricao.sql`). Nunca edite migration já aplicada.
- Convenções SQL do schema: nomes de tabela no **singular** (`booking`, `company`), `id uuid default gen_random_uuid()`, `created_at`/`updated_at`/`deleted_at`, trigger `set_updated_at`, enums em `lower_snake`.
- Após aplicar migration, **rode `bun run gen:types`** e comite o `database.ts` atualizado.
- Catálogo de migrations e specs em `docs/specs/README.md` e `docs/specs/database-schema.md`. Mantenha a tabela de migrations e o status dos specs atualizados ao adicionar.
- Aplique migrations via Supabase CLI ou MCP (`mcp__claude_ai_Supabase__apply_migration`). Antes de mexer no schema, `list_tables`; ao debugar, comece por `get_logs` / `get_advisors`.

> **Quem roda migration/deploy do Supabase é o Claude — não o usuário.** Ao terminar uma tarefa que mexe em schema ou Edge Functions, **eu** aplico a migration no projeto linkado (`mgaigbezdalbyuqiofcf`) e faço o deploy das Edges, sem deixar como "passo pendente" para o usuário. Migration: `mcp__*_Supabase__apply_migration` (não-interativo) ou `supabase db push` (linkado, **sem** `--project-ref`). Depois: `bun run gen:types` + commit do `database.ts`. Edges: `supabase functions deploy <nome>` (a CLI empacota o `_shared`); webhooks/funções públicas com `--no-verify-jwt`. O deploy do front é separado (Cloudflare Pages via GitHub). Se algum passo for bloqueado, aí sim peço autorização.

### Edge Functions (`supabase/functions/`)

Deno + imports remotos. Cada função abre com um bloco de comentário documentando rota, payload e comportamento — **mantenha esse cabeçalho**. Funções-chave: `create-booking` (wrapper sobre a SQL `create_booking_atomic`), `search` (preço+distância+amenidades), `get-faq` (auto+location+global), `mock-payment` (pagamento mockado do MVP), `send-whatsapp-otp`.

## Escrita de conteúdo e copy (regra de marca)

Vale para **tudo que o projeto publica ou mostra**: copy de UI, landing pages, e-mails, microcopy, mensagens de estado, docs e mensagens de commit.

- **Proibido o travessão "—" (em dash) e o traço "–" (en dash) em qualquer texto do projeto.** O travessão é marca típica de texto gerado por IA e não combina com a voz da Movepark. **Nunca** use. No lugar dele, reescreva a frase: ponto, vírgula, dois-pontos ou parênteses resolvem quase sempre. Se precisar mesmo de um separador visual curto, use hífen com espaços (" - "). A regra cobre copy, comentários de código, docs e commits. O hífen simples "-" em palavras compostas, ranges e slugs continua normal (não é travessão). Ao concluir qualquer tarefa que escreva texto, faça uma passada final procurando "—" e "–" e elimine.
- **Toda copy nova ou reescrita passa pela skill `copy-lp-queiroz`.** É a fonte de uniformidade da voz do projeto: mesmo padrão de headline, benefício acima de feature, quebra de objeção e prova. Ao criar ou ajustar texto de página, use a skill, mesmo para blocos curtos (aplique o método e o tom dela). O tom default da marca (Nubank-like: direto, humano, anti-guru, sem superlativo vazio) manda; a skill operacionaliza esse tom. Ver `PRODUCT.md` (Brand Personality) e `DESIGN.md`.

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
4. **`git status` limpo** — nenhum `Untracked file` que o código referencia (imagens, fontes, JSONs estáticos, seeds). Se existir, commite junto ou adicione ao `.gitignore` com justificativa.
5. Mudou schema? → migration nova + `bun run gen:types` + spec atualizada.
6. Mudou regra de negócio? → spec correspondente em `docs/specs/` atualizada no mesmo PR.
7. Tipos vindos de `@/types/domain`, imports via `@/`, soft-delete respeitado.

## Design Context

Contexto estratégico e visual do projeto vive em dois arquivos na raiz:

- **[PRODUCT.md](PRODUCT.md)** — Registro (`brand`), usuários, propósito, personalidade da marca e anti-referências. Leia antes de tomar decisões de UX ou copy.
- **[DESIGN.md](DESIGN.md)** — Sistema visual completo: tokens de cor, tipografia, elevação, componentes e guardrails. DESIGN.md é normativo — segue-o em decisões visuais.

**Princípios de design (resumo para agentes):**
1. Clareza sem instrução — ação óbvia pela hierarquia, não por texto explicativo.
2. Confiança antes do clique — sinais de confiança chegam antes do CTA.
3. Personalidade no detalhe — marca vive no micro-copy, não em decoração.
4. Mobile-first, aeroporto-first — um polegar, 4G, luz de sol.
5. Uma marca, três superfícies — consumer/operator/admin no mesmo sistema de design.

Para iterar visualmente no browser: `/impeccable live` (precisa de `bun run dev`). Para critique, audit ou polish de uma rota: `/impeccable <comando> <caminho>`.
