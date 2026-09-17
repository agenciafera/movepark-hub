-- Taxa de saque cobrada SÓ no saque (17/09/2026). Correção do Kallef: o disponível para saque não
-- pode chegar já com a taxa descontada. O parceiro pode pedir até o disponível inteiro; a taxa
-- (R$ 3,67) é cobrada dele, do saldo do recebedor, no momento do saque, como a Pagar.me faz
-- ("as taxas de saque sempre são cobradas da conta do recebedor que realiza a transferência"),
-- e entra no nosso razão como custo do saque (`payout_withdrawal.fee_cents`), abatendo o
-- disponível seguinte. Não há API para escolher quem paga: é sempre o recebedor.

create or replace function public.payout_withdrawable(p_company_id uuid) returns jsonb
  language plpgsql stable security definer
  set search_path = public, pg_temp
as $$
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
           - coalesce(p.refund_partner_cents, 0) as net_cents
      from public.payment p
      join public.booking b on b.id = p.booking_id
      join public.location l on l.id = b.location_id
     where l.company_id = p_company_id and p.provider = 'pagarme' and p.kind = 'booking'
       and p.status in ('paid', 'refunded') and p.paid_at is not null and p.split_sent_to_gateway is true
  )
  select coalesce(sum(net_cents) filter (where paid_at + make_interval(days => v_days) <= now()
                                            and partner_release_at is not null and partner_release_at <= now()), 0),
         coalesce(sum(net_cents) filter (where not (paid_at + make_interval(days => v_days) <= now()
                                            and partner_release_at is not null and partner_release_at <= now())), 0)
    into v_released, v_retained
    from sales where net_cents > 0;

  select coalesce(sum(t.amount_cents), 0) into v_transfers_in
    from public.payout_transfer t where t.company_id = p_company_id and t.status = 'paid' and t.deleted_at is null;

  -- Saques pedidos (pagos ou em curso) COM a taxa que cada um custou: é aqui que a taxa entra no
  -- razão, no momento do saque, nunca antes.
  select coalesce(sum(w.amount_cents + w.fee_cents), 0) into v_withdrawn
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
    'available_cents', v_available,
    -- Informativa: cobrada do recebedor no ato do saque, nunca descontada daqui.
    'withdrawal_fee_cents', v_fee,
    'max_withdraw_cents', v_available
  );
end;
$$;
