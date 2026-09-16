# Rascunho como status + testadores: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unidade em rascunho aparece na busca e na ficha do site, com compra real, só para contas marcadas como testador (e hub_admin); "Rascunho" vira opção do select Status.

**Architecture:** `location.is_draft` continua sendo o armazenamento. Entra `tester_user` + `public.is_tester()`; todo corte `is_listed` do catálogo vira `is_listed or (is_draft and is_tester())` (policy, quatro funções de preço, Edge `search` com o JWT do usuário, `fetchListing`). O Manager marca testador em Usuários.

**Tech Stack:** Postgres/RLS + pgTAP (rodado no vivo via `tap.sh` do scratchpad, transação com rollback), Deno Edge, React + TanStack Query + Vitest/MSW.

## Global Constraints

- Sem travessão "—" nem "–" em nenhum texto.
- Nunca `supabase start`/`test:db`; pgTAP roda contra o banco vivo dentro de transação.
- Migration com `HHMMSS` real; checar duplicata: `ls supabase/migrations/ | sed 's/_.*//' | sort | uniq -d`.
- Função nova em `public`: `revoke all from public, anon` nominal e `grant` explícito.
- Mutation nova precisa do nome num `*.test.tsx` da mesma pasta (`mutations.contract.test.ts`).
- Rota removida sai do mapa de cobertura (`routes-coverage.contract.test.ts`).
- Trabalho na `main`, commit + push ao fim de cada tarefa.

---

### Task 1: Banco: `tester_user`, `is_tester()`, `admin_set_tester`, policy e as quatro funções

**Files:**
- Create: `supabase/migrations/20261119093000_testadores_veem_rascunho.sql`
- Create: `supabase/tests/tester_user.test.sql`
- Modify: `supabase/tests/modo_rascunho.test.sql` (hub_admin → tester)

**Interfaces:**
- Produces: `public.tester_user(user_id uuid pk, created_by uuid, created_at timestamptz)`; `public.is_tester() returns boolean`; `public.admin_set_tester(p_user_id uuid, p_enabled boolean) returns void`.

- [ ] Escrever `tester_user.test.sql` (plan 12): tabela existe; anon `is_tester()` false; cliente false; testador true; hub_admin true; `admin_set_tester` por cliente lança; por hub_admin insere e remove; cliente comum não lê `location` em rascunho pela policy; testador lê; `check_availability` e `get_pricing_data` respondem para testador.
- [ ] Rodar `tap.sh` e ver falhar (função inexistente).
- [ ] Escrever a migration: tabela + RLS (hub_admin tudo, próprio lê a própria linha); `is_tester()` sql stable security definer `set search_path = public, pg_temp`; `admin_set_tester` plpgsql security definer gateado por `is_hub_admin()`; `drop policy catalog_read_location` e recriar com `(is_listed or (is_draft and public.is_tester()))`; `create or replace` das quatro funções trocando `public.is_hub_admin()` por `public.is_tester()`; grants.
- [ ] Aplicar no vivo: `supabase db query --linked -f <arquivo>` + `supabase migration repair --status applied 20261119093000`.
- [ ] Rodar os dois pgTAP; verde.
- [ ] Commit: `feat(rascunho): testadores enxergam rascunho no banco`.

### Task 2: Edge `search` corre como o usuário e devolve `is_draft`

**Files:**
- Create: `supabase/functions/search/authHeader.ts` + `authHeader.test.ts`
- Modify: `supabase/functions/search/index.ts` (client, filtro, select, mapeamento)

**Interfaces:**
- Produces: `callerAuthorization(req: Request, anonKey: string): string` (Bearer do usuário se veio, senão anon); resultado ganha `location.is_draft: boolean`.

- [ ] Teste Deno: sem header devolve `Bearer <anon>`; com header devolve o header como veio.
- [ ] Implementar; `createClient(..., { auth: {persistSession:false}, global: { headers: { Authorization: callerAuthorization(req, anon) } } })`.
- [ ] Select inclui `is_draft`; filtro `if (!r.location.is_listed && !r.location.is_draft) return false;`; mapeamento `is_draft: r.location.is_draft === true`.
- [ ] `bun run test:edge`; deploy `supabase functions deploy search --no-verify-jwt`.
- [ ] Commit: `feat(search): busca corre com o JWT do usuário; rascunho aparece para testador`.

### Task 3: Front: sessão sabe `isTester`; ficha e card mostram o selo

**Files:**
- Modify: `src/types/domain.ts` (`Session.isTester`), `src/auth/AuthProvider.tsx` (rpc `is_tester`), `src/test/**` mocks de sessão se quebrarem.
- Modify: `src/features/listing/api.ts` (filtro `.or`, `is_draft` no select, remover `fetchListingDraft`/`useListingDraft`).
- Modify: `src/features/search/useSearchResults.ts` (`is_draft?: boolean`), `src/features/search/ResultCard.tsx` (selo), `src/routes/listing.tsx` (selo ao lado do H1).
- Modify: `src/features/listing/ReservationCard.tsx` (volta a só `customer`).
- Test: `src/features/search/ResultCard.test.tsx` (selo aparece só com `is_draft`).

- [ ] Teste do selo no ResultCard; ver falhar; implementar; passar.
- [ ] Commit: `feat(site): testador vê rascunho na busca e na ficha`.

### Task 4: Manager: Status "Rascunho" no select; coluna Testador em Usuários; limpeza

**Files:**
- Modify: `src/features/locations/useLocationForm.ts` (status `EntityStatus | "draft"` na UI, mapeado no payload), `src/features/locations/LocationSections.tsx` (SelectItem Rascunho, remover checkbox).
- Modify: `src/routes/manager/locations.tsx` (badge único; remover link "Testar rascunho").
- Modify: `src/features/users/api.ts` (`useUsers` lê `tester_user`; `useSetTester`), `src/features/users/api.test.tsx`, `src/routes/manager/users.tsx` (coluna Testador com Switch).
- Delete: `src/routes/manager/rascunho.tsx`, `rascunho.test.tsx`, `e2e/windup/manager-unidade-rascunho-jornada.json`; rota em `src/routes.tsx`.
- Test: `src/features/locations/useLocationForm.logic.test.ts` (mapa status↔draft).

- [ ] Extrair `statusFieldFromLocation({status,is_draft})` e `statusFieldToPayload(v)` em `useLocationForm.logic.ts`; testes; implementar.
- [ ] `useSetTester` com teste MSW (rpc `admin_set_tester`).
- [ ] `bun run typecheck && bun run lint && bun run test`; commit: `feat(manager): status Rascunho e coluna Testador`.

### Task 5: Docs, verificação no vivo, push

- [ ] `docs/specs/split-dinamico-e-divida-do-parceiro.md` seção "Modo rascunho" reescrita; `docs/specs/README.md` linha da migration.
- [ ] Advisors de segurança do Supabase (regressão).
- [ ] No preview local: Manager › Usuários marca peu+teste1 como testador (com o Kallef), busca em Jardim Paulista logado como testador mostra Agência Fera com selo.
- [ ] `git push origin main`.
