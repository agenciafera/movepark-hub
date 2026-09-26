# Repasse automático mensal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Todo estacionamento recebe um repasse mensal automático no dia X (padrão 10, configurável por empresa), sem taxa para ele; o saque manual continua, com a taxa da Pagar.me dita na tela; o Operator vê a próxima data e o valor previsto.

**Architecture:** O cron chama uma Edge nova (`payout-auto-run`) que, para cada empresa cujo dia é hoje, executa o mesmo saque do botão "Repassar" (miolo extraído para `_shared/payments/performWithdrawal.ts`), com `origin = 'automatic'` e `fee_borne_by = 'movepark'`. A taxa que a Pagar.me debita vira crédito da Movepark ao parceiro, devolvido pelo split dinâmico na próxima venda (espelho do abatimento de dívida). Ciclo mensal por empresa em `payout_auto_cycle` (unique por mês = idempotência). Front: card "Próximo repasse automático" na conta, copy do saque manual, configuração global e por empresa.

**Tech Stack:** Postgres/plpgsql + pgTAP (banco vivo, `bash $SP/tap.sh`), Edge Deno, React + TanStack Query + Vitest + MSW, pg_cron + pg_net + Vault.

Spec: `docs/specs/repasse-automatico-mensal.md`.

## Global Constraints

- Trabalho direto na `main`; commit e push por tarefa. Migration com carimbo único (`ls supabase/migrations/ | sed 's/_.*//' | sort | uniq -d` vazio).
- Migration aplicada por `supabase db query --linked -f <arquivo>` + `supabase migration repair --status applied <ts>`; depois `src/types/database.ts` editado à mão (o gen devolve schema errado).
- pgTAP no banco vivo em transação revertida: `bash $SP/tap.sh <teste> <migration...>` (`SP` = scratchpad da sessão). Nunca `supabase start`.
- Edges: `supabase functions deploy <nome>`; testes `bun run test:edge` (ou `deno test --no-check --allow-env --allow-net --allow-read supabase/functions/<dir>`).
- Copy sem travessão nem meia-risca; "Movepark" grafado assim; textos passam pela skill `revisar-texto`.
- Decisões travadas: executor é o nosso cron; dia padrão 10; mínimo R$ 50,00 (`5000`); taxa do repasse automático por conta da Movepark, devolvida no split da próxima venda; saque manual segue com taxa do parceiro.
- Dia 29, 30 ou 31 em mês mais curto roda no último dia do mês. Fim de semana e feriado ficam com a Pagar.me (liquida no dia útil seguinte).
- Nunca ligar a transferência automática nativa da Pagar.me (`transfer_enabled` fica `false` em todo recebedor).
- Guards de CI: toda mutation nova em `api.ts` precisa de teste no mesmo diretório; toda Edge precisa de `*.test.ts`; nenhuma rota nova.

---

### Task 1: Migration, RPCs e pgTAP (configuração, ciclo, crédito, previsão, cron)

**Files:**
- Create: `supabase/migrations/20261127090000_repasse_automatico_mensal.sql`
- Create: `supabase/tests/payout_auto.test.sql`
- Modify: `src/types/database.ts` (colunas de `company`, `payout_withdrawal`, `payment`; tabelas `payout_auto_cycle`, `payout_fee_credit_reservation`; funções novas)

**Interfaces:**
- Produces: `payout_auto_day(uuid) → int`, `payout_auto_enabled(uuid) → boolean`, `payout_auto_min_cents() → bigint`, `payout_next_auto_at(uuid, date default hoje BRT) → date`, `payout_auto_due(date) → setof (company_id uuid, scheduled_for date)` (só service_role), `company_set_payout_schedule(uuid, int, boolean) → void` (só hub_admin), `payout_fee_credit_cents(uuid, text default 'pagarme') → bigint`, `payout_fee_credit_reserve(uuid, bigint, text default 'pagarme') → (reservation_id uuid, amount_cents bigint)` (só service_role), `payout_auto_forecast(uuid) → jsonb {enabled, day, source, next_at, forecast_cents, min_cents, below_min, last_cycle}`, `payout_auto_expected_key() → text` (só service_role).
- Produces: tabela `payout_auto_cycle`; colunas `payout_withdrawal.origin/fee_borne_by/cycle_id`, `payment.fee_credit_returned_cents/fee_credit_reservation_id`, `company.payout_auto_day/payout_auto_enabled`.
- Consumes: `payout_release_days(uuid)`, `payout_debt_cents(uuid, text)`, `payout_withdrawable(uuid)` (recriada aqui), `partner_account_statement` (recriada aqui), `is_hub_admin()`, `current_company_ids()`, `member_has_scope(uuid, text)`, `set_updated_at()`.

- [ ] **Step 1: Escrever o teste pgTAP que falha**

```sql
-- pgTAP: repasse automático mensal (E0.3.13, 26/09/2026). Spec: docs/specs/repasse-automatico-mensal.md.
-- Transação com rollback.
begin;
select plan(27);

select is((select value from public.app_setting where key = 'payout_auto_day'), '10', 'dia padrão nasce em 10');
select is((select value from public.app_setting where key = 'payout_auto_min_cents'), '5000', 'mínimo nasce em R$ 50');
select has_column('public', 'company', 'payout_auto_day', 'company.payout_auto_day existe');
select has_column('public', 'payout_withdrawal', 'fee_borne_by', 'payout_withdrawal.fee_borne_by existe');
select has_table('public', 'payout_auto_cycle', 'payout_auto_cycle existe');

do $$
declare
  adm uuid := gen_random_uuid(); cust uuid := gen_random_uuid(); op uuid := gen_random_uuid();
  cid uuid := gen_random_uuid(); cid2 uuid := gen_random_uuid(); loc uuid := gen_random_uuid();
  b1 uuid := gen_random_uuid(); b2 uuid := gen_random_uuid();
  split_novo jsonb := '[{"role":"partner","recipientId":"re_pa_p","amount":8000,"type":"flat","liable":false,"chargeProcessingFee":true,"chargeRemainderFee":true},
                        {"role":"movepark","recipientId":"re_pa_mp","amount":2000,"type":"flat","liable":true,"chargeProcessingFee":false,"chargeRemainderFee":false}]'::jsonb;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (adm,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','pa-adm@ex.com',now(),now()),
           (cust,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','pa-cust@ex.com',now(),now()),
           (op,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','pa-op@ex.com',now(),now());
  insert into public.profiles(id, role) values (adm,'hub_admin') on conflict (id) do update set role='hub_admin';
  insert into public.profiles(id, role) values (cust,'customer') on conflict (id) do nothing;
  insert into public.profiles(id, role) values (op,'company_operator') on conflict (id) do update set role='company_operator';
  insert into public.company(id, name, slug) values (cid, 'Auto Empresa', 'auto-empresa'), (cid2, 'Auto Desligada', 'auto-desligada');
  update public.company set payout_auto_enabled = false where id = cid2;
  insert into public.profile_company(profile_id, company_id, role) values (op, cid, 'owner');
  insert into public.location(id, company_id, name, slug) values (loc, cid, 'Auto Loc', 'auto-loc');
  insert into public.payout_recipient(company_id, provider, external_recipient_id, status, balance_available_cents, balance_waiting_cents, balance_synced_at)
    values (cid, 'pagarme', 're_pa_p', 'active', 20000, 3000, now()), (cid2, 'pagarme', 're_pa_p2', 'active', 20000, 0, now());
  -- venda liberada (paga há 40 dias)
  insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount)
    values (b1,'MP-PA-1',cust,loc,now() - interval '39 days',now() - interval '38 days','completed',100);
  insert into public.payment(booking_id, provider, method, kind, amount, status, paid_at, split_sent_to_gateway, split, gateway_fee_cents, partner_release_at)
    values (b1,'pagarme','pix','booking',100,'paid',now() - interval '40 days', true, split_novo, 100, now() - interval '40 days');
  -- venda que libera daqui a 3 dias (paga há 27 dias): entra na previsão se o próximo dia for depois
  insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount)
    values (b2,'MP-PA-2',cust,loc,now() - interval '20 days',now() - interval '19 days','completed',100);
  insert into public.payment(booking_id, provider, method, kind, amount, status, paid_at, split_sent_to_gateway, split, gateway_fee_cents, partner_release_at)
    values (b2,'pagarme','pix','booking',100,'paid',now() - interval '27 days', true, split_novo, 100, now() - interval '27 days');
  -- saque automático anterior: taxa por conta da Movepark
  insert into public.payout_withdrawal(company_id, provider, external_transfer_id, external_recipient_id, amount_cents, fee_cents, status, paid_at, origin, fee_borne_by)
    values (cid, 'pagarme', 'tr_pa_auto', 're_pa_p', 1000, 367, 'paid', now() - interval '10 days', 'automatic', 'movepark');
  -- saque manual anterior: taxa do parceiro
  insert into public.payout_withdrawal(company_id, provider, external_transfer_id, external_recipient_id, amount_cents, fee_cents, status, paid_at)
    values (cid, 'pagarme', 'tr_pa_manual', 're_pa_p', 500, 367, 'paid', now() - interval '9 days');
  perform set_config('test.adm', adm::text, false);
  perform set_config('test.cust', cust::text, false);
  perform set_config('test.op', op::text, false);
  perform set_config('test.cid', cid::text, false);
  perform set_config('test.cid2', cid2::text, false);
end $$;

-- Daqui até a previsão, as chamadas são as do cron/Edge: claims de service_role (postgres sem claims
-- cai na checagem de permissão de payout_withdrawable e company_set_payout_schedule).
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- resolução do dia e da próxima data
select is(public.payout_auto_day(current_setting('test.cid')::uuid), 10, 'empresa sem override herda o dia 10');
select lives_ok(format('select public.company_set_payout_schedule(%L::uuid, 31, null)', current_setting('test.cid')), 'hub_admin (service) muda o dia');
select is(public.payout_next_auto_at(current_setting('test.cid')::uuid, date '2026-09-05'), date '2026-09-30', 'dia 31 em setembro cai no dia 30');
select is(public.payout_next_auto_at(current_setting('test.cid')::uuid, date '2026-10-31'), date '2026-10-31', 'o próprio dia conta como próximo');
select lives_ok(format('select public.company_set_payout_schedule(%L::uuid, 10, null)', current_setting('test.cid')), 'volta ao dia 10');
select is(public.payout_next_auto_at(current_setting('test.cid')::uuid, date '2026-09-11'), date '2026-10-10', 'hoje passou do dia: próximo mês');
select is(public.payout_next_auto_at(current_setting('test.cid')::uuid, date '2026-09-10'), date '2026-09-10', 'hoje é o dia');

-- quem é hoje
select is((select count(*) from public.payout_auto_due(date '2026-10-10') d where d.company_id = current_setting('test.cid')::uuid), 1::bigint, 'empresa ligada com recebedor ativo é devida no dia 10');
select is((select count(*) from public.payout_auto_due(date '2026-10-10') d where d.company_id = current_setting('test.cid2')::uuid), 0::bigint, 'empresa desligada não é devida');
select is((select count(*) from public.payout_auto_due(date '2026-10-09') d where d.company_id = current_setting('test.cid')::uuid), 0::bigint, 'dia 9 não é o dia');
insert into public.payout_auto_cycle(company_id, cycle_month, scheduled_for, outcome) values (current_setting('test.cid')::uuid, date '2026-10-01', date '2026-10-10', 'paid');
select is((select count(*) from public.payout_auto_due(date '2026-10-10') d where d.company_id = current_setting('test.cid')::uuid), 0::bigint, 'ciclo do mês já aberto: não repete');
select throws_ok(format('insert into public.payout_auto_cycle(company_id, cycle_month, scheduled_for) values (%L::uuid, date ''2026-10-01'', date ''2026-10-10'')', current_setting('test.cid')), '23505', null, 'um ciclo por empresa e mês');

-- razão: a taxa por conta da Movepark não desconta do parceiro; a do parceiro desconta
-- liberado 8000 (b1) − saques (1000 + (500 + 367)) = 6133, no teto do gateway 20000
select is((public.payout_withdrawable(current_setting('test.cid')::uuid)->>'available_cents')::bigint, 6133::bigint, 'saque automático desconta só o valor; manual desconta valor e taxa');

-- crédito da taxa
select is(public.payout_fee_credit_cents(current_setting('test.cid')::uuid), 367::bigint, 'crédito = taxa dos saques automáticos vivos');
select is((select amount_cents from public.payout_fee_credit_reserve(current_setting('test.cid')::uuid, 200)), 200::bigint, 'reserva limita ao teto pedido');
select is(public.payout_fee_credit_cents(current_setting('test.cid')::uuid), 167::bigint, 'reserva viva sai do crédito');
select is((select amount_cents from public.payout_fee_credit_reserve(current_setting('test.cid2')::uuid, 500)), 0::bigint, 'sem crédito, reserva zero');

-- previsão como o Dono (RLS)
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.op'), 'role', 'authenticated')::text, true);
select is((public.payout_auto_forecast(current_setting('test.cid')::uuid)->>'day')::int, 10, 'Dono lê a previsão: dia');
-- próxima data é o dia 10 do mês seguinte ao ciclo já fechado (2026-10) OU o próximo dia 10 real; a venda b2 libera em 3 dias, antes de qualquer dia 10 futuro:
-- liberado até lá = 8000 + 8000 − saques 1867 = 14133, teto gateway 20000 + 3000
select is((public.payout_auto_forecast(current_setting('test.cid')::uuid)->>'forecast_cents')::bigint, 14133::bigint, 'previsão inclui a venda que libera até a data');
select is((public.payout_auto_forecast(current_setting('test.cid')::uuid)->>'below_min')::boolean, false, 'acima do mínimo');
select throws_ok(format('select public.payout_auto_forecast(%L::uuid)', current_setting('test.cid2')), '42501', null, 'Dono de outra empresa não lê');
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.cust'), 'role', 'authenticated')::text, true);
select throws_ok(format('select public.company_set_payout_schedule(%L::uuid, 5, true)', current_setting('test.cid')), 'P0001', null, 'cliente não muda o dia');

select * from finish();
rollback;
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `bash $SP/tap.sh supabase/tests/payout_auto.test.sql`
Expected: falha em `has_column`/`has_table` e nas funções inexistentes.

- [ ] **Step 3: Escrever a migration**

Antes: `ls supabase/migrations/ | sed 's/_.*//' | sort | uniq -d` vazio, e conferir que `20261127090000` não existe.

```sql
-- Repasse automático mensal (E0.3.13, 26/09/2026). Spec: docs/specs/repasse-automatico-mensal.md.
--
-- Decisões do Kallef: o repasse sai no dia X de todo mês (padrão 10, override por empresa, como a
-- comissão), executado pelo NOSSO cron com o mesmo saque do botão Repassar (a transferência
-- automática nativa da Pagar.me fica desligada: ela saca o saldo inteiro e ignora prazo e dívida);
-- mínimo R$ 50,00; a taxa de R$ 3,67 que a Pagar.me debita é por conta da Movepark e volta ao
-- parceiro como crédito no split da próxima venda (espelho do abatimento de dívida). O saque manual
-- continua, com a taxa do parceiro.

