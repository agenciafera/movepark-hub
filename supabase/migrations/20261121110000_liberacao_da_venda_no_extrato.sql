-- Liberação da venda no extrato e canal na movimentação. Specs: conta-do-parceiro.md, comissao-por-origem.md
--
-- 1. A coluna "Liberação" do extrato dizia "liberado" para um PIX pago no mesmo dia, porque olhava
--    só a data do recebível na Pagar.me, enquanto a regra de saque (`payout_withdrawable`) segura a
--    venda pelo prazo da empresa (30 dias por padrão). E ficava "sem previsão" nos primeiros minutos,
--    até o job de recebíveis rodar. Agora a data é a maior entre a do gateway e `pagamento + prazo`,
--    e existe desde o pagamento.
-- 2. Venda que veio por regra de comissão (E0.3.12) leva o canal e o percentual na movimentação.

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
           null,
           w.status::text, w.failure_reason
      from public.payout_withdrawal w
     where w.company_id = p_company_id and w.deleted_at is null
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
$function$

;
