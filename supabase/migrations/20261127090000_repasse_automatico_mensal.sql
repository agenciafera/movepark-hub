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
-- (definição viva em 26/09/2026; muda a linha de v_withdrawn e entra fee_credit_cents no retorno)
CREATE OR REPLACE FUNCTION public.payout_withdrawable(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_days int := public.payout_release_days(p_company_id);
  v_released bigint := 0;
  v_retained bigint := 0;
  v_transfers_in bigint := 0;
  v_withdrawn bigint := 0;
  v_debt bigint := 0;
  v_fee bigint := 0;
  v_rec record;
  v_available bigint;
begin
  if not (public.is_hub_admin() or coalesce(auth.role(), '') = 'service_role') then
    if p_company_id not in (select public.current_company_ids())
       or not public.member_has_scope(p_company_id, 'finance:read') then
      raise exception 'Sem permissão para este saldo.' using errcode = '42501';
    end if;
  end if;

  with sales as (
    select p.paid_at, p.partner_release_at,
           coalesce((select sum((r->>'amount')::int) from jsonb_array_elements(p.split) r
                      where public.split_rule_is_partner(r)), 0)::bigint
           - coalesce(p.debt_recovered_cents, 0)
           - (case when coalesce((select bool_or(coalesce((r->>'chargeProcessingFee')::boolean, false))
                                   from jsonb_array_elements(p.split) r where public.split_rule_is_partner(r)), false)
                   then coalesce(p.gateway_fee_cents, 0) else 0 end)
           - coalesce(p.refund_partner_cents, 0) as net_cents,
           -- Fração estornada que a Movepark pagou do master: o dinheiro dessa venda já ficou com o
           -- parceiro e virou dívida. Segurar isso "pelo prazo" não protege ninguém (o cliente já foi
           -- reembolsado), então libera na hora e a dívida abate em seguida. Sem isso a tela mostrava
           -- uma venda cancelada como "retida pelo prazo".
           (case when p.refund_absorbed_by_master is true and p.amount > 0
                 then least(1::numeric, coalesce(p.refunded_amount, 0) / p.amount) else 0::numeric end) as master_ratio
      from public.payment p
      join public.booking b on b.id = p.booking_id
      join public.location l on l.id = b.location_id
     where l.company_id = p_company_id and p.provider = 'pagarme' and p.kind = 'booking'
       and p.status in ('paid', 'refunded') and p.paid_at is not null and p.split_sent_to_gateway is true
  )
  select coalesce(sum(case when paid_at + make_interval(days => v_days) <= now()
                                and partner_release_at is not null and partner_release_at <= now()
                           then net_cents else round(net_cents * master_ratio) end), 0),
         coalesce(sum(case when paid_at + make_interval(days => v_days) <= now()
                                and partner_release_at is not null and partner_release_at <= now()
                           then 0 else net_cents - round(net_cents * master_ratio) end), 0)
    into v_released, v_retained
    from sales where net_cents > 0;

  select coalesce(sum(t.amount_cents), 0) into v_transfers_in
    from public.payout_transfer t where t.company_id = p_company_id and t.status = 'paid' and t.deleted_at is null;

  -- Saques pedidos (pagos ou em curso) COM a taxa que cada um custou: é aqui que a taxa entra no
  -- razão, no momento do saque, nunca antes.
  select coalesce(sum(w.amount_cents + case when w.fee_borne_by = 'movepark' then 0 else w.fee_cents end), 0) into v_withdrawn
    from public.payout_withdrawal w
   where w.company_id = p_company_id and w.deleted_at is null and w.status in ('created', 'processing', 'paid');

  v_debt := public.payout_debt_cents(p_company_id);
  v_fee := coalesce((select nullif(trim(s.value), '')::bigint from public.app_setting s where s.key = 'payout_withdrawal_fee_cents'), 0);

  select r.balance_available_cents, r.balance_waiting_cents, r.balance_synced_at, r.status::text as status,
         r.gateway_missing_at is not null as missing
    into v_rec
    from public.payout_recipient r
   where r.company_id = p_company_id and r.provider = 'pagarme' and r.deleted_at is null
   limit 1;

  v_available := greatest(0, least(
    v_released + v_transfers_in - v_debt - v_withdrawn,
    coalesce(v_rec.balance_available_cents, 0)
  ));

  return jsonb_build_object(
    'company_id', p_company_id,
    'release_days', v_days,
    'released_cents', v_released + v_transfers_in,
    'retained_cents', v_retained,
    'debt_cents', v_debt,
    'withdrawn_cents', v_withdrawn,
    'gateway_available_cents', v_rec.balance_available_cents,
    'gateway_waiting_cents', v_rec.balance_waiting_cents,
    'gateway_synced_at', v_rec.balance_synced_at,
    'recipient_status', v_rec.status,
    'recipient_missing', coalesce(v_rec.missing, false),
    'fee_credit_cents', public.payout_fee_credit_cents(p_company_id),
    'available_cents', v_available,
    -- Informativa: cobrada do recebedor no ato do saque, nunca descontada daqui.
    'withdrawal_fee_cents', v_fee,
    'max_withdraw_cents', v_available
  );
end;
$function$;

-- ── 10. partner_account_statement: origem do saque e a devolução do crédito ───────────────
-- (definição viva em 26/09/2026; fee_credit_returned_cents no CTE sales, origem e nota no ramo
--  withdrawal e o ramo fee_credit)
CREATE OR REPLACE FUNCTION public.partner_account_statement(p_company_id uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_admin boolean := public.is_hub_admin();
  v_rec record;
  v_moves jsonb;
  -- Prazo de saque da empresa (E0.3.8): o mesmo que `payout_withdrawable` usa para liberar.
  v_days int := public.payout_release_days(p_company_id);
begin
  if not v_admin then
    if p_company_id not in (select public.current_company_ids())
       or not public.member_has_scope(p_company_id, 'finance:read') then
      raise exception 'Sem permissão para este extrato.' using errcode = '42501';
    end if;
  end if;

  select r.status::text as status, r.external_recipient_id, r.gateway_missing_at,
         r.balance_available_cents, r.balance_waiting_cents, r.balance_transferred_cents, r.balance_synced_at,
         r.transfer_enabled, r.transfer_interval, r.transfer_day
    into v_rec
    from public.payout_recipient r
   where r.company_id = p_company_id and r.provider = 'pagarme' and r.deleted_at is null
   limit 1;

  with sales as (
    select p.id, b.code, p.paid_at, p.refunded_at, p.amount, p.refunded_amount, p.partner_release_at,
           coalesce(p.debt_recovered_cents, 0)::bigint as debt_recovered_cents,
           p.gateway_fee_cents, coalesce(p.refund_partner_cents, 0)::bigint as refund_partner_cents,
           p.refund_absorbed_by_master, p.refund_reason, p.split_sent_to_gateway, p.chargeback_debt_cents,
           coalesce(p.fee_credit_returned_cents, 0)::bigint as fee_credit_returned_cents,
           coalesce((select sum((r->>'amount')::int) from jsonb_array_elements(p.split) r
                      where public.split_rule_is_partner(r)), 0)::bigint as partner_cents,
           coalesce((select bool_or(coalesce((r->>'chargeProcessingFee')::boolean, false))
                       from jsonb_array_elements(p.split) r where public.split_rule_is_partner(r)), false) as partner_pays_fee
      from public.payment p
      join public.booking b on b.id = p.booking_id
      join public.location l on l.id = b.location_id
     where l.company_id = p_company_id and p.provider = 'pagarme' and p.kind = 'booking'
       and p.status in ('paid', 'refunded') and p.paid_at is not null
  ),
  moves as (
    -- Venda: a parte do parceiro entrou no recebedor dele (líquida da taxa e do abatimento).
    select 'sale'::text as kind, s.paid_at as at, s.code as booking_code,
           s.partner_cents as gross_cents,
           (case when s.partner_pays_fee then coalesce(s.gateway_fee_cents, 0) else 0 end)::bigint as fee_cents,
           s.debt_recovered_cents,
           (s.partner_cents - s.debt_recovered_cents
              - case when s.partner_pays_fee then coalesce(s.gateway_fee_cents, 0) else 0 end)::bigint as net_cents,
           (-s.debt_recovered_cents)::bigint as debt_delta_cents,
           -- Quando a venda entra no disponível para saque: a MAIOR entre a data em que a Pagar.me
           -- libera o recebível e `pagamento + prazo de saque da empresa`. É a mesma conta do
           -- `payout_withdrawable`; antes o extrato olhava só o gateway e dizia "liberado" para um
           -- PIX do dia, que a regra de saque ainda segurava por 30 dias. A data existe desde o
           -- pagamento: enquanto o gateway não informou a dele, vale o prazo da empresa.
           greatest(coalesce(s.partner_release_at, s.paid_at), s.paid_at + make_interval(days => v_days)) as release_at,
           case
             -- Estorno que a Movepark absorveu inteira: nada a segurar, a dívida abate em seguida.
             when s.refund_absorbed_by_master is true and coalesce(s.refunded_amount, 0) >= s.amount then 'released'
             when greatest(coalesce(s.partner_release_at, s.paid_at), s.paid_at + make_interval(days => v_days)) > now() then 'waiting'
             -- O prazo passou mas o gateway ainda não informou a data dele: o saque segue segurando.
             when s.partner_release_at is null then 'unknown'
             else 'released' end as release_status,
           null::text as origin, null::text as status, null::text as note
      from sales s
     where s.split_sent_to_gateway is true and s.partner_cents > 0
    union all
    -- Venda em custódia (18/09/2026): a cobrança foi SEM split e o valor caiu inteiro na Movepark.
    -- Não mexe no saldo do recebedor, mas é venda do estacionamento e precisa estar na conta; o
    -- valor chega depois por repasse. O cancelamento dela também aparece, com efeito zero.
    select 'custody_sale', s.paid_at, s.code, s.partner_cents, 0::bigint, 0::bigint, 0::bigint, 0::bigint,
           null::timestamptz, null::text, null::text, null::text, 'em custódia com a Movepark'
      from sales s
     where s.split_sent_to_gateway is not true and s.partner_cents > 0
    union all
    select 'custody_refund', s.refunded_at, s.code,
           (-(round(s.partner_cents * least(1::numeric, coalesce(s.refunded_amount, 0) / nullif(s.amount, 0)))))::bigint,
           0::bigint, 0::bigint, 0::bigint, 0::bigint,
           null::timestamptz, null::text, null::text, null::text, s.refund_reason
      from sales s
     where s.refunded_at is not null and s.split_sent_to_gateway is not true and s.partner_cents > 0
       and coalesce(s.refunded_amount, 0) > 0
    union all
    -- Estorno: se o gateway debitou o parceiro, sai do saldo dele; se a Movepark absorveu, o saldo
    -- dele não muda e a parte vira dívida.
    select case when s.refund_partner_cents > 0 then 'refund' else 'debt' end,
           s.refunded_at, s.code,
           (-(round(s.partner_cents * least(1::numeric, coalesce(s.refunded_amount, 0) / nullif(s.amount, 0)))))::bigint,
           0::bigint, 0::bigint,
           (case when s.refund_partner_cents > 0 then -s.refund_partner_cents else 0 end)::bigint,
           -- Dívida líquida da taxa que o parceiro pagou: ele devolve o que recebeu.
           -- Chargeback com regra de comissão (E0.3.12): a dívida é a que a regra mandou gravar.
           (case when s.refund_partner_cents > 0 then 0
                 else coalesce(s.chargeback_debt_cents::numeric,
                        round(greatest(s.partner_cents
                              - case when s.partner_pays_fee then coalesce(s.gateway_fee_cents, 0) else 0 end, 0)
                            * least(1::numeric, coalesce(s.refunded_amount, 0) / nullif(s.amount, 0)))) end)::bigint,
           null::timestamptz, null::text,
           case when s.refund_partner_cents > 0 then 'partner' else 'master' end,
           null::text,
           case when s.chargeback_debt_cents = 0 then 'chargeback absorvido pela Movepark (regra de comissão da venda)'
                when s.chargeback_debt_cents > 0 then 'chargeback por conta do estacionamento (regra de comissão da venda)'
                else s.refund_reason end
      from sales s
     where s.refunded_at is not null and s.split_sent_to_gateway is true and s.partner_cents > 0
       and (s.refund_absorbed_by_master is true or s.refund_partner_cents > 0)
    union all
    -- Acerto manual de dívida (o parceiro pagou por fora, ou ajuste).
    select 'settlement', d.created_at, null, d.amount_cents::bigint, 0::bigint, 0::bigint, 0::bigint,
           (-d.amount_cents)::bigint, null, null, null, d.kind, d.note
      from public.payout_debt_settlement d
     where d.company_id = p_company_id and d.deleted_at is null
    union all
    -- Repasse da custódia (Movepark para o recebedor dele).
    select 'transfer_in', coalesce(t.paid_at, t.requested_at), null, t.amount_cents::bigint, 0::bigint, 0::bigint,
           t.amount_cents::bigint, 0::bigint, null, null, null, t.status::text, null
      from public.payout_transfer t
     where t.company_id = p_company_id and t.deleted_at is null
    union all
    -- Saque (do recebedor para a conta bancária dele). A data do movimento é a do pedido: o dinheiro
    -- sai do recebedor na hora; quando cai no banco vai em release_at (E0.3.10).
    select 'withdrawal', coalesce(w.requested_at, w.created_at), null, (-w.amount_cents)::bigint,
           w.fee_cents::bigint, 0::bigint, (-(w.amount_cents + w.fee_cents))::bigint, 0::bigint,
           coalesce(w.paid_at, w.expected_at),
           case when w.status = 'paid' then 'released'
                when w.status in ('failed', 'canceled') then null
                when w.expected_at is not null then 'waiting' else 'unknown' end,
           w.origin, w.status::text,
           case when w.origin = 'automatic' then 'repasse automático · taxa por conta da Movepark' else w.failure_reason end
      from public.payout_withdrawal w
     where w.company_id = p_company_id and w.deleted_at is null
    union all
    -- Devolução da taxa do repasse automático (E0.3.13): a Movepark cedeu ao parceiro, no split desta venda.
    select 'fee_credit', s.paid_at, s.code, s.fee_credit_returned_cents, 0::bigint, 0::bigint,
           s.fee_credit_returned_cents, 0::bigint, null, null, null, null,
           'taxa do repasse automático devolvida pela Movepark'
      from sales s where s.fee_credit_returned_cents > 0
  )
  -- Canal da venda (E0.3.12): a movimentação de reserva que veio por regra de comissão leva o nome
  -- do canal e o percentual, para a origem ser reconhecida sem abrir a reserva.
  select coalesce(jsonb_agg(
           to_jsonb(m) || coalesce((
             select jsonb_build_object('commission_channel', bk.commission_channel,
                                       'commission_take_rate_bps', bk.commission_take_rate_bps)
               from public.booking bk
              where bk.code = m.booking_code and bk.commission_rule_id is not null
              limit 1), '{}'::jsonb)
           order by m.at desc), '[]'::jsonb) into v_moves
    from moves m
   where m.at >= p_from and m.at < p_to;

  return jsonb_build_object(
    'company_id', p_company_id,
    'header', jsonb_build_object(
      'recipient_status', v_rec.status,
      'external_recipient_id', v_rec.external_recipient_id,
      'recipient_missing', v_rec.gateway_missing_at is not null,
      'available_cents', v_rec.balance_available_cents,
      'waiting_cents', v_rec.balance_waiting_cents,
      'transferred_cents', v_rec.balance_transferred_cents,
      'balance_synced_at', v_rec.balance_synced_at,
      'transfer_enabled', v_rec.transfer_enabled,
      'transfer_interval', v_rec.transfer_interval,
      'transfer_day', v_rec.transfer_day,
      'debt_cents', public.payout_debt_cents(p_company_id)
    ),
    'movements', v_moves
  );
end;
$function$;

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