-- ── 1. Chaves globais ──────────────────────────────────────────────────────────────────────
insert into public.app_setting (key, value, is_public) values
  ('payout_auto_enabled', 'true', false),
  ('payout_auto_day', '10', false),
  ('payout_auto_min_cents', '5000', false)
on conflict (key) do nothing;

-- ── 2. Override por empresa ────────────────────────────────────────────────────────────────
alter table public.company
  add column if not exists payout_auto_day integer check (payout_auto_day between 1 and 31),
  add column if not exists payout_auto_enabled boolean;
comment on column public.company.payout_auto_day is
  'Dia do mês do repasse automático. Nulo = herda app_setting.payout_auto_day. 29 a 31 em mês curto rodam no último dia.';
comment on column public.company.payout_auto_enabled is
  'Repasse automático ligado para a empresa. Nulo = herda app_setting.payout_auto_enabled.';

-- ── 3. Origem do saque e quem paga a taxa ─────────────────────────────────────────────────
alter table public.payout_withdrawal
  add column if not exists origin text not null default 'manual' check (origin in ('manual', 'automatic')),
  add column if not exists fee_borne_by text not null default 'partner' check (fee_borne_by in ('partner', 'movepark')),
  add column if not exists cycle_id uuid;

-- ── 4. Ciclo mensal por empresa (unique por mês = idempotência do cron) ───────────────────
create table if not exists public.payout_auto_cycle (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.company(id) on delete cascade,
  cycle_month     date not null,
  scheduled_for   date not null,
  ran_at          timestamptz not null default now(),
  outcome         text not null default 'running'
                  check (outcome in ('running', 'paid', 'below_min', 'no_balance', 'no_recipient', 'failed')),
  available_cents bigint,
  amount_cents    bigint,
  withdrawal_id   uuid references public.payout_withdrawal(id) on delete set null,
  reason          text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (company_id, cycle_month)
);
drop trigger if exists set_updated_at on public.payout_auto_cycle;
create trigger set_updated_at before update on public.payout_auto_cycle
  for each row execute function public.set_updated_at();
alter table public.payout_auto_cycle enable row level security;
drop policy if exists payout_auto_cycle_admin_all on public.payout_auto_cycle;
create policy payout_auto_cycle_admin_all on public.payout_auto_cycle
  for all to authenticated using (public.is_hub_admin()) with check (public.is_hub_admin());
drop policy if exists payout_auto_cycle_operator_select on public.payout_auto_cycle;
create policy payout_auto_cycle_operator_select on public.payout_auto_cycle
  for select to authenticated using (company_id in (select public.current_company_ids()));
alter table public.payout_withdrawal
  drop constraint if exists payout_withdrawal_cycle_fk,
  add constraint payout_withdrawal_cycle_fk foreign key (cycle_id) references public.payout_auto_cycle(id) on delete set null;

-- ── 5. Resolução: dia, ligado, mínimo, próxima data ───────────────────────────────────────
create or replace function public.payout_auto_day(p_company_id uuid) returns integer
  language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select c.payout_auto_day from public.company c where c.id = p_company_id),
    (select nullif(trim(s.value), '')::int from public.app_setting s where s.key = 'payout_auto_day'),
    10);
$$;
create or replace function public.payout_auto_enabled(p_company_id uuid) returns boolean
  language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select c.payout_auto_enabled from public.company c where c.id = p_company_id),
    (select lower(trim(s.value)) = 'true' from public.app_setting s where s.key = 'payout_auto_enabled'),
    true);
$$;
create or replace function public.payout_auto_min_cents() returns bigint
  language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select nullif(trim(s.value), '')::bigint from public.app_setting s where s.key = 'payout_auto_min_cents'), 5000);
$$;
create or replace function public.payout_next_auto_at(p_company_id uuid, p_from date default null) returns date
  language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_from  date := coalesce(p_from, (now() at time zone 'America/Sao_Paulo')::date);
  v_day   int  := public.payout_auto_day(p_company_id);
  v_month date := date_trunc('month', v_from)::date;
  v_cand  date;
begin
  v_cand := v_month + (least(v_day, extract(day from (v_month + interval '1 month - 1 day'))::int) - 1);
  if v_cand < v_from then
    v_month := (v_month + interval '1 month')::date;
    v_cand := v_month + (least(v_day, extract(day from (v_month + interval '1 month - 1 day'))::int) - 1);
  end if;
  return v_cand;
end $$;
do $$ begin
  revoke all on function public.payout_auto_day(uuid) from public, anon;
  revoke all on function public.payout_auto_enabled(uuid) from public, anon;
  revoke all on function public.payout_auto_min_cents() from public, anon;
  revoke all on function public.payout_next_auto_at(uuid, date) from public, anon;
  grant execute on function public.payout_auto_day(uuid), public.payout_auto_enabled(uuid),
    public.payout_auto_min_cents(), public.payout_next_auto_at(uuid, date) to authenticated, service_role;
end $$;

-- ── 6. Quem é hoje (só o cron) ────────────────────────────────────────────────────────────
create or replace function public.payout_auto_due(p_today date)
  returns table (company_id uuid, scheduled_for date)
  language sql stable security definer set search_path = public, pg_temp as $$
  select c.id, p_today
    from public.company c
    join public.payout_recipient r
      on r.company_id = c.id and r.provider = 'pagarme' and r.deleted_at is null
   where c.deleted_at is null
     and r.status = 'active' and r.gateway_missing_at is null and r.external_recipient_id is not null
     and public.payout_auto_enabled(c.id)
     and public.payout_next_auto_at(c.id, p_today) = p_today
     and not exists (select 1 from public.payout_auto_cycle y
                      where y.company_id = c.id and y.cycle_month = date_trunc('month', p_today)::date);
$$;
revoke all on function public.payout_auto_due(date) from public, anon, authenticated;
grant execute on function public.payout_auto_due(date) to service_role;

