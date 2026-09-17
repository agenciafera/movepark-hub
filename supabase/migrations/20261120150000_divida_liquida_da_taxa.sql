-- Dívida líquida da taxa (17/09/2026). Specs: split-dinamico-e-divida-do-parceiro.md, estorno-hibrido.md.
--
-- Quando a Movepark paga o estorno do master e a parte do parceiro vira dívida, ele devolve o que
-- RECEBEU: a perna dele menos a taxa de processamento que pagou na captura. É a mesma regra do
-- estorno híbrido (decisão 2), que já debitava o líquido; a fórmula da dívida ainda usava a perna
-- bruta, e o mesmo cancelamento custava R$ 0,18 a mais ao parceiro conforme ele tinha saldo ou não.
-- A Movepark absorve a taxa da Pagar.me da venda cancelada. Enquanto a taxa não foi apurada pelo
-- reconcile-gateway-fees (até 30 min), a dívida conta a perna inteira e cai sozinha depois.

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
      -- Taxa que o parceiro pagou na captura (charge_processing_fee na perna dele). Fica fora da
      -- dívida: ele devolve o que recebeu, e a Movepark absorve a taxa da venda cancelada (mesma
      -- regra do estorno híbrido). Enquanto a taxa não foi apurada, conta a perna inteira.
      case when coalesce(bool_or(coalesce((r->>'chargeProcessingFee')::boolean, false))
                  filter (where public.split_rule_is_partner(r) and p.kind = 'booking'), false)
           then coalesce(p.gateway_fee_cents, 0) else 0 end as partner_fee_cents,
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
    group by p.id, p.status, p.kind, p.amount, p.refunded_amount, p.gateway_fee_cents
  ),
  gerada as (
    select coalesce(sum(round(greatest(partner_cents - partner_fee_cents, 0) * refund_ratio)), 0)::bigint as cents from per_payment
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
           round(greatest(coalesce(sum((r->>'amount')::int)
               filter (where public.split_rule_is_partner(r)), 0)
             - case when coalesce(bool_or(coalesce((r->>'chargeProcessingFee')::boolean, false))
                          filter (where public.split_rule_is_partner(r)), false)
                    then coalesce(p.gateway_fee_cents, 0) else 0 end, 0)
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
    group by b.code, p.id, p.status, p.refunded_at, p.refund_reason, p.amount, p.refunded_amount, p.gateway_fee_cents
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
           -- Dívida líquida da taxa que o parceiro pagou: ele devolve o que recebeu.
           (case when s.refund_partner_cents > 0 then 0
                 else round(greatest(s.partner_cents
                              - case when s.partner_pays_fee then coalesce(s.gateway_fee_cents, 0) else 0 end, 0)
                            * least(1::numeric, coalesce(s.refunded_amount, 0) / nullif(s.amount, 0))) end)::bigint,
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
alter function public.partner_account_statement(uuid, timestamptz, timestamptz) owner to postgres;
revoke all on function public.partner_account_statement(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.partner_account_statement(uuid, timestamptz, timestamptz) to authenticated, service_role;
