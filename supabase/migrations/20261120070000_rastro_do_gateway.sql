-- Rastro do gateway (E0.3.9, 17/09/2026). Spec: docs/specs/rastro-do-gateway.md.
--
-- O Manager precisa ver o que a Pagar.me devolveu em cada ação: order e charge da reserva, a
-- resposta do estorno, os webhooks que chegaram. Até aqui isso ia para o console da Edge e sumia.
-- Cada chamada relevante grava uma linha aqui, ligada ao payment e à reserva, com o status HTTP,
-- um resumo do pedido e a resposta crua. Só hub_admin lê; quem escreve são as Edges (service role).

create table if not exists public.payment_gateway_event (
  id          uuid primary key default gen_random_uuid(),
  payment_id  uuid references public.payment(id) on delete cascade,
  booking_id  uuid references public.booking(id) on delete cascade,
  provider    text not null default 'pagarme',
  -- charge_created | refund | webhook:<tipo> | payables | withdrawal | chargeback
  kind        text not null,
  http_status integer,
  request     jsonb,
  response    jsonb,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists payment_gateway_event_booking_idx on public.payment_gateway_event (booking_id, created_at desc);
create index if not exists payment_gateway_event_payment_idx on public.payment_gateway_event (payment_id, created_at desc);
comment on table public.payment_gateway_event is
  'Rastro das chamadas ao gateway por pagamento: o que pedimos, o que voltou. Manager lê; Edges escrevem.';

alter table public.payment_gateway_event enable row level security;
drop policy if exists "payment_gateway_event_admin_read" on public.payment_gateway_event;
create policy "payment_gateway_event_admin_read" on public.payment_gateway_event
  for select to authenticated using (public.is_hub_admin());
grant select on public.payment_gateway_event to authenticated;
grant all on public.payment_gateway_event to service_role;

-- ── booking_gateway_trail: pagamentos e rastro de uma reserva, para o Manager ──
create or replace function public.booking_gateway_trail(p_booking_id uuid) returns jsonb
  language sql stable security definer
  set search_path = public, pg_temp
as $$
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