-- ── 7. Configuração por empresa (hub_admin) ───────────────────────────────────────────────
create or replace function public.company_set_payout_schedule(p_company_id uuid, p_day integer, p_enabled boolean) returns void
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not (public.is_hub_admin() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'Só hub_admin muda o repasse automático.' using errcode = 'P0001';
  end if;
  if p_day is not null and (p_day < 1 or p_day > 31) then
    raise exception 'Dia do repasse precisa estar entre 1 e 31.' using errcode = '22023';
  end if;
  update public.company set payout_auto_day = p_day, payout_auto_enabled = p_enabled, updated_at = now()
   where id = p_company_id;
end $$;
revoke all on function public.company_set_payout_schedule(uuid, integer, boolean) from public, anon;
grant execute on function public.company_set_payout_schedule(uuid, integer, boolean) to authenticated, service_role;

-- ── 8. Crédito da taxa (Movepark deve ao parceiro; volta pelo split) ──────────────────────
alter table public.payment
  add column if not exists fee_credit_returned_cents integer not null default 0 check (fee_credit_returned_cents >= 0),
  add column if not exists fee_credit_reservation_id uuid;
create table if not exists public.payout_fee_credit_reservation (
  id                     uuid primary key default gen_random_uuid(),
  company_id             uuid not null references public.company(id) on delete cascade,
  provider               text not null default 'pagarme',
  amount_cents           bigint not null check (amount_cents > 0),
  expires_at             timestamptz not null,
  consumed_by_payment_id uuid references public.payment(id) on delete set null,
  created_at             timestamptz not null default now()
);
create index if not exists payout_fee_credit_reservation_viva_idx
  on public.payout_fee_credit_reservation (company_id, provider, expires_at) where consumed_by_payment_id is null;
alter table public.payout_fee_credit_reservation enable row level security;

create or replace function public.payout_fee_credit_cents(p_company_id uuid, p_provider text default 'pagarme') returns bigint
  language sql stable security definer set search_path = public, pg_temp as $$
  with gerada as (
    select coalesce(sum(w.fee_cents), 0)::bigint as cents
      from public.payout_withdrawal w
     where w.company_id = p_company_id and w.provider = p_provider and w.deleted_at is null
       and w.fee_borne_by = 'movepark' and w.status in ('created', 'processing', 'paid')
  ),
  devolvida as (
    select coalesce(sum(p.fee_credit_returned_cents), 0)::bigint as cents
      from public.payment p
      join public.booking b on b.id = p.booking_id
      join public.location l on l.id = b.location_id
     where p.provider = p_provider and l.company_id = p_company_id and p.split_sent_to_gateway is true
       and (p.status in ('paid', 'authorized', 'refunded')
            or (p.status = 'pending' and coalesce(p.expires_at, p.created_at + interval '1 hour') > now()))
  ),
  reservada as (
    select coalesce(sum(amount_cents), 0)::bigint as cents
      from public.payout_fee_credit_reservation
     where company_id = p_company_id and provider = p_provider and consumed_by_payment_id is null and expires_at > now()
  )
  select greatest(0, gerada.cents - devolvida.cents - reservada.cents) from gerada, devolvida, reservada;
$$;
revoke all on function public.payout_fee_credit_cents(uuid, text) from public, anon;
grant execute on function public.payout_fee_credit_cents(uuid, text) to authenticated, service_role;

create or replace function public.payout_fee_credit_reserve(p_company_id uuid, p_max_cents bigint, p_provider text default 'pagarme')
  returns table (reservation_id uuid, amount_cents bigint)
  language plpgsql security definer set search_path = public, pg_temp as $$
declare v_credit bigint; v_amt bigint; v_id uuid;
begin
  if p_max_cents is null or p_max_cents <= 0 then
    return query select null::uuid, 0::bigint; return;
  end if;
  perform pg_advisory_xact_lock(hashtext('payout_fee_credit:' || p_company_id::text));
  v_credit := public.payout_fee_credit_cents(p_company_id, p_provider);
  v_amt := least(v_credit, p_max_cents);
  if v_amt <= 0 then
    return query select null::uuid, 0::bigint; return;
  end if;
  insert into public.payout_fee_credit_reservation (company_id, provider, amount_cents, expires_at)
  values (p_company_id, p_provider, v_amt, now() + interval '15 minutes') returning id into v_id;
  return query select v_id, v_amt;
end $$;
revoke all on function public.payout_fee_credit_reserve(uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.payout_fee_credit_reserve(uuid, bigint, text) to service_role;

-- ── 9. payout_withdrawable: a taxa por conta da Movepark não entra no razão do parceiro ──
-- (corpo copiado de 20261120170000_estorno_do_master_libera_na_hora.sql; UMA linha muda, marcada)
-- [colar aqui a função inteira daquele arquivo, trocando
--    select coalesce(sum(w.amount_cents + w.fee_cents), 0) into v_withdrawn
--  por
--    select coalesce(sum(w.amount_cents + case when w.fee_borne_by = 'movepark' then 0 else w.fee_cents end), 0) into v_withdrawn
--  e acrescentando ao jsonb de retorno, antes de 'available_cents':
--    'fee_credit_cents', public.payout_fee_credit_cents(p_company_id),
-- ]

-- ── 10. partner_account_statement: origem do saque e a devolução do crédito ───────────────
-- (corpo copiado de 20261121030000_venda_em_custodia_na_conta.sql; mudanças marcadas)
-- [colar a função inteira daquele arquivo com três edições:
--  (a) no CTE `sales`, acrescentar `coalesce(p.fee_credit_returned_cents, 0)::bigint as fee_credit_returned_cents,`
--  (b) no ramo 'withdrawal', trocar as duas últimas colunas `null, w.status::text, w.failure_reason` por
--      `w.origin, w.status::text,
--       case when w.origin = 'automatic' then 'repasse automático · taxa por conta da Movepark' else w.failure_reason end`
--  (c) acrescentar antes do fechamento do CTE `moves`:
--      union all
--      -- Devolução da taxa do repasse automático: a Movepark cedeu ao parceiro, no split desta venda.
--      select 'fee_credit', s.paid_at, s.code, s.fee_credit_returned_cents, 0::bigint, 0::bigint,
--             s.fee_credit_returned_cents, 0::bigint, null, null, null, null,
--             'taxa do repasse automático devolvida pela Movepark'
--        from sales s where s.fee_credit_returned_cents > 0
-- ]

-- ── 11. Previsão: quando cai e quanto ─────────────────────────────────────────────────────
create or replace function public.payout_auto_forecast(p_company_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_days int := public.payout_release_days(p_company_id);
  v_next date := public.payout_next_auto_at(p_company_id);
  v_next_end timestamptz;
  v_released bigint := 0; v_transfers_in bigint := 0; v_withdrawn bigint := 0; v_debt bigint := 0;
  v_rec record; v_last record; v_forecast bigint; v_min bigint := public.payout_auto_min_cents();
  v_company_day int;
begin
  if not (public.is_hub_admin() or coalesce(auth.role(), '') = 'service_role') then
    if p_company_id not in (select public.current_company_ids())
       or not public.member_has_scope(p_company_id, 'finance:read') then
      raise exception 'Sem permissão para esta previsão.' using errcode = '42501';
    end if;
  end if;
  -- O ciclo deste mês já rodou: a próxima data é a do mês seguinte.
  if exists (select 1 from public.payout_auto_cycle y where y.company_id = p_company_id
              and y.cycle_month = date_trunc('month', v_next)::date and y.outcome <> 'running') then
    v_next := public.payout_next_auto_at(p_company_id, (date_trunc('month', v_next) + interval '1 month')::date);
  end if;
  v_next_end := ((v_next + 1)::timestamp) at time zone 'America/Sao_Paulo';

  with sales as (
    select p.paid_at, p.partner_release_at,
           coalesce((select sum((r->>'amount')::int) from jsonb_array_elements(p.split) r
                      where public.split_rule_is_partner(r)), 0)::bigint
           - coalesce(p.debt_recovered_cents, 0)
           - (case when coalesce((select bool_or(coalesce((r->>'chargeProcessingFee')::boolean, false))
                                   from jsonb_array_elements(p.split) r where public.split_rule_is_partner(r)), false)
                   then coalesce(p.gateway_fee_cents, 0) else 0 end)
           - coalesce(p.refund_partner_cents, 0) as net_cents,
           (case when p.refund_absorbed_by_master is true and p.amount > 0
                 then least(1::numeric, coalesce(p.refunded_amount, 0) / p.amount) else 0::numeric end) as master_ratio
      from public.payment p
      join public.booking b on b.id = p.booking_id
      join public.location l on l.id = b.location_id
     where l.company_id = p_company_id and p.provider = 'pagarme' and p.kind = 'booking'
       and p.status in ('paid', 'refunded') and p.paid_at is not null and p.split_sent_to_gateway is true
  )
  select coalesce(sum(case when greatest(coalesce(partner_release_at, paid_at), paid_at + make_interval(days => v_days)) <= v_next_end
                           then net_cents else round(net_cents * master_ratio) end), 0)
    into v_released from sales where net_cents > 0;
  select coalesce(sum(t.amount_cents), 0) into v_transfers_in
    from public.payout_transfer t where t.company_id = p_company_id and t.status = 'paid' and t.deleted_at is null;
  select coalesce(sum(w.amount_cents + case when w.fee_borne_by = 'movepark' then 0 else w.fee_cents end), 0) into v_withdrawn
    from public.payout_withdrawal w
   where w.company_id = p_company_id and w.deleted_at is null and w.status in ('created', 'processing', 'paid');
  v_debt := public.payout_debt_cents(p_company_id);
  select r.balance_available_cents, r.balance_waiting_cents, r.status::text as status, r.gateway_missing_at is not null as missing
    into v_rec from public.payout_recipient r
   where r.company_id = p_company_id and r.provider = 'pagarme' and r.deleted_at is null limit 1;
  v_forecast := greatest(0, least(
    v_released + v_transfers_in - v_debt - v_withdrawn,
    coalesce(v_rec.balance_available_cents, 0) + coalesce(v_rec.balance_waiting_cents, 0)));
  select y.cycle_month, y.outcome, y.amount_cents, y.available_cents, y.ran_at, y.reason into v_last
    from public.payout_auto_cycle y where y.company_id = p_company_id order by y.cycle_month desc limit 1;
  select c.payout_auto_day into v_company_day from public.company c where c.id = p_company_id;

  return jsonb_build_object(
    'company_id', p_company_id,
    'enabled', public.payout_auto_enabled(p_company_id),
    'day', public.payout_auto_day(p_company_id),
    'source', case when v_company_day is not null then 'company' else 'global' end,
    'next_at', v_next,
    'forecast_cents', v_forecast,
    'min_cents', v_min,
    'below_min', v_forecast < v_min,
    'recipient_status', v_rec.status,
    'recipient_missing', coalesce(v_rec.missing, false),
    'last_cycle', case when v_last.cycle_month is null then null else jsonb_build_object(
      'cycle_month', v_last.cycle_month, 'outcome', v_last.outcome, 'amount_cents', v_last.amount_cents,
      'available_cents', v_last.available_cents, 'ran_at', v_last.ran_at, 'reason', v_last.reason) end);
end $$;
revoke all on function public.payout_auto_forecast(uuid) from public, anon;
grant execute on function public.payout_auto_forecast(uuid) to authenticated, service_role;

-- ── 12. Chave do cron (Vault) e o cron ────────────────────────────────────────────────────
select vault.create_secret(
  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  'payout_auto_key',
  'Chave interna do cron payout-auto-run (cron envia no header; Edge lê via RPC).'
);
create or replace function public.payout_auto_expected_key() returns text
  language sql security definer set search_path to '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'payout_auto_key' limit 1;
$$;
revoke all on function public.payout_auto_expected_key() from public, anon, authenticated;
grant execute on function public.payout_auto_expected_key() to service_role;

select cron.schedule(
  'payout-auto-run',
  '0 12 * * *',
  $job$
  select net.http_post(
    url := 'https://mgaigbezdalbyuqiofcf.supabase.co/functions/v1/payout-auto-run',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-payout-auto-key', (select decrypted_secret from vault.decrypted_secrets where name = 'payout_auto_key')
    ),
    body := '{}'::jsonb
  );
  $job$
);
```

Os dois blocos "colar aqui" são cópia literal das funções nos arquivos citados com as edições marcadas; conferir depois com `grep -c "fee_borne_by = 'movepark'" supabase/migrations/20261127090000_repasse_automatico_mensal.sql` (esperado: 3).

- [ ] **Step 4: Rodar o pgTAP contra a migration**

Run: `bash $SP/tap.sh supabase/tests/payout_auto.test.sql supabase/migrations/20261127090000_repasse_automatico_mensal.sql`
Expected: `27/27` ok. Rodar também os que tocam o razão: `bash $SP/tap.sh supabase/tests/payout_withdrawable.test.sql supabase/migrations/20261127090000_repasse_automatico_mensal.sql` e `payout_statement_correcao.test.sql`, `payout_withdrawal.test.sql`, `payout_debt.test.sql` (todos verdes).

- [ ] **Step 5: Aplicar no vivo e editar os tipos**

```bash
supabase db query --linked -f supabase/migrations/20261127090000_repasse_automatico_mensal.sql
supabase migration repair --status applied 20261127090000
supabase db query --linked "select public.payout_auto_day(id), public.payout_next_auto_at(id) from public.company where slug = 'agencia-fera';"
```

`src/types/database.ts`: em `company` (Row/Insert/Update) acrescentar `payout_auto_day: number | null` e `payout_auto_enabled: boolean | null`; em `payout_withdrawal` acrescentar `origin: string`, `fee_borne_by: string`, `cycle_id: string | null` (Insert/Update opcionais); em `payment` acrescentar `fee_credit_returned_cents: number` e `fee_credit_reservation_id: string | null`; tabelas `payout_auto_cycle` e `payout_fee_credit_reservation` com as colunas acima; em `Functions`: `payout_auto_day`, `payout_auto_enabled`, `payout_auto_min_cents`, `payout_next_auto_at`, `payout_auto_due`, `company_set_payout_schedule: { Args: { p_company_id: string; p_day: number | null; p_enabled: boolean | null }; Returns: undefined }`, `payout_fee_credit_cents`, `payout_fee_credit_reserve`, `payout_auto_forecast: { Args: { p_company_id: string }; Returns: Json }`, `payout_auto_expected_key`.

- [ ] **Step 6: Typecheck e commit**

```bash
bun run typecheck
git add supabase/migrations/20261127090000_repasse_automatico_mensal.sql supabase/tests/payout_auto.test.sql src/types/database.ts
git commit -m "feat(payouts): repasse automatico mensal, ciclo por empresa e credito da taxa (schema + RPCs)"
git push origin main
```

---

### Task 2: `performWithdrawal` compartilhado e `recipient-withdraw` refatorado

**Files:**
- Create: `supabase/functions/_shared/payments/performWithdrawal.ts`
- Create: `supabase/functions/_shared/payments/performWithdrawal.test.ts`
- Modify: `supabase/functions/recipient-withdraw/index.ts` (o miolo entre a permissão e a resposta vira uma chamada)
- Modify: `supabase/functions/_shared/withdrawal-email.ts` (`WithdrawalEmailRow` ganha `origin` e `fee_borne_by`)

**Interfaces:**
- Produces:
```ts
export interface PerformWithdrawalArgs {
  companyId: string;
  amountCents: number;
  force: boolean;
  isHubAdmin: boolean;
  /** uuid de quem pediu, ou "payout-auto-run" no cron. */
  requestedBy: string;
  origin: "manual" | "automatic";
  feeBorneBy: "partner" | "movepark";
  cycleId?: string | null;
}
export type PerformWithdrawalResult =
  | { ok: true; withdrawal_id: string | null; external_transfer_id: string; status: string; requested_cents: number; amount_cents: number; fee_cents: number }
  | { ok: false; status: number; error: string; available_cents?: number; withdrawal_fee_cents?: number; raw?: unknown };
export async function performWithdrawal(admin: any, gateway: PaymentGateway, args: PerformWithdrawalArgs): Promise<PerformWithdrawalResult>
```
- Consumes: `withdrawPreflight`, `withdrawCap` (movidas de `recipient-withdraw/logic.ts` para `_shared/payments/withdraw-logic.ts`, com re-export no lugar antigo para o teste existente continuar valendo), `withdrawalPatch`, `logGatewayEvent`, `sendWithdrawalEmails`.

- [ ] **Step 1: Teste que falha (Deno)**

```ts
// supabase/functions/_shared/payments/performWithdrawal.test.ts
import { assertEquals } from "jsr:@std/assert";
import { performWithdrawal } from "./performWithdrawal.ts";

function fakeAdmin(state: { recipient: Record<string, unknown> | null; teto: Record<string, unknown>; rows: Record<string, unknown>[] }) {
  const table = (name: string) => {
    const q: Record<string, unknown> = {};
    const chain = () => q;
    Object.assign(q, {
      select: chain, eq: chain, is: chain, update: chain, insert: chain,
      maybeSingle: async () => ({ data: name === "payout_recipient" ? state.recipient : null, error: null }),
      upsert: (row: Record<string, unknown>) => { state.rows.push(row); return { select: () => ({ maybeSingle: async () => ({ data: { id: "w1", ...row }, error: null }) }) }; },
    });
    return q;
  };
  return {
    from: table,
    rpc: async (fn: string) => fn === "payout_withdrawable" ? { data: state.teto, error: null } : { data: null, error: null },
  };
}
const gateway = {
  getRecipientBalance: async () => ({ httpStatus: 200, availableCents: 10000, waitingFundsCents: 0, transferredCents: 0 }),
  createWithdrawal: async () => ({ httpStatus: 200, transferId: "tr_1", status: "processing", raw: {} }),
} as never;

Deno.test("performWithdrawal grava origem, quem paga a taxa e o ciclo", async () => {
  const state = { recipient: { id: "r1", external_recipient_id: "re_1", status: "active", gateway_missing_at: null }, teto: { available_cents: 5000, withdrawal_fee_cents: 367 }, rows: [] as Record<string, unknown>[] };
  const r = await performWithdrawal(fakeAdmin(state), gateway, {
    companyId: "d5337b66-7fab-4704-b746-26654024ae25", amountCents: 5000, force: false, isHubAdmin: false,
    requestedBy: "payout-auto-run", origin: "automatic", feeBorneBy: "movepark", cycleId: "cy1",
  });
  assertEquals(r.ok, true);
  const row = state.rows.find((x) => x.external_transfer_id === "tr_1")!;
  assertEquals([row.origin, row.fee_borne_by, row.cycle_id, row.amount_cents, row.fee_cents], ["automatic", "movepark", "cy1", 4633, 367]);
});

Deno.test("performWithdrawal recusa recebedor ausente no gateway com 409", async () => {
  const state = { recipient: { id: "r1", external_recipient_id: "re_1", status: "active", gateway_missing_at: "2026-09-26" }, teto: {}, rows: [] };
  const r = await performWithdrawal(fakeAdmin(state), gateway, {
    companyId: "d5337b66-7fab-4704-b746-26654024ae25", amountCents: 5000, force: false, isHubAdmin: false,
    requestedBy: "x", origin: "manual", feeBorneBy: "partner",
  });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.status, 409);
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `deno test --no-check --allow-env --allow-net --allow-read supabase/functions/_shared/payments/performWithdrawal.test.ts`
Expected: módulo não encontrado.

- [ ] **Step 3: Implementar**

`supabase/functions/_shared/payments/withdraw-logic.ts`: mover para cá, sem mudar, `WithdrawInput`, `parseWithdrawInput`, `withdrawPreflight`, `withdrawCap` de `recipient-withdraw/logic.ts`; o `logic.ts` antigo passa a ser `export * from "../_shared/payments/withdraw-logic.ts";`.

`supabase/functions/_shared/payments/performWithdrawal.ts`:

```ts
// Saque do recebedor para o banco, o mesmo para o botão Repassar (recipient-withdraw) e para o
// repasse automático (payout-auto-run). Spec: docs/specs/repasse-automatico-mensal.md.
//
// Pré-voo no saldo real, teto no NOSSO disponível (payout_withdrawable), pedido ao gateway com
// Idempotency-Key, linha em payout_withdrawal (origem e quem paga a taxa), e-mails, rastro e
// releitura do saldo. Nunca lança por erro de negócio: devolve { ok: false, status, error }.

import type { PaymentGateway } from "./types.ts";
import { withdrawalPatch } from "./withdrawal.ts";
import { logGatewayEvent } from "./trail.ts";
import { sendWithdrawalEmails } from "../withdrawal-email.ts";
import { withdrawCap, withdrawPreflight } from "./withdraw-logic.ts";

export interface PerformWithdrawalArgs {
  companyId: string;
  amountCents: number;
  force: boolean;
  isHubAdmin: boolean;
  requestedBy: string;
  origin: "manual" | "automatic";
  feeBorneBy: "partner" | "movepark";
  cycleId?: string | null;
}

export type PerformWithdrawalResult =
  | { ok: true; withdrawal_id: string | null; external_transfer_id: string; status: string; requested_cents: number; amount_cents: number; fee_cents: number }
  | { ok: false; status: number; error: string; available_cents?: number; withdrawal_fee_cents?: number; raw?: unknown };

// deno-lint-ignore no-explicit-any
export async function performWithdrawal(admin: any, gateway: PaymentGateway, args: PerformWithdrawalArgs): Promise<PerformWithdrawalResult> {
  const { data: recipient } = await admin
    .from("payout_recipient")
    .select("id, external_recipient_id, status, gateway_missing_at")
    .eq("company_id", args.companyId)
    .eq("provider", "pagarme")
    .is("deleted_at", null)
    .maybeSingle();
  if (!recipient?.external_recipient_id || recipient.status !== "active") {
    return { ok: false, status: 409, error: "A empresa não tem recebedor ativo no gateway." };
  }
  if (recipient.gateway_missing_at) {
    return { ok: false, status: 409, error: "O recebedor não existe no gateway; o saque morreria em 404." };
  }

  const saldo = await gateway.getRecipientBalance(recipient.external_recipient_id);
  const pre = withdrawPreflight(saldo, args.amountCents);
  if (!pre.ok) return { ok: false, status: pre.status, error: pre.reason, available_cents: saldo.availableCents ?? undefined };

  await admin.from("payout_recipient").update({
    balance_available_cents: saldo.availableCents ?? 0,
    balance_waiting_cents: saldo.waitingFundsCents ?? 0,
    balance_transferred_cents: saldo.transferredCents ?? 0,
    balance_synced_at: new Date().toISOString(),
  }).eq("id", recipient.id);
  const { data: teto, error: tetoErr } = await admin.rpc("payout_withdrawable", { p_company_id: args.companyId });
  if (tetoErr || !teto) return { ok: false, status: 500, error: "Não foi possível calcular o disponível para saque." };
  const tetoJson = teto as { available_cents?: number; withdrawal_fee_cents?: number };
  const feeCents = Number(tetoJson.withdrawal_fee_cents ?? 0);
  const cap = withdrawCap({
    amountCents: args.amountCents,
    availableCents: Number(tetoJson.available_cents ?? 0),
    feeCents,
    gatewayAvailableCents: saldo.availableCents,
    isHubAdmin: args.isHubAdmin,
    force: args.force,
  });
  if (!cap.ok) {
    return { ok: false, status: cap.status, error: cap.reason, available_cents: Number(tetoJson.available_cents ?? 0), withdrawal_fee_cents: feeCents };
  }

  const toBankCents = cap.toBankCents;
  const idempotencyKey = `wd-${crypto.randomUUID()}`;
  const result = await gateway.createWithdrawal({
    recipientId: recipient.external_recipient_id,
    amountCents: toBankCents,
    idempotencyKey,
    metadata: { company_id: args.companyId, requested_by: args.requestedBy, requested_cents: String(args.amountCents), origin: args.origin },
  });
  const http = result.httpStatus ?? 0;
  if (http < 200 || http >= 300 || !result.transferId) {
    console.error("[performWithdrawal] gateway recusou:", http, JSON.stringify(result.raw));
    return { ok: false, status: 502, error: `O gateway recusou o saque (HTTP ${http}).`, raw: result.raw };
  }

  const nowIso = new Date().toISOString();
  const patch = withdrawalPatch({ result, nowIso }) ?? {};
  const status = (patch.status as string | undefined) ?? "created";
  const { data: row, error: rowErr } = await admin
    .from("payout_withdrawal")
    .upsert(
      {
        company_id: args.companyId,
        provider: "pagarme",
        external_transfer_id: result.transferId,
        external_recipient_id: recipient.external_recipient_id,
        amount_cents: toBankCents,
        fee_cents: feeCents,
        origin: args.origin,
        fee_borne_by: args.feeBorneBy,
        cycle_id: args.cycleId ?? null,
        requested_at: nowIso,
        ...patch,
        status,
      },
      { onConflict: "provider,external_transfer_id" },
    )
    .select("id, company_id, amount_cents, fee_cents, status, expected_at, paid_at, failure_reason, requested_email_sent_at, settled_email_sent_at, raw, origin, fee_borne_by")
    .maybeSingle();
  if (rowErr) console.error("[performWithdrawal] saque pedido mas a linha não gravou:", rowErr.message);
  if (row) await sendWithdrawalEmails(admin, row);

  await logGatewayEvent(admin, {
    paymentId: null,
    bookingId: null,
    kind: args.origin === "automatic" ? "withdrawal:automatic" : "withdrawal",
    httpStatus: result.httpStatus,
    request: { company_id: args.companyId, recipient_id: recipient.external_recipient_id, amount: toBankCents, requested_cents: args.amountCents, force: args.force, origin: args.origin, fee_borne_by: args.feeBorneBy },
    response: result.raw ?? null,
    note: `saque ${status} · transfer ${result.transferId}`,
  });

  try {
    const depois = await gateway.getRecipientBalance(recipient.external_recipient_id);
    if ((depois.httpStatus ?? 0) >= 200 && (depois.httpStatus ?? 0) < 300 && depois.availableCents != null) {
      await admin.from("payout_recipient").update({
        balance_available_cents: depois.availableCents,
        balance_waiting_cents: depois.waitingFundsCents ?? 0,
        balance_transferred_cents: depois.transferredCents ?? 0,
        balance_synced_at: new Date().toISOString(),
      }).eq("id", recipient.id);
    }
  } catch (e) {
    console.error("[performWithdrawal] releitura do saldo falhou:", e);
  }

  return {
    ok: true,
    withdrawal_id: row?.id ?? null,
    external_transfer_id: result.transferId,
    status,
    requested_cents: args.amountCents,
    amount_cents: toBankCents,
    fee_cents: feeCents,
  };
}
```

`recipient-withdraw/index.ts`: depois da checagem de permissão, tudo até o `return jsonResponse({ ok: true, ... })` vira:

```ts
  let gateway;
  try {
    gateway = getGateway("pagarme");
  } catch (e) {
    if (e instanceof GatewayConfigError) return jsonResponse({ error: e.message }, 503);
    throw e;
  }
  const r = await performWithdrawal(admin, gateway, {
    companyId: input.companyId, amountCents: input.amountCents, force: input.force, isHubAdmin,
    requestedBy: userData.user.id, origin: "manual", feeBorneBy: "partner",
  });
  if (!r.ok) {
    const { status, ...body } = r;
    return jsonResponse(body, status);
  }
  return jsonResponse(r);
```

(o corpo de erro mantém `error`, `available_cents`, `withdrawal_fee_cents`, `raw`, como antes). Trocar os imports: `import { performWithdrawal } from "../_shared/payments/performWithdrawal.ts";` e `import { parseWithdrawInput } from "./logic.ts";`.

`withdrawal-email.ts`: `WithdrawalEmailRow` ganha `origin?: string | null; fee_borne_by?: string | null;` (usados na Task 5).

- [ ] **Step 4: Rodar os testes**

Run: `deno test --no-check --allow-env --allow-net --allow-read supabase/functions/_shared/payments/performWithdrawal.test.ts supabase/functions/recipient-withdraw/`
Expected: todos passam (os do `logic.test.ts` continuam valendo pelo re-export).

- [ ] **Step 5: Deploy e commit**

```bash
supabase functions deploy recipient-withdraw
git add supabase/functions/_shared/payments/performWithdrawal.ts supabase/functions/_shared/payments/performWithdrawal.test.ts supabase/functions/_shared/payments/withdraw-logic.ts supabase/functions/recipient-withdraw supabase/functions/_shared/withdrawal-email.ts
git commit -m "refactor(payouts): miolo do saque vira performWithdrawal compartilhado, com origem e quem paga a taxa"
git push origin main
```

---

### Task 3: Edge `payout-auto-run` (o cron) e a prova com `dry_run`

**Files:**
- Create: `supabase/functions/payout-auto-run/index.ts`
- Create: `supabase/functions/payout-auto-run/logic.ts`
- Create: `supabase/functions/payout-auto-run/logic.test.ts`
- Modify: `supabase/config.toml` (`[functions.payout-auto-run] verify_jwt = false`, como `reconcile-refunds`)

**Interfaces:**
- Produces: `POST /functions/v1/payout-auto-run` com header `x-payout-auto-key` (cron) ou `Authorization: Bearer <JWT hub_admin>`; corpo `{ dry_run?: boolean, company_id?: string, today?: "YYYY-MM-DD" }` (`today` só com JWT de hub_admin) → `{ ok, today, due: n, results: [{ company_id, outcome, available_cents, amount_cents, withdrawal_id, reason }] }`.
- Produces (puro): `brtToday(now: Date): string`, `decideOutcome(args: { availableCents: number; minCents: number; gatewayAvailableCents: number | null }): "withdraw" | "below_min" | "no_balance"`.
- Consumes: `payout_auto_due`, `payout_auto_min_cents`, `payout_withdrawable`, `performWithdrawal`, `payout_auto_cycle`.

- [ ] **Step 1: Teste que falha**

```ts
// supabase/functions/payout-auto-run/logic.test.ts
import { assertEquals } from "jsr:@std/assert";
import { brtToday, decideOutcome, parseRunInput } from "./logic.ts";

Deno.test("brtToday: 01:00 UTC ainda é o dia anterior em Brasília", () => {
  assertEquals(brtToday(new Date("2026-10-10T01:00:00Z")), "2026-10-09");
  assertEquals(brtToday(new Date("2026-10-10T12:00:00Z")), "2026-10-10");
});

Deno.test("decideOutcome: abaixo do mínimo acumula; sem saldo no gateway espera; senão saca", () => {
  assertEquals(decideOutcome({ availableCents: 4999, minCents: 5000, gatewayAvailableCents: 10000 }), "below_min");
  assertEquals(decideOutcome({ availableCents: 5000, minCents: 5000, gatewayAvailableCents: 0 }), "no_balance");
  assertEquals(decideOutcome({ availableCents: 5000, minCents: 5000, gatewayAvailableCents: 10000 }), "withdraw");
});

Deno.test("parseRunInput: today só vale com hub_admin; company_id precisa ser uuid", () => {
  assertEquals(parseRunInput({ today: "2026-10-10" }, false).today, null);
  assertEquals(parseRunInput({ today: "2026-10-10" }, true).today, "2026-10-10");
  assertEquals(parseRunInput({ company_id: "x" }, true).companyId, null);
  assertEquals(parseRunInput({ dry_run: true }, false).dryRun, true);
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `deno test --no-check --allow-env --allow-net --allow-read supabase/functions/payout-auto-run/`
Expected: módulo não encontrado.

- [ ] **Step 3: Implementar**

`logic.ts`:

```ts
// Lógica pura do repasse automático (E0.3.13), sem rede, para caber em teste.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Data de hoje em Brasília (YYYY-MM-DD): o dia do repasse é o dia do parceiro, não o UTC. */
export function brtToday(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export type AutoOutcome = "withdraw" | "below_min" | "no_balance";

export function decideOutcome(a: { availableCents: number; minCents: number; gatewayAvailableCents: number | null }): AutoOutcome {
  if (a.availableCents < a.minCents) return "below_min";
  if ((a.gatewayAvailableCents ?? 0) < a.availableCents) return "no_balance";
  return "withdraw";
}

export interface RunInput { dryRun: boolean; companyId: string | null; today: string | null }

export function parseRunInput(body: unknown, isHubAdmin: boolean): RunInput {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  return {
    dryRun: b.dry_run === true,
    companyId: typeof b.company_id === "string" && UUID_RE.test(b.company_id) ? b.company_id : null,
    today: isHubAdmin && typeof b.today === "string" && DATE_RE.test(b.today) ? b.today : null,
  };
}
```

`index.ts`:

```ts
// Edge Function: /payout-auto-run (E0.3.13, repasse automático mensal)
//
// Chamada pelo pg_cron todo dia às 12:00 UTC (9h de Brasília) com o header x-payout-auto-key (Vault),
// ou por hub_admin (JWT) para rodar à mão. Para cada empresa cujo dia de repasse é hoje
// (payout_auto_due), abre o ciclo do mês (unique: rodar duas vezes não saca duas vezes), relê o
// saldo, calcula o disponível e saca tudo com origin=automatic e fee_borne_by=movepark; abaixo do
// mínimo fecha como below_min e o valor acumula para o mês seguinte.
//
// POST /functions/v1/payout-auto-run   { dry_run?: boolean, company_id?: uuid, today?: "YYYY-MM-DD" }
// → { ok, today, due, results: [{ company_id, outcome, available_cents, amount_cents, withdrawal_id, reason }] }
// Spec: docs/specs/repasse-automatico-mensal.md

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getGateway, GatewayConfigError } from "../_shared/payments/index.ts";
import { performWithdrawal } from "../_shared/payments/performWithdrawal.ts";
import { logGatewayEvent } from "../_shared/payments/trail.ts";
import { brtToday, decideOutcome, parseRunInput } from "./logic.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

  // Quem chama: o cron (chave do Vault) ou hub_admin (JWT).
  let isHubAdmin = false;
  const { data: expected } = await admin.rpc("payout_auto_expected_key");
  const keyOk = Boolean(expected) && req.headers.get("x-payout-auto-key") === expected;
  if (!keyOk) {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false }, global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: "unauthorized" }, 401);
    const { data: prof } = await admin.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
    if (prof?.role !== "hub_admin") return json({ error: "Só hub_admin roda o repasse à mão." }, 403);
    isHubAdmin = true;
  }

  const input = parseRunInput(await req.json().catch(() => ({})), isHubAdmin);
  const today = input.today ?? brtToday(new Date());

  let gateway;
  try {
    gateway = getGateway("pagarme");
  } catch (e) {
    if (e instanceof GatewayConfigError) return json({ error: e.message }, 503);
    throw e;
  }

  const { data: due, error: dueErr } = await admin.rpc("payout_auto_due", { p_today: today });
  if (dueErr) return json({ error: dueErr.message }, 500);
  const { data: minRaw } = await admin.rpc("payout_auto_min_cents");
  const minCents = Number(minRaw ?? 5000);
  const alvo = (due ?? []).filter((d: { company_id: string }) => !input.companyId || d.company_id === input.companyId);

  const results: Record<string, unknown>[] = [];
  for (const d of alvo as { company_id: string; scheduled_for: string }[]) {
    const cycleMonth = `${today.slice(0, 7)}-01`;
    if (input.dryRun) {
      const { data: teto } = await admin.rpc("payout_withdrawable", { p_company_id: d.company_id });
      const t = (teto ?? {}) as { available_cents?: number; gateway_available_cents?: number | null };
      results.push({ company_id: d.company_id, outcome: decideOutcome({ availableCents: Number(t.available_cents ?? 0), minCents, gatewayAvailableCents: t.gateway_available_cents ?? null }), available_cents: t.available_cents ?? 0, dry_run: true });
      continue;
    }
    // Abre o ciclo. Conflito = já rodou este mês (outra instância ou rerun): pula.
    const { data: cycle } = await admin
      .from("payout_auto_cycle")
      .upsert({ company_id: d.company_id, cycle_month: cycleMonth, scheduled_for: today, outcome: "running" }, { onConflict: "company_id,cycle_month", ignoreDuplicates: true })
      .select("id")
      .maybeSingle();
    if (!cycle) { results.push({ company_id: d.company_id, outcome: "already_ran" }); continue; }

    const fechar = (patch: Record<string, unknown>) => admin.from("payout_auto_cycle").update(patch).eq("id", cycle.id);
    try {
      const { data: rec } = await admin.from("payout_recipient").select("id, external_recipient_id").eq("company_id", d.company_id).eq("provider", "pagarme").is("deleted_at", null).maybeSingle();
      if (!rec?.external_recipient_id) { await fechar({ outcome: "no_recipient", reason: "sem recebedor" }); results.push({ company_id: d.company_id, outcome: "no_recipient" }); continue; }
      const saldo = await gateway.getRecipientBalance(rec.external_recipient_id);
      if ((saldo.httpStatus ?? 0) >= 200 && (saldo.httpStatus ?? 0) < 300 && saldo.availableCents != null) {
        await admin.from("payout_recipient").update({ balance_available_cents: saldo.availableCents, balance_waiting_cents: saldo.waitingFundsCents ?? 0, balance_transferred_cents: saldo.transferredCents ?? 0, balance_synced_at: new Date().toISOString() }).eq("id", rec.id);
      }
      const { data: teto, error: tetoErr } = await admin.rpc("payout_withdrawable", { p_company_id: d.company_id });
      if (tetoErr || !teto) { await fechar({ outcome: "failed", reason: "sem disponível calculado" }); results.push({ company_id: d.company_id, outcome: "failed", reason: "sem disponível calculado" }); continue; }
      const t = teto as { available_cents?: number; gateway_available_cents?: number | null };
      const availableCents = Number(t.available_cents ?? 0);
      const decision = decideOutcome({ availableCents, minCents, gatewayAvailableCents: saldo.availableCents ?? t.gateway_available_cents ?? null });
      if (decision !== "withdraw") {
        await fechar({ outcome: decision, available_cents: availableCents, reason: decision === "below_min" ? `abaixo do mínimo de ${minCents} centavos` : "saldo no gateway não cobre o disponível" });
        results.push({ company_id: d.company_id, outcome: decision, available_cents: availableCents });
        continue;
      }
      const r = await performWithdrawal(admin, gateway, {
        companyId: d.company_id, amountCents: availableCents, force: false, isHubAdmin: false,
        requestedBy: "payout-auto-run", origin: "automatic", feeBorneBy: "movepark", cycleId: cycle.id,
      });
      if (r.ok) {
        await fechar({ outcome: "paid", available_cents: availableCents, amount_cents: r.amount_cents, withdrawal_id: r.withdrawal_id });
        results.push({ company_id: d.company_id, outcome: "paid", available_cents: availableCents, amount_cents: r.amount_cents, withdrawal_id: r.withdrawal_id });
      } else {
        await fechar({ outcome: "failed", available_cents: availableCents, reason: r.error });
        results.push({ company_id: d.company_id, outcome: "failed", available_cents: availableCents, reason: r.error });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await fechar({ outcome: "failed", reason: msg });
      results.push({ company_id: d.company_id, outcome: "failed", reason: msg });
    }
  }

  await logGatewayEvent(admin, {
    paymentId: null, bookingId: null, kind: "payout-auto-run", httpStatus: 200,
    request: { today, dry_run: input.dryRun, company_id: input.companyId },
    response: { due: alvo.length, results },
    note: `repasse automático: ${results.filter((r) => r.outcome === "paid").length} pagos de ${alvo.length}`,
  });
  return json({ ok: true, today, due: alvo.length, results });
});
```

`supabase/config.toml`: acrescentar

```toml
[functions.payout-auto-run]
verify_jwt = false
```

- [ ] **Step 4: Rodar os testes**

Run: `deno test --no-check --allow-env --allow-net --allow-read supabase/functions/payout-auto-run/`
Expected: 3 passam.

- [ ] **Step 5: Deploy e prova com `dry_run`**

```bash
supabase functions deploy payout-auto-run --no-verify-jwt
```

Com o JWT de `developer@fera.ag` (gerado por `generate_link` + `verify`, como nas sessões anteriores):

```bash
curl -s -X POST https://mgaigbezdalbyuqiofcf.supabase.co/functions/v1/payout-auto-run \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"dry_run": true, "today": "2026-10-10"}'
```

Expected: `{"ok":true,"today":"2026-10-10","due":N,"results":[...]}` com cada empresa ativa e o desfecho previsto; nada gravado (`select count(*) from public.payout_auto_cycle` = 0).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/payout-auto-run supabase/config.toml
git commit -m "feat(payouts): edge payout-auto-run, o cron do repasse mensal (ciclo por empresa, minimo, dry_run)"
git push origin main
```

