-- Previsão do repasse automático no horário em que ele roda (E0.3.13, corrigido em 10/11/2026).
-- Spec: docs/specs/repasse-automatico-mensal.md.
--
-- O primeiro repasse real (10/11/2026) mostrou a previsão prometendo mais do que saiu: o card da
-- Abbapark dizia R$ 1.679,52 e o repasse levou R$ 1.161,52. A previsão contava as vendas que
-- liberam até o FIM do dia do repasse, mas o cron roda às 9h de Brasília (12:00 UTC). Duas vendas
-- pagas em 11/10 às 19h56 e 20h40 completavam 30 dias só à noite do dia 10/11 e ficaram para o
-- ciclo seguinte. A previsão também aceitava uma venda de cartão cujo recebível a Pagar.me só
-- solta em 11/11 (comparação inclusiva com a meia-noite).
--
-- Agora as duas funções usam a MESMA regra (payout_sale_released) e a previsão a avalia no
-- instante do repasse (payout_auto_run_at), então ela mostra exatamente o que o saque vai levar.

-- Instante em que o repasse automático do dia roda. Espelha o cron `payout-auto-run`
-- (`0 12 * * *` UTC = 9h em Brasília): mudou o cron, muda aqui.
create or replace function public.payout_auto_run_at(p_day date)
returns timestamptz
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  select (p_day + time '09:00') at time zone 'America/Sao_Paulo';
$$;

-- Uma venda está liberada para o parceiro no instante p_at quando passou o prazo da Movepark
-- (paid_at + N dias) E o recebível já está solto no gateway (partner_release_at). Regra única do
-- saque (payout_withdrawable) e da previsão (payout_auto_forecast).
create or replace function public.payout_sale_released(
  p_paid_at timestamptz, p_partner_release_at timestamptz, p_days int, p_at timestamptz
)
returns boolean
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  select p_paid_at is not null
     and p_paid_at + make_interval(days => p_days) <= p_at
     and p_partner_release_at is not null
     and p_partner_release_at <= p_at;
$$;

revoke all on function public.payout_auto_run_at(date) from public, anon;
revoke all on function public.payout_sale_released(timestamptz, timestamptz, int, timestamptz) from public, anon;
grant execute on function public.payout_auto_run_at(date) to authenticated, service_role;
grant execute on function public.payout_sale_released(timestamptz, timestamptz, int, timestamptz) to authenticated, service_role;

-- payout_withdrawable: mesma lógica de antes, com a condição de liberação vinda da regra única.
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
  select coalesce(sum(case when public.payout_sale_released(paid_at, partner_release_at, v_days, now())
                           then net_cents else round(net_cents * master_ratio) end), 0),
         coalesce(sum(case when public.payout_sale_released(paid_at, partner_release_at, v_days, now())
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

-- payout_auto_forecast: avalia a regra única no instante do repasse, não no fim do dia.
CREATE OR REPLACE FUNCTION public.payout_auto_forecast(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_days int := public.payout_release_days(p_company_id);
  v_next date := public.payout_next_auto_at(p_company_id);
  v_run_at timestamptz;
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
  -- O instante do repasse (9h de Brasília), não o fim do dia: venda que completa o prazo à tarde
  -- do dia do repasse fica para o mês seguinte, e a previsão tem que dizer isso.
  v_run_at := public.payout_auto_run_at(v_next);

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
  select coalesce(sum(case when public.payout_sale_released(paid_at, partner_release_at, v_days, v_run_at)
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
    'run_at', v_run_at,
    'forecast_cents', v_forecast,
    'min_cents', v_min,
    'below_min', v_forecast < v_min,
    'recipient_status', v_rec.status,
    'recipient_missing', coalesce(v_rec.missing, false),
    'last_cycle', case when v_last.cycle_month is null then null else jsonb_build_object(
      'cycle_month', v_last.cycle_month, 'outcome', v_last.outcome, 'amount_cents', v_last.amount_cents,
      'available_cents', v_last.available_cents, 'ran_at', v_last.ran_at, 'reason', v_last.reason) end);
end $function$;
