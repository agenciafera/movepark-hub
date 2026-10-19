-- Estorno avulso pelo Manager, sem cancelar a reserva (19/10/2026, pedido do Kallef).
--
-- Até aqui o único jeito de devolver dinheiro era cancelar a reserva (booking-flow.md, "Reembolso
-- = cancelamento"). A cobrança em dobro da MP-07DAE9 mostrou o buraco: a cópia precisava voltar
-- para a cliente com a reserva de pé, e o caminho que sobrava era o painel da Pagar.me, sem
-- motivo, sem quem fez e sem o razão do parceiro acompanhar. A Edge `refund-payment` (hub_admin)
-- estorna UM pagamento pela mesma contabilidade do cancelamento (`executeRefund`) e deixa a
-- reserva como está.
--
-- `refund_keeps_booking` é gravado ANTES de chamar o gateway: o `charge.refunded` que volta pelo
-- webhook (e o reconcile-refunds) lê a marca e não cancela a reserva, mesmo quando era o único
-- pagamento dela. `refund_requested_by` guarda quem pediu.

alter table public.payment
  add column if not exists refund_keeps_booking boolean not null default false,
  add column if not exists refund_requested_by uuid references public.profiles(id) on delete set null;

comment on column public.payment.refund_keeps_booking is
  'Estorno avulso pelo Manager: o estorno deste pagamento não cancela a reserva (webhook e reconcile-refunds respeitam).';
comment on column public.payment.refund_requested_by is
  'Quem pediu o estorno avulso (hub_admin).';

-- Rastro do Manager passa a mostrar a marca e quem pediu.
create or replace function public.booking_gateway_trail(p_booking_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select case when not public.is_hub_admin() then null else jsonb_build_object(
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'kind', p.kind, 'method', p.method, 'status', p.status, 'amount', p.amount,
        'installments', p.installments,
        'provider_payment_id', p.provider_payment_id, 'provider_charge_id', p.provider_charge_id,
        'created_at', p.created_at, 'paid_at', p.paid_at, 'expires_at', p.expires_at,
        'refunded_at', p.refunded_at, 'refunded_amount', p.refunded_amount, 'refund_reason', p.refund_reason,
        'refund_absorbed_by_master', p.refund_absorbed_by_master, 'refund_partner_cents', p.refund_partner_cents,
        'refund_partner_balance_cents', p.refund_partner_balance_cents, 'refund_split', p.refund_split,
        'refund_keeps_booking', p.refund_keeps_booking,
        'refund_requested_by_email', (select u.email from auth.users u where u.id = p.refund_requested_by),
        'split', p.split, 'split_sent_to_gateway', p.split_sent_to_gateway,
        'debt_recovered_cents', p.debt_recovered_cents,
        'gateway_fee_cents', p.gateway_fee_cents, 'gateway_fee_synced_at', p.gateway_fee_synced_at,
        'partner_release_at', p.partner_release_at, 'pix_qr_code_url', p.pix_qr_code_url
      ) order by p.created_at)
      from public.payment p where p.booking_id = p_booking_id), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'payment_id', e.payment_id, 'kind', e.kind, 'http_status', e.http_status,
        'request', e.request, 'response', e.response, 'note', e.note, 'created_at', e.created_at
      ) order by e.created_at desc)
      from public.payment_gateway_event e where e.booking_id = p_booking_id), '[]'::jsonb)
  ) end;
$$;

alter function public.booking_gateway_trail(uuid) owner to postgres;
revoke all on function public.booking_gateway_trail(uuid) from public, anon;
grant execute on function public.booking_gateway_trail(uuid) to authenticated, service_role;