---

### Task 4: Crédito da taxa no split (Edges de cobrança)

**Files:**
- Modify: `supabase/functions/_shared/payments/split.ts` (`splitForGateway` ganha o quarto argumento `feeCreditCents`)
- Modify: `supabase/functions/_shared/payments/split.test.ts`
- Modify: `supabase/functions/create-pix-charge/index.ts` e `supabase/functions/create-card-charge/index.ts` (reserva, payload, gravação, consumo)

**Interfaces:**
- Produces: `splitForGateway(rules, debtRecoveryCents, moveparkRecipientId, feeCreditCents = 0)`; `MOVEPARK_LEG_FLOOR_CENTS = 100`.
- Consumes: `payout_fee_credit_reserve(p_company_id, p_max_cents)`; colunas `payment.fee_credit_returned_cents`, `payment.fee_credit_reservation_id`; `payout_fee_credit_reservation.consumed_by_payment_id`.

- [ ] **Step 1: Testes que falham**

Acrescentar em `split.test.ts`:

```ts
Deno.test("splitForGateway: crédito da taxa sai da Movepark e vai ao parceiro, total intacto", () => {
  const rules = buildSplit({ chargedCents: 10000, baseCents: 10000, takeRateBps: 2000, moveparkRecipientId: "re_mp", partnerRecipientId: "re_p" });
  const out = splitForGateway(rules, 0, "re_mp", 367)!;
  assertEquals(out.map((r) => [r.role, r.amount]), [["partner", 8367], ["movepark", 1633]]);
  assertEquals(out.reduce((a, r) => a + r.amount, 0), 10000);
});

Deno.test("splitForGateway: o crédito respeita o piso de R$ 1,00 da perna da Movepark", () => {
  const rules = buildSplit({ chargedCents: 1000, baseCents: 1000, takeRateBps: 2000, moveparkRecipientId: "re_mp", partnerRecipientId: "re_p" });
  // Movepark tem 200; cede no máximo 100
  const out = splitForGateway(rules, 0, "re_mp", 367)!;
  assertEquals(out.map((r) => [r.role, r.amount]), [["partner", 900], ["movepark", 100]]);
});

Deno.test("splitForGateway: dívida abate antes, crédito devolve depois", () => {
  const rules = buildSplit({ chargedCents: 10000, baseCents: 10000, takeRateBps: 2000, moveparkRecipientId: "re_mp", partnerRecipientId: "re_p" });
  const out = splitForGateway(rules, 3000, "re_mp", 367)!;
  assertEquals(out.map((r) => [r.role, r.amount]), [["partner", 5367], ["movepark", 4633]]);
});

Deno.test("splitForGateway: sem perna da Movepark não há de onde devolver", () => {
  const rules = buildSplit({ chargedCents: 10000, baseCents: 10000, takeRateBps: 0, moveparkRecipientId: "re_mp", partnerRecipientId: "re_p" });
  assertEquals(splitForGateway(rules, 0, "re_mp", 367), rules);
});

Deno.test("appliedFeeCreditCents: quanto do crédito coube nesta venda", () => {
  const rules = buildSplit({ chargedCents: 1000, baseCents: 1000, takeRateBps: 2000, moveparkRecipientId: "re_mp", partnerRecipientId: "re_p" });
  assertEquals(appliedFeeCreditCents(rules, 0, 367), 100);
  assertEquals(appliedFeeCreditCents(rules, 0, 50), 50);
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `deno test --no-check --allow-env --allow-net --allow-read supabase/functions/_shared/payments/split.test.ts`
Expected: falha nos 5 novos.

- [ ] **Step 3: Implementar em `split.ts`**

Renomear a função atual para `splitAfterDebt(rules, debtRecoveryCents, moveparkRecipientId)` (corpo idêntico) e escrever por cima:

```ts
/** A perna da Movepark nunca fica abaixo disto ao devolver crédito (regra zerada o gateway recusa). */
export const MOVEPARK_LEG_FLOOR_CENTS = 100;

