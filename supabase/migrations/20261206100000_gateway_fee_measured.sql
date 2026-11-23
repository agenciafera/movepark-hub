-- Taxa do gateway medida nas vendas (23/11/2026). Spec: docs/specs/taxas-da-reserva.md
--
-- O Manager cadastra a tabela de taxas contratada com a Pagar.me em app_setting (nunca aqui: o
-- repo é público e a proposta comercial tem sigilo). Esta RPC mede o que a Pagar.me cobrou de
-- fato, a partir do último GET /payables gravado no rastro de cada pagamento, para a tela pôr o
-- contratado ao lado do medido. Devolve SOMAS por método e número de parcelas, e não a taxa por
-- faixa, porque as faixas são configuração: quem divide é o front, sobre a faixa cadastrada.
-- Só recebíveis de crédito (o refund devolve MDR e zeraria a conta, como em totalGatewayFeeCents).
-- Antecipação: taxa efetiva ao mês sobre o líquido do recebível, proporcional aos dias corridos
-- entre a data em que o dinheiro entrou e a data original.

create or replace function public.gateway_fee_measured(p_days int default 90)
  returns jsonb
  language plpgsql stable security definer
  set search_path = public, pg_temp
as $$
declare
  v_days int := least(greatest(coalesce(p_days, 90), 1), 365);
  v_out jsonb;
begin
  if not public.is_hub_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  with pay as (
    select p.id, p.method,
           case when p.method = 'card' then greatest(coalesce(p.installments, 1), 1) else 1 end as installments,
           round(p.amount * 100)::bigint as charged_cents
      from public.payment p
     where p.provider = 'pagarme'
       and p.status in ('paid', 'refunded')
       and p.paid_at >= now() - make_interval(days => v_days)
  ),
  ev as (
    select distinct on (e.payment_id) e.payment_id, e.response
      from public.payment_gateway_event e
      join pay on pay.id = e.payment_id
     where e.kind = 'payables'
     order by e.payment_id, e.created_at desc
  ),
  item as (
    select ev.payment_id, x.r
      from ev
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(ev.response -> 'data') = 'array' then ev.response -> 'data' else '[]'::jsonb end
      ) as x(r)
     where coalesce(x.r ->> 'type', 'credit') = 'credit'
  ),
  per_pay as (
    select pay.id, pay.method, pay.installments, pay.charged_cents,
           sum(coalesce((i.r ->> 'fee')::bigint, 0)) as fee_cents,
           sum(coalesce((i.r ->> 'fraud_coverage_fee')::bigint, 0)) as fraud_cents
      from pay
      join item i on i.payment_id = pay.id
     group by pay.id, pay.method, pay.installments, pay.charged_cents
  ),
  grp as (
    select method, installments, count(*) as sales,
           sum(charged_cents) as charged_cents, sum(fee_cents) as fee_cents, sum(fraud_cents) as fraud_cents
      from per_pay
     group by method, installments
  ),
  ant as (
    select (i.r ->> 'anticipation_fee')::numeric as fee,
           ((i.r ->> 'amount')::numeric - coalesce((i.r ->> 'fee')::numeric, 0))
             * (extract(epoch from ((i.r ->> 'original_payment_date')::timestamptz
                                    - (i.r ->> 'payment_date')::timestamptz)) / 86400) / 30 as base_month
      from item i
     where coalesce((i.r ->> 'anticipation_fee')::numeric, 0) > 0
       and i.r ? 'original_payment_date'
       and (i.r ->> 'original_payment_date')::timestamptz > (i.r ->> 'payment_date')::timestamptz
  )
  select jsonb_build_object(
           'days', v_days,
           'rows', coalesce((select jsonb_agg(jsonb_build_object(
                       'method', g.method, 'installments', g.installments, 'sales', g.sales,
                       'charged_cents', g.charged_cents, 'fee_cents', g.fee_cents, 'fraud_cents', g.fraud_cents)
                       order by g.method, g.installments) from grp g), '[]'::jsonb),
           'anticipation', (select jsonb_build_object(
                       'payables', count(*),
                       'fee_cents', coalesce(sum(a.fee), 0)::bigint,
                       'base_cents_month', coalesce(round(sum(a.base_month)), 0)::bigint,
                       'monthly_bps', case when sum(a.base_month) > 0
                                           then round(sum(a.fee) * 10000 / sum(a.base_month), 2) end)
                       from ant a))
    into v_out;

  return v_out;
end;
$$;

revoke all on function public.gateway_fee_measured(int) from public, anon, authenticated;
grant execute on function public.gateway_fee_measured(int) to authenticated;

comment on function public.gateway_fee_measured(int) is
  'Taxa do gateway medida nas vendas: somas por método e parcelas e antecipação ao mês. Só hub_admin. Spec: docs/specs/taxas-da-reserva.md';
