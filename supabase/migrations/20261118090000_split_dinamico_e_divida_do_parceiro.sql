-- Split dinâmico e dívida do parceiro (E0.3.5, decidido em 15/09/2026).
-- Spec: docs/specs/split-dinamico-e-divida-do-parceiro.md
--
-- A custódia morre porque a Pagar.me não liberou a transferência entre recebedores. O split volta a
-- ir ao gateway em toda cobrança, e o que a custódia expunha (cancelamento, estorno e chargeback
-- depois de o parceiro já ter recebido) passa a ser tratado por um razão nosso, no modelo "Uber":
-- o estorno sai 100% do master, a perna do parceiro vira DÍVIDA, e as vendas seguintes abatem
-- (até 100% da perna) até quitar. O abatimento fica gravado na cobrança.
--
-- Esta migration é inerte enquanto `pagarme_split_enabled` for 'false': nenhuma cobrança nova vai
-- ao gateway com split, nenhum estorno gera dívida, nenhuma reserva é pedida.

-- ── 1. A perna do parceiro passa a ser identificada por `role` ─────────────────────────────
-- Até aqui a marca era `liable = true`. Com o chargeback indo para a perna da Movepark (decisão 2),
-- `liable` deixa de dizer quem é quem. Regra antiga sem `role` continua lida por `liable`.
create or replace function public.split_rule_is_partner(r jsonb)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select case
    when r ? 'role' then r->>'role' = 'partner'
    else coalesce((r->>'liable')::boolean, false)
  end;
$$;
revoke all on function public.split_rule_is_partner(jsonb) from public, anon;
grant execute on function public.split_rule_is_partner(jsonb) to authenticated, service_role;

-- ── 2. O abatimento mora na cobrança ───────────────────────────────────────────────────────
alter table public.payment
  add column if not exists debt_recovered_cents integer not null default 0,
  add column if not exists debt_reservation_id  uuid,
  add column if not exists refund_absorbed_by_master boolean not null default false;

comment on column public.payment.refund_absorbed_by_master is
  'O estorno (ou chargeback) desta cobrança saiu 100% do master da Movepark, e o parceiro ficou com a perna dele. É isto que gera dívida. Falso nos estornos antigos, em que o gateway debitou o parceiro sozinho seguindo o split.';

comment on column public.payment.debt_recovered_cents is
  'Quanto da perna do parceiro esta cobrança abateu da dívida dele (split dinâmico). Zero no caminho normal.';
comment on column public.payment.debt_reservation_id is
  'Reserva de abatimento que esta cobrança consumiu (payout_debt_reservation). Fecha a corrida de duas vendas simultâneas.';

-- ── 3. Tabelas ────────────────────────────────────────────────────────────────────────────

-- Reserva de abatimento: a cobrança só vira linha em `payment` depois de o gateway aceitar, e entre
-- calcular o abatimento e gravar há uma janela. A reserva conta como abatimento até ser consumida
-- (a linha de payment aponta para ela) ou vencer (15 min sem pagamento).
create table if not exists public.payout_debt_reservation (
  id                     uuid primary key default gen_random_uuid(),
  company_id             uuid not null references public.company(id) on delete cascade,
  provider               text not null default 'pagarme',
  amount_cents           bigint not null check (amount_cents > 0),
  expires_at             timestamptz not null,
  consumed_by_payment_id uuid references public.payment(id) on delete set null,
  created_at             timestamptz not null default now()
);
create index if not exists payout_debt_reservation_viva_idx
  on public.payout_debt_reservation (company_id, provider, expires_at)
  where consumed_by_payment_id is null;

alter table public.payout_debt_reservation enable row level security;
revoke all on public.payout_debt_reservation from anon, authenticated;
grant select on public.payout_debt_reservation to authenticated;
drop policy if exists payout_debt_reservation_admin_read on public.payout_debt_reservation;
create policy payout_debt_reservation_admin_read on public.payout_debt_reservation
  for select to authenticated using (public.is_hub_admin());