/**
 * Quanto do crédito da taxa (repasse automático, E0.3.13) cabe nesta venda: até a perna da Movepark
 * DEPOIS do abatimento de dívida, respeitando o piso. O resto espera a próxima venda.
 */
export function appliedFeeCreditCents(rules: SplitRule[], debtRecoveryCents: number, feeCreditCents: number): number {
  const credit = Math.max(0, Math.floor(feeCreditCents || 0));
  if (credit === 0) return 0;
  let after: SplitRule[] | undefined;
  try {
    after = splitAfterDebt(rules, debtRecoveryCents, null);
  } catch {
    // Sem perna da Movepark no razão e sem id do master não há de onde devolver.
    return 0;
  }
  if (!after) return 0;
  const partner = partnerRule(after);
  const movepark = after.find((r) => r !== partner);
  if (!movepark) return 0;
  return Math.max(0, Math.min(credit, movepark.amount - MOVEPARK_LEG_FLOOR_CENTS));
}

/**
 * O que VAI ao gateway: perna do parceiro menos abatimento de dívida (E0.3.5), MAIS o crédito da
 * taxa do repasse automático que a Movepark devolve (E0.3.13). Total intacto.
 */
export function splitForGateway(
  rules: SplitRule[],
  debtRecoveryCents: number,
  moveparkRecipientId: string | null,
  feeCreditCents = 0,
): SplitRule[] | undefined {
  const base = splitAfterDebt(rules, debtRecoveryCents, moveparkRecipientId);
  const applied = appliedFeeCreditCents(rules, debtRecoveryCents, feeCreditCents);
  if (!base || applied === 0) return base;
  const partner = partnerRule(base);
  const movepark = base.find((r) => r !== partner);
  if (!partner || !movepark) return base;
  const out = base.map((r) =>
    r === partner ? { ...r, amount: r.amount + applied } : { ...r, amount: r.amount - applied },
  );
  const total = rules.reduce((a, r) => a + r.amount, 0);
  const soma = out.reduce((a, r) => a + r.amount, 0);
  if (soma !== total) throw new Error(`Split com crédito não fecha: soma ${soma} != total ${total}.`);
  return out;
}
```

- [ ] **Step 4: Edges de cobrança**

Em `create-pix-charge/index.ts` e `create-card-charge/index.ts`, logo depois do bloco da reserva de dívida (dentro do `if (splitEnabled)`), antes do `try { gatewaySplit = splitForGateway(...) }`:

```ts
    // 4c. Crédito da taxa do repasse automático (E0.3.13): a Movepark devolve nesta venda o que
    // ficou devendo ao parceiro, até a perna dela depois do abatimento. Reserva com lock, como a dívida.
    let feeCreditCents = 0;
    let feeCreditReservationId: string | null = null;
    const { data: credito, error: creditoErr } = await admin.rpc("payout_fee_credit_reserve", {
      p_company_id: location.company_id,
      p_max_cents: appliedFeeCreditCents(split, debtRecoveryCents, Number.MAX_SAFE_INTEGER),
    });
    if (creditoErr) {
      console.error("[%s] payout_fee_credit_reserve falhou:", EDGE_NAME, creditoErr.message);
    } else {
      const c = (Array.isArray(credito) ? credito[0] : credito) as { reservation_id: string | null; amount_cents: number | string | null } | null;
      feeCreditCents = Number(c?.amount_cents ?? 0) || 0;
      feeCreditReservationId = c?.reservation_id ?? null;
    }
