-- Controle de saques (E0.3.10, 17/09/2026). Spec: docs/specs/conta-do-parceiro.md.
--
-- O saque nascia com o status da resposta do gateway e ninguém o relia: o webhook `transfer.*`
-- nunca chegou nesta conta e a conciliação só olhava o repasse da custódia. Um saque ficaria
-- "Processando" para sempre, sem previsão de quando cai nem confirmação de que caiu. Agora a linha
-- guarda a previsão (`funding_estimated_date`), a data em que caiu (`funding_date`), o status cru e
-- o motivo da falha (`bank_response`), e `reconcile-payout-transfers` relê os saques abertos.

alter table public.payout_withdrawal
  add column if not exists expected_at timestamptz,
  add column if not exists gateway_status text,
  add column if not exists failure_reason text,
  add column if not exists synced_at timestamptz;
comment on column public.payout_withdrawal.expected_at is
  'Previsão de crédito no banco (funding_estimated_date do gateway, ou a regra D+0 antes das 15h em dia útil).';
comment on column public.payout_withdrawal.gateway_status is
  'Status cru da transferência no gateway na última leitura (pending_transfer, processing, transferred, failed, canceled).';
comment on column public.payout_withdrawal.failure_reason is
  'Motivo devolvido pelo banco (bank_response) quando o saque falha.';
comment on column public.payout_withdrawal.synced_at is
  'Última vez que o status foi lido do gateway (webhook ou conciliação).';

create index if not exists payout_withdrawal_open_idx
  on public.payout_withdrawal (requested_at)
  where deleted_at is null and status in ('created', 'processing');

-- O extrato passa a dizer, no saque, quando cai (previsão) ou quando caiu, e o motivo se falhou.
create or replace function public.partner_account_statement(
  p_company_id uuid,
  p_from timestamptz,
  p_to timestamptz
) returns jsonb
  language plpgsql stable security definer
  set search_path = public, pg_temp
as $$
declare
  v_admin boolean := public.is_hub_admin();
  v_rec record;
  v_moves jsonb;
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
           p.refund_absorbed_by_master, p.refund_reason, p.split_sent_to_gateway,
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
           s.partner_release_at as release_at,
           case when s.partner_release_at is null then 'unknown'
                when s.partner_release_at <= now() then 'released' else 'waiting' end as release_status,
           null::text as origin, null::text as status, null::text as note
      from sales s
     where s.split_sent_to_gateway is true and s.partner_cents > 0
    union all
    -- Estorno: se o gateway debitou o parceiro, sai do saldo dele; se a Movepark absorveu, o saldo
    -- dele não muda e a parte vira dívida.
    select case when s.refund_partner_cents > 0 then 'refund' else 'debt' end,
           s.refunded_at, s.code,
           (-(round(s.partner_cents * least(1::numeric, coalesce(s.refunded_amount, 0) / nullif(s.amount, 0)))))::bigint,
           0::bigint, 0::bigint,
           (case when s.refund_partner_cents > 0 then -s.refund_partner_cents else 0 end)::bigint,
           (case when s.refund_partner_cents > 0 then 0
                 else round(s.partner_cents * least(1::numeric, coalesce(s.refunded_amount, 0) / nullif(s.amount, 0))) end)::bigint,
           null::timestamptz, null::text,
           case when s.refund_partner_cents > 0 then 'partner' else 'master' end,
           null::text, s.refund_reason
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
  select coalesce(jsonb_agg(to_jsonb(m) order by m.at desc), '[]'::jsonb) into v_moves
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
$$;

