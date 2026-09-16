-- Saque controlado pela Movepark (E0.3.8, 16/09/2026). Spec: docs/specs/conta-do-parceiro.md.
--
-- Decisões do Kallef: saque SEMPRE manual (transferência automática desligada em todo recebedor);
-- o "disponível para saque" é calculado do nosso lado, não espelha o saldo da Pagar.me; a venda
-- libera N dias depois do pagamento (padrão global `payout_release_days`, sobrescrito por empresa
-- em `company.payout_release_days`); o parceiro saca pelo Operator até esse teto, a Movepark também
-- (e só passa do teto com confirmação explícita); a taxa de saque é do parceiro.
--
-- O saldo da Pagar.me continua sendo o cofre e o teto físico: o nosso número nunca passa dele.

insert into public.app_setting (key, value, is_public)
values ('payout_release_days', '30', false)
on conflict (key) do nothing;

alter table public.company
  add column if not exists payout_release_days integer
    check (payout_release_days is null or (payout_release_days >= 0 and payout_release_days <= 365));
comment on column public.company.payout_release_days is
  'Dias depois do pagamento para a venda entrar no disponível para saque. Nulo = herda app_setting.payout_release_days.';

create or replace function public.payout_release_days(p_company_id uuid) returns integer
  language sql stable security definer
  set search_path = public, pg_temp
as $$
  select coalesce(
    (select c.payout_release_days from public.company c where c.id = p_company_id),
    (select nullif(trim(s.value), '')::int from public.app_setting s where s.key = 'payout_release_days'),
    30
  );
$$;
alter function public.payout_release_days(uuid) owner to postgres;
revoke all on function public.payout_release_days(uuid) from public, anon;
grant execute on function public.payout_release_days(uuid) to authenticated, service_role;

create or replace function public.company_set_payout_release_days(p_company_id uuid, p_days integer) returns void
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
begin
  if not public.is_hub_admin() then
    raise exception 'Só hub_admin muda o prazo de liberação.' using errcode = 'P0001';
  end if;
  update public.company set payout_release_days = p_days, updated_at = now() where id = p_company_id;
end;
$$;
alter function public.company_set_payout_release_days(uuid, integer) owner to postgres;
revoke all on function public.company_set_payout_release_days(uuid, integer) from public, anon;
grant execute on function public.company_set_payout_release_days(uuid, integer) to authenticated, service_role;

-- ── payout_withdrawable: o número que trava o saque ──
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
  v_rec record;
  v_available bigint;
begin
  if not (public.is_hub_admin() or coalesce(auth.role(), '') = 'service_role') then
    if p_company_id not in (select public.current_company_ids())
       or not public.member_has_scope(p_company_id, 'finance:read') then
      raise exception 'Sem permissão para este saldo.' using errcode = '42501';
    end if;
  end if;

  -- Vendas com split: líquido do parceiro = perna − taxa que ele paga − abatimento − o que o
  -- gateway já debitou dele em estorno híbrido. Estorno absorvido pela Movepark não tira daqui
  -- (o dinheiro ficou com ele); entra pela dívida.
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

  -- Repasse da custódia já pago: dinheiro que a Movepark pôs no recebedor dele, liberado.
  select coalesce(sum(t.amount_cents), 0) into v_transfers_in
    from public.payout_transfer t where t.company_id = p_company_id and t.status = 'paid' and t.deleted_at is null;

  -- Saques pedidos (pagos ou em curso) saem do que ele ainda pode sacar, com a taxa.
  select coalesce(sum(w.amount_cents + w.fee_cents), 0) into v_withdrawn
    from public.payout_withdrawal w
   where w.company_id = p_company_id and w.deleted_at is null and w.status in ('created', 'processing', 'paid');

  v_debt := public.payout_debt_cents(p_company_id);

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
    'available_cents', v_available
  );
end;
$$;
alter function public.payout_withdrawable(uuid) owner to postgres;
revoke all on function public.payout_withdrawable(uuid) from public, anon;
grant execute on function public.payout_withdrawable(uuid) to authenticated, service_role;