```

e a chamada vira `splitForGateway(split, debtRecoveryCents, moveparkRecipientId, feeCreditCents)`. Na gravação da `payment` (onde já vão `debt_recovered_cents` e `debt_reservation_id`) acrescentar `fee_credit_returned_cents: feeCreditCents, fee_credit_reservation_id: feeCreditReservationId`. Onde a reserva de dívida é consumida (`.update({ consumed_by_payment_id: paymentId })`), acrescentar o mesmo para `payout_fee_credit_reservation` quando `feeCreditReservationId` existir. Import: `appliedFeeCreditCents` de `../_shared/payments/split.ts`. Declarar `let feeCreditCents = 0; let feeCreditReservationId: string | null = null;` fora do `if` (são usados na gravação).

- [ ] **Step 5: Rodar os testes das Edges**

Run: `deno test --no-check --allow-env --allow-net --allow-read supabase/functions/_shared/payments/ supabase/functions/create-pix-charge/ supabase/functions/create-card-charge/`
Expected: verde (os contratos de custódia/split existentes continuam passando: sem crédito, o payload é o de antes).

- [ ] **Step 6: Deploy e commit**

```bash
supabase functions deploy create-pix-charge
supabase functions deploy create-card-charge
git add supabase/functions/_shared/payments/split.ts supabase/functions/_shared/payments/split.test.ts supabase/functions/create-pix-charge/index.ts supabase/functions/create-card-charge/index.ts
git commit -m "feat(payouts): credito da taxa do repasse automatico devolvido pelo split da proxima venda"
git push origin main
```

---

### Task 5: E-mails do repasse automático

**Files:**
- Modify: `supabase/functions/_shared/email.ts` (`WithdrawalMail.automatic`, copy dos três templates)
- Modify: `supabase/functions/_shared/withdrawal-email.ts` (passa `automatic`)
- Modify: `supabase/functions/_shared/email.test.ts`

- [ ] **Step 1: Teste que falha**

Acrescentar em `email.test.ts`, ao lado do teste de `tplWithdrawalRequested`:

```ts
Deno.test("saque automático: assunto de repasse mensal e taxa por conta da Movepark", () => {
  const pedido = tplWithdrawalRequested({ ...base, automatic: true });
  assertStringIncludes(pedido.subject, "Seu repasse mensal de");
  assertStringIncludes(pedido.html, "Sem taxa para você");
  assertStringIncludes(pedido.html, "por conta da Movepark");
  const caiu = tplWithdrawalPaid({ ...base, automatic: true, paidAt: "2026-10-10T13:05:00.000Z" });
  assertStringIncludes(caiu.subject, "Repasse mensal de");
  assertStringIncludes(caiu.html, "por conta da Movepark");
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `deno test --no-check --allow-env --allow-net --allow-read supabase/functions/_shared/email.test.ts`
Expected: falha (tipo sem `automatic`, textos ausentes).

- [ ] **Step 3: Implementar**

`email.ts`: `WithdrawalMail` ganha `/** Repasse automático mensal: sem taxa para o parceiro. */ automatic?: boolean;`. Em `tplWithdrawalRequested`:

```ts
  const taxa = w.automatic
    ? `Sem taxa para você: a taxa de saque de ${cents(w.feeCents)} é por conta da Movepark.`
    : `A taxa de saque foi de ${cents(w.feeCents)}, descontada do valor pedido.`;
  return {
    subject: w.automatic ? `Seu repasse mensal de ${cents(w.amountCents)} está a caminho` : `Saque de ${cents(w.amountCents)} a caminho da sua conta`,
    html: shell(w.automatic ? "Seu repasse mensal está a caminho" : "Seu saque está a caminho", `
      <p style="margin:0 0 14px">Olá, ${escapeHtml(firstName(w.contactName))}. ${w.automatic ? "O repasse automático" : "O saque"} de <strong>${escapeHtml(w.companyName)}</strong> saiu do saldo e está em processamento no banco.</p>
      <p style="margin:0 0 14px"><strong>${cents(w.amountCents)}</strong> vão cair na conta${w.accountTail ? ` final ${escapeHtml(w.accountTail)}` : ""}. ${taxa}</p>
      ...resto igual...
```

Em `tplWithdrawalPaid`: assunto `w.automatic ? \`Repasse mensal de ${cents(w.amountCents)} enviado ao seu banco\` : ...` e a linha da taxa `w.automatic ? "Taxa de saque por conta da Movepark." : \`Taxa de saque: ${cents(w.feeCents)}.\``. Em `tplWithdrawalFailed`, só o texto "O repasse automático"/"O saque" no primeiro parágrafo.

`withdrawal-email.ts`: em `dados`, `automatic: row.origin === "automatic"`.

- [ ] **Step 4: Rodar**

Run: `deno test --no-check --allow-env --allow-net --allow-read supabase/functions/_shared/email.test.ts supabase/functions/_shared/withdrawal-email.test.ts`
Expected: verde.

- [ ] **Step 5: Deploy das Edges que mandam esse e-mail e commit**

```bash
supabase functions deploy recipient-withdraw
supabase functions deploy payout-auto-run --no-verify-jwt
supabase functions deploy reconcile-payout-transfers
supabase functions deploy pagarme-webhook --no-verify-jwt
git add supabase/functions/_shared/email.ts supabase/functions/_shared/email.test.ts supabase/functions/_shared/withdrawal-email.ts
git commit -m "feat(payouts): e-mails do repasse automatico (sem taxa para o parceiro)"
git push origin main
```

(conferir os nomes reais das Edges de webhook e conciliação com `ls supabase/functions | grep -i "webhook\|reconcile-payout"` antes do deploy.)

---

### Task 6: Card "Próximo repasse automático" e a copy do saque manual (conta do parceiro)

**Files:**
- Modify: `src/features/payouts/api.ts` (`usePayoutAutoForecast`, `useSetCompanyPayoutSchedule`, tipo `PayoutAutoForecast`, `PayoutWithdrawable.fee_credit_cents`)
- Modify: `src/features/payouts/api.test.tsx`
- Create: `src/features/payouts/PayoutScheduleCard.tsx`
- Create: `src/features/payouts/PayoutScheduleCard.test.tsx`
- Create: `src/features/payouts/schedule.logic.ts` + `schedule.logic.test.ts`
- Modify: `src/features/payouts/PartnerAccount.tsx` (card no topo; copy do diálogo)
- Modify: `src/features/payouts/PartnerAccount.test.tsx`
- Modify: `src/features/payouts/account.logic.ts` (`MovementKind` + `MOVEMENT_LABEL` ganham `fee_credit`)

**Interfaces:**
- Produces:
```ts
export type PayoutAutoForecast = {
  company_id: string; enabled: boolean; day: number; source: "company" | "global";
  next_at: string; forecast_cents: number; min_cents: number; below_min: boolean;
  recipient_status: string | null; recipient_missing: boolean;
  last_cycle: { cycle_month: string; outcome: string; amount_cents: number | null; available_cents: number | null; ran_at: string; reason: string | null } | null;
};
export function usePayoutAutoForecast(companyId: string | undefined): UseQueryResult<PayoutAutoForecast>
export function useSetCompanyPayoutSchedule(): UseMutationResult<void, Error, { company_id: string; day: number | null; enabled: boolean | null }>
// schedule.logic.ts
export function scheduleHeadline(f: PayoutAutoForecast, brl: (c: number) => string, partnerView: boolean): { title: string; value: string; caption: string; tone: "ok" | "muted" | "warn" }
export function lastCycleLabel(f: PayoutAutoForecast, brl: (c: number) => string): string | null
export function manualWithdrawCaption(feeCents: number, day: number, brl: (c: number) => string): string
```

- [ ] **Step 1: Testes que falham**

`schedule.logic.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { lastCycleLabel, manualWithdrawCaption, scheduleHeadline } from "./schedule.logic";

const brl = (c: number) => `R$ ${(c / 100).toFixed(2).replace(".", ",")}`;
const base = {
  company_id: "c1", enabled: true, day: 10, source: "global" as const, next_at: "2026-10-10",
  forecast_cents: 14133, min_cents: 5000, below_min: false, recipient_status: "active", recipient_missing: false, last_cycle: null,
};

describe("scheduleHeadline", () => {
  it("diz a data, o valor previsto e que não tem taxa", () => {
    const h = scheduleHeadline(base, brl, true);
    expect(h.value).toBe("R$ 141,33");
    expect(h.caption).toMatch(/10 de out/);
    expect(h.caption).toMatch(/sem taxa para você/);
    expect(h.tone).toBe("ok");
  });
  it("abaixo do mínimo avisa que acumula", () => {
    const h = scheduleHeadline({ ...base, forecast_cents: 1200, below_min: true }, brl, true);
    expect(h.caption).toMatch(/abaixo de R\$ 50,00/);
    expect(h.caption).toMatch(/acumula para o mês seguinte/);
    expect(h.tone).toBe("muted");
  });
  it("desligado: parceiro fala com a Movepark, Manager vê o motivo", () => {
    expect(scheduleHeadline({ ...base, enabled: false }, brl, true).caption).toMatch(/fale com a Movepark/);
    expect(scheduleHeadline({ ...base, enabled: false, source: "company" }, brl, false).caption).toMatch(/desligado para esta empresa/);
  });
  it("recebedor faltando: avisa antes de prometer data", () => {
    expect(scheduleHeadline({ ...base, recipient_missing: true }, brl, true).tone).toBe("warn");
  });
});

describe("lastCycleLabel", () => {
  it("resume o último ciclo", () => {
    expect(lastCycleLabel({ ...base, last_cycle: { cycle_month: "2026-09-01", outcome: "paid", amount_cents: 4633, available_cents: 5000, ran_at: "2026-09-10T12:00:00Z", reason: null } }, brl)).toBe("Último repasse automático em 10/09/2026: R$ 46,33 enviados ao banco.");
    expect(lastCycleLabel({ ...base, last_cycle: { cycle_month: "2026-09-01", outcome: "below_min", amount_cents: null, available_cents: 1200, ran_at: "2026-09-10T12:00:00Z", reason: "x" } }, brl)).toBe("Em 10/09/2026 não saiu: R$ 12,00 disponíveis, abaixo do mínimo. Acumula.");
    expect(lastCycleLabel(base, brl)).toBeNull();
  });
});

describe("manualWithdrawCaption", () => {
  it("deixa a taxa e a alternativa grátis claras", () => {
    expect(manualWithdrawCaption(367, 10, brl)).toBe("Saque manual: a Pagar.me cobra R$ 3,67 do seu saldo. O repasse automático do dia 10 não tem taxa para você.");
  });
});
```

`PayoutScheduleCard.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { rpc } from "@/test/msw/supabase";
import { renderWithProviders } from "@/test/utils";
import { PayoutScheduleCard } from "./PayoutScheduleCard";

describe("PayoutScheduleCard", () => {
  it("mostra a próxima data, o valor previsto e o último ciclo", async () => {
    rpc("payout_auto_forecast", {
      json: {
        company_id: "c1", enabled: true, day: 10, source: "global", next_at: "2026-10-10", forecast_cents: 14133, min_cents: 5000,
        below_min: false, recipient_status: "active", recipient_missing: false,
        last_cycle: { cycle_month: "2026-09-01", outcome: "paid", amount_cents: 4633, available_cents: 5000, ran_at: "2026-09-10T12:00:00Z", reason: null },
      },
    });
    renderWithProviders(<PayoutScheduleCard companyId="c1" partnerView />);
    expect(await screen.findByText("Próximo repasse automático")).toBeInTheDocument();
    expect(screen.getByTestId("repasse-previsto")).toHaveTextContent("R$ 141,33");
    expect(screen.getByText(/10 de out/)).toBeInTheDocument();
    expect(screen.getByText(/sem taxa para você/)).toBeInTheDocument();
    expect(screen.getByText(/Último repasse automático em 10\/09\/2026/)).toBeInTheDocument();
  });
});
```

Em `api.test.tsx`, no padrão dos hooks vizinhos: `useSetCompanyPayoutSchedule` chama a RPC `company_set_payout_schedule` com `{ p_company_id, p_day, p_enabled }` e invalida `accountKeys.all`; `usePayoutAutoForecast` lê `payout_auto_forecast`.

Em `PartnerAccount.test.tsx`: no `monta()`, acrescentar `rpc("payout_auto_forecast", { json: { ...previsão acima... } })`; no teste do diálogo de saque, `expect(screen.getByText(/Saque manual: a Pagar.me cobra R\$ 3,67/)).toBeInTheDocument()`.

- [ ] **Step 2: Rodar para ver falhar**

Run: `bun run test -- src/features/payouts`
Expected: falham os arquivos novos e os dois existentes alterados.

- [ ] **Step 3: Implementar**

`schedule.logic.ts`:

```ts
import type { PayoutAutoForecast } from "./api";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "10 de out" a partir de uma data ISO (YYYY-MM-DD), sem fuso. */
export function diaMes(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} de ${MESES[(m ?? 1) - 1]}`;
}

function brDate(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
}

export function scheduleHeadline(f: PayoutAutoForecast, brl: (c: number) => string, partnerView: boolean): { title: string; value: string; caption: string; tone: "ok" | "muted" | "warn" } {
  const title = "Próximo repasse automático";
  if (f.recipient_missing || f.recipient_status !== "active") {
    return { title, value: "-", caption: partnerView ? "Seu cadastro de recebimento ainda não está completo. Sem ele, nada cai na conta." : "Recebedor inativo ou ausente no gateway: o repasse não sai.", tone: "warn" };
  }
  if (!f.enabled) {
    return { title, value: "-", caption: partnerView ? "O repasse automático não está ligado para você. Fale com a Movepark." : `Repasse automático desligado para esta empresa${f.source === "company" ? " (configuração da empresa)" : " (padrão global)"}.`, tone: "muted" };
  }
  if (f.below_min) {
    return { title, value: brl(f.forecast_cents), caption: `Dia ${diaMes(f.next_at)}. Abaixo de ${brl(f.min_cents)} o valor acumula para o mês seguinte, sem taxa.`, tone: "muted" };
  }
  return { title, value: brl(f.forecast_cents), caption: `Cai no dia ${diaMes(f.next_at)}, sem taxa para você. O valor é a previsão de hoje: vendas que liberarem até lá entram.`, tone: "ok" };
}

export function lastCycleLabel(f: PayoutAutoForecast, brl: (c: number) => string): string | null {
  const c = f.last_cycle;
  if (!c) return null;
  const quando = brDate(c.ran_at);
  if (c.outcome === "paid") return `Último repasse automático em ${quando}: ${brl(c.amount_cents ?? 0)} enviados ao banco.`;
  if (c.outcome === "below_min") return `Em ${quando} não saiu: ${brl(c.available_cents ?? 0)} disponíveis, abaixo do mínimo. Acumula.`;
  if (c.outcome === "no_balance") return `Em ${quando} não saiu: o saldo no gateway não cobria o disponível.`;
  if (c.outcome === "running") return `Repasse de ${quando} em andamento.`;
  return `Em ${quando} o repasse falhou${c.reason ? `: ${c.reason}` : "."}`;
}

export function manualWithdrawCaption(feeCents: number, day: number, brl: (c: number) => string): string {
  return `Saque manual: a Pagar.me cobra ${brl(feeCents)} do seu saldo. O repasse automático do dia ${day} não tem taxa para você.`;
}
```

`PayoutScheduleCard.tsx`:

```tsx
import { Card, CardContent } from "@/components/ui/card";
import { formatBRL } from "@/lib/format";
import { usePayoutAutoForecast } from "./api";
import { lastCycleLabel, scheduleHeadline } from "./schedule.logic";

const brl = (cents: number) => formatBRL(cents / 100);

/**
 * Quando o próximo repasse automático cai e quanto vai cair (E0.3.13). O mesmo card no Operator
 * (a própria empresa) e no Manager (conta de qualquer empresa). Spec: docs/specs/repasse-automatico-mensal.md.
 */
export function PayoutScheduleCard({ companyId, partnerView }: { companyId: string; partnerView: boolean }) {
  const forecast = usePayoutAutoForecast(companyId);
  const f = forecast.data;
  if (!f) return null;
  const h = scheduleHeadline(f, brl, partnerView);
  const ultimo = lastCycleLabel(f, brl);
  const tone = h.tone === "warn" ? "text-error" : h.tone === "muted" ? "text-muted" : "text-ink";
  return (
    <Card data-testid="repasse-automatico">
      <CardContent className="p-5">
        <div className="text-caption text-muted">{h.title}</div>
        <div className={`text-display-sm ${tone}`} data-testid="repasse-previsto">{h.value}</div>
        <div className="text-caption text-muted text-pretty">{h.caption}</div>
        {ultimo && <div className="mt-1 text-caption text-muted text-pretty">{ultimo}</div>}
      </CardContent>
    </Card>
  );
}
```

`api.ts`: tipo `PayoutAutoForecast` (acima), `usePayoutAutoForecast` (queryKey `[...accountKeys.all, "auto-forecast", companyId]`, RPC `payout_auto_forecast`, `enabled: !!companyId`), `useSetCompanyPayoutSchedule` (RPC `company_set_payout_schedule`, invalida `accountKeys.all` e `payoutKeys.all`, no molde de `useSetCompanyPayoutReleaseDays`), e `fee_credit_cents: number` em `PayoutWithdrawable`.

`PartnerAccount.tsx`: o grid do cabeçalho ganha uma coluna (`tablet:grid-cols-5` com gateway, `tablet:grid-cols-4` sem) e `<PayoutScheduleCard companyId={companyId} partnerView={!showGateway} />` logo depois do card "Disponível para saque". No diálogo, o parágrafo "A taxa é descontada do valor sacado..." vira `{manualWithdrawCaption(feeCents, forecast.data?.day ?? 10, brl)}` seguido da frase existente sobre juntar em um saque (o hook `usePayoutAutoForecast(companyId)` entra no componente). O botão passa a "Repassar agora".

`account.logic.ts`: `MovementKind` ganha `| "fee_credit"`, `MOVEMENT_LABEL.fee_credit = "Taxa devolvida pela Movepark"`.

- [ ] **Step 4: Rodar**

Run: `bun run test -- src/features/payouts && bun run typecheck && bun run lint`
Expected: verde.

- [ ] **Step 5: Commit**

```bash
git add src/features/payouts
git commit -m "feat(payouts): card do proximo repasse automatico e a copy do saque manual na conta do parceiro"
git push origin main
```

---

### Task 7: Configuração no Manager (global e por empresa)

**Files:**
- Modify: `src/routes/manager/settings.tsx` (`PayoutAutoSettings` exportado, dentro da aba Pagamentos)
- Create: `src/routes/manager/settings.payout-auto.test.tsx`
- Modify: `src/features/payouts/PayoutSettingsDialog.tsx` (vira "Repasse": prazo + dia + liga/desliga)
- Modify: `src/features/payouts/PayoutSettingsDialog.test.tsx`

- [ ] **Step 1: Testes que falham**

`settings.payout-auto.test.tsx` (molde de `settings.payout-release.test.tsx`):

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";

const mutateAsync = vi.fn().mockResolvedValue(undefined);
const appSettings = { data: { payout_auto_enabled: "true", payout_auto_day: "10", payout_auto_min_cents: "5000" } as Record<string, string>, isLoading: false };
vi.mock("@/features/settings/api", () => ({ useAppSettings: () => appSettings, useUpdateAppSettings: () => ({ mutateAsync, isPending: false }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { PayoutAutoSettings } from "./settings";

describe("PayoutAutoSettings", () => {
  beforeEach(() => mutateAsync.mockClear());
  it("mostra dia e mínimo em reais e salva como texto, dia clampado a 1..31 e mínimo em centavos", async () => {
    renderWithProviders(<PayoutAutoSettings />);
    expect((screen.getByLabelText(/Dia do mês/i) as HTMLInputElement).value).toBe("10");
    expect((screen.getByLabelText(/Valor mínimo/i) as HTMLInputElement).value).toBe("50");
    fireEvent.change(screen.getByLabelText(/Dia do mês/i), { target: { value: "40" } });
    fireEvent.change(screen.getByLabelText(/Valor mínimo/i), { target: { value: "75,5" } });
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ payout_auto_enabled: "true", payout_auto_day: "31", payout_auto_min_cents: "7550" }));
  });
  it("explica que o automático é sem taxa e o manual tem", () => {
    renderWithProviders(<PayoutAutoSettings />);
    expect(screen.getByText(/taxa da Pagar.me fica por conta da Movepark/)).toBeInTheDocument();
  });
});
```

`PayoutSettingsDialog.test.tsx`: o mock de `./api` ganha `useSetCompanyPayoutSchedule: () => ({ mutateAsync: setSchedule, isPending: false })`; o mock de `useCompanies` devolve também `payout_auto_day: null, payout_auto_enabled: null`; o teste "não oferece transferência automática" passa a procurar o título "Repasse" e a ausência de "Antecipação"; teste novo:

```tsx
  it("salva dia e liga/desliga do repasse automático da empresa", async () => {
    renderWithProviders(<PayoutSettingsDialog companyId="c1" open onOpenChange={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Dia do repasse automático/i), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));
    await waitFor(() => expect(setSchedule).toHaveBeenCalledWith({ company_id: "c1", day: 5, enabled: null }));
  });
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `bun run test -- src/routes/manager/settings src/features/payouts/PayoutSettingsDialog`
Expected: falha.

- [ ] **Step 3: Implementar**

`settings.tsx`, ao lado de `PayoutReleaseSettings`:

```tsx
/**
 * Repasse automático mensal (E0.3.13): dia, mínimo e liga/desliga globais. Cada empresa pode ter o
 * seu em Recebedores › Repasse. A taxa da Pagar.me nesse repasse é da Movepark; no saque manual é
 * do parceiro. Spec: docs/specs/repasse-automatico-mensal.md.
 */
export function PayoutAutoSettings() {
  const { data, isLoading } = useAppSettings();
  const update = useUpdateAppSettings();
  const [enabled, setEnabled] = React.useState(true);
  const [day, setDay] = React.useState("10");
  const [minReais, setMinReais] = React.useState("50");
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    if (data && !ready) {
      setEnabled((data.payout_auto_enabled ?? "true") !== "false");
      setDay(data.payout_auto_day ?? "10");
      setMinReais(String(Number(data.payout_auto_min_cents ?? "5000") / 100).replace(".", ","));
      setReady(true);
    }
  }, [data, ready]);

  async function save() {
    const d = Math.min(31, Math.max(1, Math.round(Number(day) || 10)));
    const cents = Math.max(0, Math.round(Number(minReais.replace(",", ".")) * 100) || 0);
    try {
      await update.mutateAsync({ payout_auto_enabled: enabled ? "true" : "false", payout_auto_day: String(d), payout_auto_min_cents: String(cents) });
      setDay(String(d));
      toast.success("Repasse automático salvo");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Repasse automático mensal</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-body-sm text-muted text-pretty">
          Todo estacionamento recebe o disponível para saque no dia escolhido, sem custo: a taxa da Pagar.me fica por conta da Movepark. O saque manual continua existindo e a taxa dele é do parceiro.
        </p>
        <div className="flex items-center justify-between">
          <Label htmlFor="payout-auto-enabled">Ligado para todas as empresas</Label>
          <Switch id="payout-auto-enabled" checked={enabled} onCheckedChange={setEnabled} />
        </div>
        <div className="grid gap-4 tablet:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payout-auto-day">Dia do mês</Label>
            <Input id="payout-auto-day" type="number" min={1} max={31} value={day} onChange={(e) => setDay(e.target.value)} />
            <span className="text-caption text-muted">Dia 29, 30 ou 31 em mês mais curto roda no último dia.</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payout-auto-min">Valor mínimo (R$)</Label>
            <Input id="payout-auto-min" inputMode="decimal" value={minReais} onChange={(e) => setMinReais(e.target.value)} />
            <span className="text-caption text-muted">Abaixo disso o valor acumula para o mês seguinte.</span>
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={save} disabled={isLoading || update.isPending}>{update.isPending ? "Salvando…" : "Salvar"}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

e na aba: `<PayoutReleaseSettings />` seguido de `<PayoutAutoSettings />`.

`PayoutSettingsDialog.tsx`: título "Repasse"; descrição "Prazo de liberação, dia do repasse automático e se ele está ligado para esta empresa. Vazio herda o padrão global."; campos: prazo (como hoje), `Input` "Dia do repasse automático" (`id="auto-day"`, 1..31, vazio herda), `Select` "Repasse automático" com `Herda o global` / `Ligado` / `Desligado` (`value` "inherit" | "on" | "off"). `save()` chama `setReleaseDays` e `setSchedule({ company_id, day: dia ?? null, enabled: sel === "inherit" ? null : sel === "on" })` em sequência; toast "Repasse salvo". O botão em Recebedores que abre o diálogo passa a se chamar "Repasse".

- [ ] **Step 4: Rodar**

Run: `bun run test -- src/routes/manager src/features/payouts && bun run typecheck && bun run lint`
Expected: verde.

- [ ] **Step 5: Commit**

```bash
git add src/routes/manager/settings.tsx src/routes/manager/settings.payout-auto.test.tsx src/features/payouts/PayoutSettingsDialog.tsx src/features/payouts/PayoutSettingsDialog.test.tsx src/features/payouts
git commit -m "feat(manager): repasse automatico configuravel (global e por empresa)"
git push origin main
```

---

### Task 8: FAQ do parceiro, cenário Windup, docs e memória

**Files:**
- Modify: `src/routes/seja-parceiro.tsx` (FAQ)
- Modify: `e2e/windup/operator-finance.json`
- Modify: `docs/specs/conta-do-parceiro.md` (item 2 de "Como o dinheiro anda" e "Saque" apontam para a spec nova)
- Modify: `docs/specs/README.md` (linha da spec nova + migration na tabela)
- Modify: memória `project_conta_do_parceiro.md` (uma linha: repasse automático mensal desde 26/09; saque manual segue)

- [ ] **Step 1: FAQ**

Em `FAQ` de `seja-parceiro.tsx`, depois de "Como eu recebo o dinheiro das reservas?":

```ts
  {
    q: "Quando eu recebo?",
    a: "Todo dia 10 a Movepark repassa para a sua conta o que já está liberado, sem taxa nenhuma para você. Precisa antes? Tem saque manual no painel a qualquer hora; nesse a Pagar.me cobra R$ 3,67 por saque.",
  },
```

Rodar `bun run test -- src/routes/seja-parceiro` (se houver teste de FAQ, ajustar a contagem).

- [ ] **Step 2: Windup**

`operator-finance.json`: `task` vira `Verifique, em quatro checagens separadas, que a pagina exibe o titulo "Repasses", depois o texto "Proximo repasse automatico", depois o texto "Sua jornada na Movepark", depois o texto "Proximo passo".`; acrescentar ANTES da regra `**/rpc/**` a regra:

```json
    {
      "url": "**/rpc/payout_auto_forecast*",
      "json": {
        "company_id": "00000000-0000-4000-8000-0000000000c1", "enabled": true, "day": 10, "source": "global",
        "next_at": "2026-10-10", "forecast_cents": 14133, "min_cents": 5000, "below_min": false,
        "recipient_status": "active", "recipient_missing": false, "last_cycle": null
      }
    },
```

Rodar com o dev server `windup-dev` (preview_start) e o planner fera: `CLAUDE_CONFIG_DIR=/Users/kallef/.claude-fera VITE_CONSUMER_ACCOUNTS=on bunx windup run operator-finance --base-url http://localhost:5273 --retries 1` → PASS; commitar a trajetória com `git add -f .windup/cache/trajetorias/operator-finance.json`.

- [ ] **Step 3: Docs e memória**

`conta-do-parceiro.md`, item 2: "Do saldo para a conta bancária, por **repasse automático mensal** (dia 10, sem taxa para o parceiro; ver [repasse-automatico-mensal.md](./repasse-automatico-mensal.md)) ou por saque manual (botão "Repassar agora", taxa do parceiro)." `README.md`: linha da spec e da migration `20261127090000`. Memória: acrescentar ao fim de `project_conta_do_parceiro.md` a linha "26/09/2026: repasse automático mensal (E0.3.13) dia 10, mínimo R$ 50, taxa por conta da Movepark devolvida no split; cron `payout-auto-run`; spec repasse-automatico-mensal.md".

- [ ] **Step 4: Commit**

```bash
git add src/routes/seja-parceiro.tsx e2e/windup/operator-finance.json docs/specs
git add -f .windup/cache/trajetorias/operator-finance.json
git commit -m "docs(payouts): FAQ do parceiro, cenario do Operator e specs do repasse automatico"
git push origin main
```

---

### Task 9: Prova real e primeiro ciclo

**Files:** nenhum novo (só banco e gateway).

- [ ] **Step 1: Ciclo da Agência Fera hoje**

```bash
supabase db query --linked "select public.company_set_payout_schedule(id, extract(day from (now() at time zone 'America/Sao_Paulo'))::int, true) from public.company where slug = 'agencia-fera';"
supabase db query --linked "select company_id, scheduled_for from public.payout_auto_due((now() at time zone 'America/Sao_Paulo')::date);"
```

Expected: a Agência Fera aparece. Se o disponível dela for menor que R$ 50, baixar o mínimo global para `100` durante a prova e voltar depois.

- [ ] **Step 2: Rodar a Edge à mão (JWT de hub_admin) e conferir**

```bash
curl -s -X POST https://mgaigbezdalbyuqiofcf.supabase.co/functions/v1/payout-auto-run -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" -d '{}'
supabase db query --linked "select y.outcome, y.available_cents, y.amount_cents, w.origin, w.fee_borne_by, w.fee_cents, w.status from public.payout_auto_cycle y left join public.payout_withdrawal w on w.id = y.withdrawal_id order by y.created_at desc limit 1;"
supabase db query --linked "select public.payout_fee_credit_cents(id) from public.company where slug = 'agencia-fera';"
```

Expected: `outcome = paid`, `origin = automatic`, `fee_borne_by = movepark`, crédito = 367. Na tela Manager › Recebedores › Conta da Agência Fera: card "Próximo repasse automático" com "Último repasse automático em <hoje>", WithdrawalsCard com o saque; e-mail "Seu repasse mensal de R$ X está a caminho" no contato da empresa.

- [ ] **Step 3: O crédito volta numa compra**

Compra de teste no rascunho da Agência Fera (PIX, valor ≥ R$ 10): `select fee_credit_returned_cents, debt_recovered_cents, split from public.payment order by created_at desc limit 1;` → `fee_credit_returned_cents = 367` (ou o que coube pelo piso); no Manager, o rastro do gateway mostra a perna do parceiro com +367. Extrato: movimento "Taxa devolvida pela Movepark".

- [ ] **Step 4: Voltar a configuração e fechar**

```bash
supabase db query --linked "select public.company_set_payout_schedule(id, null, null) from public.company where slug = 'agencia-fera';"
supabase db query --linked "update public.app_setting set value = '5000' where key = 'payout_auto_min_cents';"
supabase db query --linked "select jobname, schedule, active from cron.job where jobname = 'payout-auto-run';"
```

Registrar na spec (seção "Rollout e prova") o que foi medido, com data, e commitar. Primeiro ciclo geral: 10/10/2026 às 9h; conferir no dia com `select * from public.payout_auto_cycle where cycle_month = date '2026-10-01';`.