-- Acerto manual: o parceiro pagou por fora, ou ajuste. Só hub_admin lança, pela RPC.
create table if not exists public.payout_debt_settlement (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.company(id) on delete cascade,
  provider     text not null default 'pagarme',
  amount_cents bigint not null check (amount_cents <> 0),
  kind         text not null check (kind in ('manual_payment', 'adjustment')),
  note         text,
  recorded_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index if not exists payout_debt_settlement_company_idx
  on public.payout_debt_settlement (company_id, provider) where deleted_at is null;

alter table public.payout_debt_settlement enable row level security;
revoke all on public.payout_debt_settlement from anon, authenticated;
grant select on public.payout_debt_settlement to authenticated;
drop policy if exists payout_debt_settlement_admin_read on public.payout_debt_settlement;
create policy payout_debt_settlement_admin_read on public.payout_debt_settlement
  for select to authenticated using (public.is_hub_admin());
drop policy if exists payout_debt_settlement_company_read on public.payout_debt_settlement;
create policy payout_debt_settlement_company_read on public.payout_debt_settlement
  for select to authenticated using (company_id in (select public.current_company_ids()));

-- Fila de reembolso manual: o gateway recusou de forma definitiva (prazo vencido, sem saldo) e a
-- devolução ao cliente é feita por fora. O `payment` fica `paid` até alguém marcar a linha como paga.
create table if not exists public.payout_refund_manual (
  id               uuid primary key default gen_random_uuid(),
  booking_id       uuid not null references public.booking(id) on delete cascade,
  payment_id       uuid not null references public.payment(id) on delete cascade,
  amount_cents     bigint not null check (amount_cents > 0),
  reason           text not null check (reason in ('gateway_deadline', 'gateway_no_balance', 'gateway_refused')),
  gateway_response jsonb,
  status           text not null default 'pending' check (status in ('pending', 'paid', 'canceled')),
  note             text,
  created_by       uuid references public.profiles(id) on delete set null,
  paid_by          uuid references public.profiles(id) on delete set null,
  paid_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index if not exists payout_refund_manual_um_por_pagamento_idx
  on public.payout_refund_manual (payment_id) where status = 'pending';
drop trigger if exists set_updated_at on public.payout_refund_manual;
create trigger set_updated_at before update on public.payout_refund_manual
  for each row execute function public.set_updated_at();

alter table public.payout_refund_manual enable row level security;
revoke all on public.payout_refund_manual from anon, authenticated;
grant select on public.payout_refund_manual to authenticated;
drop policy if exists payout_refund_manual_admin_read on public.payout_refund_manual;
create policy payout_refund_manual_admin_read on public.payout_refund_manual
  for select to authenticated using (public.is_hub_admin());

-- Saldo do master no gateway, lido pelo cron. Uma linha por provider.
create table if not exists public.gateway_account_balance (
  provider          text primary key,
  recipient_id      text not null,
  available_cents   bigint not null default 0,
  waiting_cents     bigint not null default 0,
  transferred_cents bigint not null default 0,
  synced_at         timestamptz not null default now()
);
alter table public.gateway_account_balance enable row level security;
revoke all on public.gateway_account_balance from anon, authenticated;
grant select on public.gateway_account_balance to authenticated;
drop policy if exists gateway_account_balance_admin_read on public.gateway_account_balance;
create policy gateway_account_balance_admin_read on public.gateway_account_balance
  for select to authenticated using (public.is_hub_admin());

-- Colchão: piso de saldo no master para honrar estornos. Zero até alguém definir.
insert into public.app_setting (key, value, is_public)
values ('pagarme_master_float_cents', '0', false)
on conflict (key) do nothing;

-- ── 4. A fórmula da dívida ─────────────────────────────────────────────────────────────────
--
--   dívida = Σ perna do parceiro × fração estornada   (cobranças que FORAM ao gateway)
--          − Σ debt_recovered_cents                   (abatimentos gravados nas cobranças vivas)
--          − Σ reservas vivas                         (abatimento pedido, cobrança ainda não gravada)
--          − Σ acertos manuais
--
-- Estorno de uma venda que abateu dívida conta a perna INTEIRA, de propósito: o abatimento foi pago
-- com dinheiro do cliente, que voltou para ele, então precisa ser desfeito junto. Ver a spec.
-- Pode ficar negativa (abatimento a mais); a tela trava em zero e o Manager mostra o excedente.
create or replace function public.payout_debt_cents(
  p_company_id uuid,
  p_provider text default 'pagarme'
) returns bigint
language sql
stable
security definer
set search_path to 'public'
as $function$
  with per_payment as (
    select
      p.id,
      p.status,
      coalesce(sum((r->>'amount')::int)
        filter (where public.split_rule_is_partner(r) and p.kind = 'booking'), 0) as partner_cents,
      case
        when p.status = 'refunded' then 1::numeric
        when coalesce(p.refunded_amount, 0) > 0 and p.amount > 0
          then least(1::numeric, p.refunded_amount / p.amount)
        else 0::numeric
      end as refund_ratio
    from public.payment p
    join public.booking b    on b.id = p.booking_id
    join public.location loc on loc.id = b.location_id
    left join lateral jsonb_array_elements(p.split) as r on true
    where p.provider = p_provider
      and loc.company_id = p_company_id
      and p.kind = 'booking'
      and p.split_sent_to_gateway is true
      -- Só o estorno que a Movepark pagou do master gera dívida. Os antigos (jun/jul de 2026)
      -- seguiram o split e o gateway debitou o parceiro sozinho: ninguém ficou devendo.
      and p.refund_absorbed_by_master is true
      and p.status in ('paid', 'refunded')
    group by p.id, p.status, p.kind, p.amount, p.refunded_amount
  ),
  gerada as (
    select coalesce(sum(round(partner_cents * refund_ratio)), 0)::bigint as cents from per_payment
  ),
  abatida as (
    -- Cobrança viva: paga, ou pendente ainda dentro da validade (PIX esperando o cliente). Pendente
    -- vencida deixa de contar, e a dívida "volta" para a próxima venda abater.
    select coalesce(sum(p.debt_recovered_cents), 0)::bigint as cents
    from public.payment p
    join public.booking b    on b.id = p.booking_id
    join public.location loc on loc.id = b.location_id
    where p.provider = p_provider
      and loc.company_id = p_company_id
      and p.split_sent_to_gateway is true
      and (
        p.status in ('paid', 'authorized', 'refunded')
        or (p.status = 'pending' and coalesce(p.expires_at, p.created_at + interval '1 hour') > now())
      )
  ),
  reservada as (
    select coalesce(sum(amount_cents), 0)::bigint as cents
    from public.payout_debt_reservation
    where company_id = p_company_id and provider = p_provider
      and consumed_by_payment_id is null and expires_at > now()
  ),
  acertos as (
    select coalesce(sum(amount_cents), 0)::bigint as cents
    from public.payout_debt_settlement
    where company_id = p_company_id and provider = p_provider and deleted_at is null
  )
  select gerada.cents - abatida.cents - reservada.cents - acertos.cents
  from gerada, abatida, reservada, acertos;
$function$;
revoke all on function public.payout_debt_cents(uuid, text) from public, anon;
grant execute on function public.payout_debt_cents(uuid, text) to authenticated, service_role;

-- ── 5. Reserva do abatimento (a Edge chama antes de cobrar) ───────────────────────────────
-- Lock por empresa: duas cobranças simultâneas não leem a mesma dívida. Devolve zero sem gravar
-- nada quando não há o que abater, que é o caminho normal.
create or replace function public.payout_debt_reserve(
  p_company_id uuid,
  p_max_cents bigint,
  p_provider text default 'pagarme'
) returns table (reservation_id uuid, amount_cents bigint)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_debt bigint;
  v_amt  bigint;
  v_id   uuid;
begin
  if p_max_cents is null or p_max_cents <= 0 then
    return query select null::uuid, 0::bigint;
    return;
  end if;
  perform pg_advisory_xact_lock(hashtext('payout_debt:' || p_company_id::text));
  v_debt := greatest(public.payout_debt_cents(p_company_id, p_provider), 0);
  v_amt  := least(v_debt, p_max_cents);
  if v_amt <= 0 then
    return query select null::uuid, 0::bigint;
    return;
  end if;
  insert into public.payout_debt_reservation (company_id, provider, amount_cents, expires_at)
  values (p_company_id, p_provider, v_amt, now() + interval '15 minutes')
  returning id into v_id;
  return query select v_id, v_amt;
end;
$function$;
revoke all on function public.payout_debt_reserve(uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.payout_debt_reserve(uuid, bigint, text) to service_role;

-- ── 6. Acerto manual (hub_admin) ───────────────────────────────────────────────────────────
create or replace function public.payout_debt_settle(
  p_company_id uuid,
  p_amount_cents bigint,
  p_kind text,
  p_note text default null,
  p_provider text default 'pagarme'
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_id uuid;
begin
  if not public.is_hub_admin() then
    raise exception 'Só a Movepark lança acerto de dívida.' using errcode = '42501';
  end if;
  if p_amount_cents is null or p_amount_cents = 0 then
    raise exception 'Valor do acerto não pode ser zero.' using errcode = '22023';
  end if;
  insert into public.payout_debt_settlement (company_id, provider, amount_cents, kind, note, recorded_by)
  values (p_company_id, p_provider, p_amount_cents, p_kind, nullif(trim(p_note), ''), auth.uid())
  returning id into v_id;
  return v_id;
end;
$function$;
revoke all on function public.payout_debt_settle(uuid, bigint, text, text, text) from public, anon;
grant execute on function public.payout_debt_settle(uuid, bigint, text, text, text) to authenticated;

-- ── 7. Reembolso manual: marcar como pago ─────────────────────────────────────────────────
-- Vira o `payment` em `refunded` pelo caminho normal: a dívida do parceiro entra pela fórmula.
create or replace function public.payout_refund_manual_mark_paid(
  p_id uuid,
  p_note text default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_row public.payout_refund_manual%rowtype;
begin
  if not public.is_hub_admin() then
    raise exception 'Só a Movepark marca reembolso manual.' using errcode = '42501';
  end if;
  select * into v_row from public.payout_refund_manual where id = p_id for update;
  if v_row.id is null then
    raise exception 'Reembolso manual não encontrado.' using errcode = 'P0002';
  end if;
  if v_row.status <> 'pending' then
    return; -- idempotente
  end if;
  update public.payout_refund_manual
     set status = 'paid', paid_by = auth.uid(), paid_at = now(),
         note = coalesce(nullif(trim(p_note), ''), note)
   where id = p_id;
  update public.payment
     set status = 'refunded',
         refunded_at = coalesce(refunded_at, now()),
         refunded_amount = coalesce(refunded_amount, amount),
         refund_reason = coalesce(nullif(trim(refund_reason), ''), 'reembolso manual')
   where id = v_row.payment_id and status = 'paid';
end;
$function$;
revoke all on function public.payout_refund_manual_mark_paid(uuid, text) from public, anon;
grant execute on function public.payout_refund_manual_mark_paid(uuid, text) to authenticated;

-- ── 8. O que o parceiro vê: origem e abatimentos ──────────────────────────────────────────
create or replace function public.payout_debt_lines(
  p_company_id uuid,
  p_provider text default 'pagarme'
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_is_admin boolean := public.is_hub_admin();
  v_origens jsonb; v_abatimentos jsonb; v_acertos jsonb;
begin
  if not v_is_admin and p_company_id not in (select public.current_company_ids()) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if not public.member_has_scope(p_company_id, 'payouts:read') then
    raise exception 'Seu papel não permite ver o saldo de repasses (payouts:read).' using errcode = '42501';
  end if;

  -- Origem: cada estorno/chargeback de cobrança que foi ao gateway, com a perna do parceiro.
  select coalesce(jsonb_agg(jsonb_build_object(
           'booking_code', x.code, 'at', x.refunded_at, 'reason', x.refund_reason,
           'cents', x.cents) order by x.refunded_at desc), '[]'::jsonb)
    into v_origens
  from (
    select b.code, p.refunded_at, p.refund_reason,
           round(coalesce(sum((r->>'amount')::int)
             filter (where public.split_rule_is_partner(r)), 0)
             * case when p.status = 'refunded' then 1::numeric
                    when coalesce(p.refunded_amount, 0) > 0 and p.amount > 0
                      then least(1::numeric, p.refunded_amount / p.amount)
                    else 0::numeric end)::bigint as cents
    from public.payment p
    join public.booking b    on b.id = p.booking_id
    join public.location loc on loc.id = b.location_id
    left join lateral jsonb_array_elements(p.split) as r on true
    where p.provider = p_provider and loc.company_id = p_company_id
      and p.kind = 'booking' and p.split_sent_to_gateway is true
      and p.refund_absorbed_by_master is true
      and (p.status = 'refunded' or coalesce(p.refunded_amount, 0) > 0)
    group by b.code, p.id, p.status, p.refunded_at, p.refund_reason, p.amount, p.refunded_amount
  ) x where x.cents > 0;

  -- Abatimentos: cada cobrança que descontou dívida.
  select coalesce(jsonb_agg(jsonb_build_object(
           'booking_code', b.code, 'at', p.paid_at, 'cents', p.debt_recovered_cents,
           'status', p.status::text) order by p.paid_at desc nulls last), '[]'::jsonb)
    into v_abatimentos
  from public.payment p
  join public.booking b    on b.id = p.booking_id
  join public.location loc on loc.id = b.location_id
  where p.provider = p_provider and loc.company_id = p_company_id
    and p.debt_recovered_cents > 0 and p.status in ('paid', 'refunded', 'authorized', 'pending');

  select coalesce(jsonb_agg(jsonb_build_object(
           'at', s.created_at, 'cents', s.amount_cents, 'kind', s.kind, 'note', s.note)
           order by s.created_at desc), '[]'::jsonb)
    into v_acertos
  from public.payout_debt_settlement s
  where s.company_id = p_company_id and s.provider = p_provider and s.deleted_at is null;

  return jsonb_build_object(
    'debt_cents', greatest(public.payout_debt_cents(p_company_id, p_provider), 0),
    'debt_raw_cents', public.payout_debt_cents(p_company_id, p_provider),
    'origins', v_origens,
    'recoveries', v_abatimentos,
    'settlements', v_acertos
  );
end;
$function$;
revoke all on function public.payout_debt_lines(uuid, text) from public, anon;
grant execute on function public.payout_debt_lines(uuid, text) to authenticated;

-- ── 9. O que a Movepark vê: dívida por empresa ────────────────────────────────────────────
create or replace function public.payout_debt_overview(
  p_provider text default 'pagarme'
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare v_result jsonb;
begin
  if not public.is_hub_admin() then
    raise exception 'Só a Movepark vê as dívidas da rede.' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(x order by x.debt_raw_cents desc, x.company_name), '[]'::jsonb)
    into v_result
  from (
    select c.id as company_id, c.name as company_name,
           public.payout_debt_cents(c.id, p_provider) as debt_raw_cents,
           greatest(public.payout_debt_cents(c.id, p_provider), 0) as debt_cents,
           (select min(p.refunded_at) from public.payment p
              join public.booking b on b.id = p.booking_id
              join public.location loc on loc.id = b.location_id
             where loc.company_id = c.id and p.provider = p_provider and p.kind = 'booking'
               and p.split_sent_to_gateway is true and p.refund_absorbed_by_master is true
               and (p.status = 'refunded' or coalesce(p.refunded_amount, 0) > 0)) as since,
           (select max(p.paid_at) from public.payment p
              join public.booking b on b.id = p.booking_id
              join public.location loc on loc.id = b.location_id
             where loc.company_id = c.id and p.provider = p_provider
               and p.debt_recovered_cents > 0) as last_recovery_at
    from public.company c
    where c.deleted_at is null
      and (
        public.payout_debt_cents(c.id, p_provider) <> 0
        or exists (select 1 from public.payout_debt_settlement s
                    where s.company_id = c.id and s.provider = p_provider and s.deleted_at is null)
      )
  ) x;
  return v_result;
end;
$function$;
revoke all on function public.payout_debt_overview(text) from public, anon;
grant execute on function public.payout_debt_overview(text) to authenticated;

-- ── 10. As funções que já existiam passam a olhar `role` ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.payout_owed_cents(p_company_id uuid, p_provider text DEFAULT 'pagarme'::text)
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with per_payment as (
    select
      p.id,
      coalesce(sum((r->>'amount')::int)
        filter (where public.split_rule_is_partner(r) and p.kind = 'booking'), 0) as partner_cents,
      case
        when coalesce(p.refunded_amount, 0) > 0 and p.amount > 0
          then least(1::numeric, p.refunded_amount / p.amount)
        else 0::numeric
      end as refund_ratio
    from public.payment p
    join public.booking b    on b.id = p.booking_id
    join public.location loc on loc.id = b.location_id
    left join lateral jsonb_array_elements(p.split) as r on true
    where p.provider = p_provider
      and p.status = 'paid'
      and loc.company_id = p_company_id
      -- `is false` e não `= false`: NULL (desconhecido) fica de fora, tratado como enviado.
      and p.split_sent_to_gateway is false
    group by p.id, p.kind, p.amount, p.refunded_amount
  )
  select coalesce(sum(partner_cents - round(partner_cents * refund_ratio)), 0)::bigint
  from per_payment;
$function$;

CREATE OR REPLACE FUNCTION public.payout_statement(p_from timestamp with time zone, p_to timestamp with time zone, p_company_id uuid DEFAULT NULL::uuid, p_include_lines boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_is_admin boolean := public.is_hub_admin();
  v_result   jsonb;
begin
  if not v_is_admin then
    if p_company_id is null or p_company_id not in (select public.current_company_ids()) then
      raise exception 'Sem permissão para este extrato.' using errcode = '42501';
    end if;
    if not public.member_has_scope(p_company_id, 'finance:read') then
      raise exception 'Seu papel não permite ver o financeiro (finance:read).' using errcode = '42501';
    end if;
  end if;

  with legs as (
    select
      loc.company_id,
      c.name as company_name,
      p.status::text as status,
      b.code as booking_code,
      coalesce(p.paid_at, p.refunded_at) as event_at,
      -- Só `booking` tem perna de parceiro. A perna é identificada por `role` (regras antigas: por
      -- `liable`, que era a marca do parceiro até o split dinâmico).
      coalesce(sum((r->>'amount')::int)
        filter (where public.split_rule_is_partner(r) and p.kind = 'booking'), 0) as partner_cents,
      coalesce(sum((r->>'amount')::int)
        filter (where not public.split_rule_is_partner(r) or p.kind <> 'booking'), 0) as movepark_cents,
      -- Estorno parcial: o pagamento continua `paid`, então o desconto tem que vir daqui.
      case
        when p.status = 'paid' and coalesce(p.refunded_amount, 0) > 0 and p.amount > 0
          then least(1::numeric, p.refunded_amount / p.amount)
        else 0::numeric
      end as refund_ratio,
      -- Custo da Movepark, apurado em `GET /payables`. Nulo (não apurado) soma nada.
      coalesce(p.gateway_fee_cents, 0) as gateway_fee_cents,
      -- Abatimento de dívida gravado NESTA cobrança (split dinâmico). A perna do parceiro acima é a
      -- normal; o que ele recebeu de fato é perna menos abatimento.
      coalesce(p.debt_recovered_cents, 0) as debt_recovered_cents
    from public.payment p
    join public.booking b    on b.id = p.booking_id
    join public.location loc on loc.id = b.location_id
    join public.company c    on c.id = loc.company_id
    left join lateral jsonb_array_elements(p.split) as r on true
    where p.provider = 'pagarme'
      and p.status in ('paid', 'refunded')
      and coalesce(p.paid_at, p.refunded_at) >= p_from
      and coalesce(p.paid_at, p.refunded_at) < p_to
      and (p_company_id is null or loc.company_id = p_company_id)
      and (v_is_admin or loc.company_id in (select public.current_company_ids()))
    group by loc.company_id, c.name, p.id, p.status, b.code, p.paid_at, p.refunded_at,
             p.kind, p.amount, p.refunded_amount, p.gateway_fee_cents, p.debt_recovered_cents
  ),
  lines as (
    select
      l.*,
      round(l.partner_cents  * l.refund_ratio)::bigint as partner_partial_cents,
      (l.partner_cents  - round(l.partner_cents  * l.refund_ratio))::bigint as partner_net_cents,
      (l.movepark_cents - round(l.movepark_cents * l.refund_ratio))::bigint as movepark_net_cents
    from legs l
  ),
  agg as (
    select
      company_id, company_name,
      coalesce(sum(partner_cents), 0)                                    as gross_partner_cents,
      coalesce(sum(partner_cents) filter (where status = 'refunded'), 0)
        + coalesce(sum(partner_partial_cents) filter (where status = 'paid'), 0)
                                                                         as refunded_partner_cents,
      coalesce(sum(partner_net_cents)  filter (where status = 'paid'), 0) as net_partner_cents,
      coalesce(sum(movepark_net_cents) filter (where status = 'paid'), 0) as movepark_commission_cents,
      coalesce(sum(gateway_fee_cents)  filter (where status = 'paid'), 0) as gateway_fee_cents,
      count(*) filter (where status = 'paid')                            as paid_count,
      count(*) filter (where status = 'refunded')                        as refunded_count
    from lines
    group by company_id, company_name
  )
  select jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'companies', coalesce(jsonb_agg(
      jsonb_build_object(
        'company_id', a.company_id,
        'company_name', a.company_name,
        'gross_partner_cents', a.gross_partner_cents,
        'refunded_partner_cents', a.refunded_partner_cents,
        'net_partner_cents', a.net_partner_cents,
        'movepark_commission_cents', a.movepark_commission_cents,
        'gateway_fee_cents', a.gateway_fee_cents,
        'paid_count', a.paid_count,
        'refunded_count', a.refunded_count,
        'lines', case when p_include_lines then (
          select coalesce(jsonb_agg(jsonb_build_object(
            'booking_code', l.booking_code,
            'event_at', l.event_at,
            'status', l.status,
            -- A linha mostra o que sobrou de verdade: já líquido do estorno parcial.
            'partner_cents', l.partner_net_cents,
            'movepark_cents', l.movepark_net_cents,
            'gateway_fee_cents', l.gateway_fee_cents,
            'debt_recovered_cents', l.debt_recovered_cents
          ) order by l.event_at desc), '[]'::jsonb)
          from lines l where l.company_id = a.company_id
        ) else null end
      ) order by a.company_name
    ), '[]'::jsonb)
  ) into v_result
  from agg a;

  return v_result;
end;
$function$;

-- ── 11. payout_balance ganha a dívida ─────────────────────────────────────────────────────
create or replace function public.payout_balance(
  p_company_id uuid,
  p_provider text default 'pagarme'
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_is_admin     boolean := public.is_hub_admin();
  v_net          bigint;
  v_no_gateway   bigint;
  v_owed         bigint;
  v_transferred  bigint;
  v_withdrawn    bigint;
  v_recipient    jsonb;
  v_debt_raw     bigint;
begin
  if not v_is_admin and p_company_id not in (select public.current_company_ids()) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if not public.member_has_scope(p_company_id, 'payouts:read') then
    raise exception 'Seu papel não permite ver o saldo de repasses (payouts:read).' using errcode = '42501';
  end if;

  with per_payment as (
    select
      p.id,
      (p.split_sent_to_gateway is not false) as foi_ao_gateway,
      coalesce(sum((r->>'amount')::int)
        filter (where public.split_rule_is_partner(r) and p.kind = 'booking'), 0) as partner_cents,
      case
        when coalesce(p.refunded_amount, 0) > 0 and p.amount > 0
          then least(1::numeric, p.refunded_amount / p.amount)
        else 0::numeric
      end as refund_ratio
    from public.payment p
    join public.booking b    on b.id = p.booking_id
    join public.location loc on loc.id = b.location_id
    left join lateral jsonb_array_elements(p.split) as r on true
    where p.provider = p_provider
      and p.status = 'paid'
      and loc.company_id = p_company_id
    group by p.id, p.kind, p.amount, p.refunded_amount, p.split_sent_to_gateway
  )
  select
    coalesce(sum(partner_cents - round(partner_cents * refund_ratio)), 0)::bigint,
    coalesce(sum(partner_cents - round(partner_cents * refund_ratio))
      filter (where foi_ao_gateway), 0)::bigint
    into v_net, v_no_gateway
  from per_payment;

  v_owed        := public.payout_owed_cents(p_company_id, p_provider);
  v_transferred := public.payout_transferred_cents(p_company_id, p_provider);
  v_debt_raw    := public.payout_debt_cents(p_company_id, p_provider);

  select coalesce(sum(amount_cents), 0)
    into v_withdrawn
  from public.payout_withdrawal
  where company_id = p_company_id and provider = p_provider
    and status = 'paid' and deleted_at is null;

  select case when pr.balance_synced_at is null then null else jsonb_build_object(
           'available_cents',   coalesce(pr.balance_available_cents, 0),
           'waiting_cents',     coalesce(pr.balance_waiting_cents, 0),
           'transferred_cents', coalesce(pr.balance_transferred_cents, 0),
           'synced_at',         pr.balance_synced_at
         ) end
    into v_recipient
  from public.payout_recipient pr
  where pr.company_id = p_company_id and pr.provider = p_provider and pr.deleted_at is null
  limit 1;

  return jsonb_build_object(
    'company_id', p_company_id,
    'net_partner_cents', v_net,
    'owed_cents', v_owed,
    'gateway_credited_cents', v_no_gateway,
    'transferred_cents', v_transferred,
    'withdrawn_cents', v_withdrawn,
    'balance_cents', greatest(v_owed - v_transferred, 0),
    'overpaid_cents', greatest(v_transferred - v_owed, 0),
    'recipient_balance', v_recipient,
    -- Dívida do parceiro (split dinâmico). `debt_cents` é o que a tela mostra; `debt_raw_cents`
    -- pode ser negativo (abatimento a mais) e é assunto do Manager.
    'debt_cents', greatest(v_debt_raw, 0),
    'debt_raw_cents', v_debt_raw
  );
end;
$function$;
