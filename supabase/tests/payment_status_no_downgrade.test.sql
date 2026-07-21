-- pgTAP: corrida do webhook do Pagar.me (86ajmwb4u). A escrita de status via
-- apply_payment_webhook_status é monotônica: nunca rebaixa um pagamento terminal. Isso fecha o
-- lost-update entre charge.pending e charge.paid, sem bloquear paid->refunded (estorno legítimo).
-- Transação com rollback.

begin;
select plan(10);

-- A função existe e tem o grant certo (só service_role chama).
select has_function(
  'public', 'apply_payment_webhook_status',
  array['uuid', 'payment_status', 'boolean'],
  'apply_payment_webhook_status existe'
);
select function_privs_are(
  'public', 'apply_payment_webhook_status', array['uuid', 'payment_status', 'boolean'],
  'service_role', array['EXECUTE'], 'service_role pode executar'
);
select ok(
  not has_function_privilege('anon', 'public.apply_payment_webhook_status(uuid, payment_status, boolean)', 'EXECUTE'),
  'anon NÃO pode executar'
);

-- ── fixture: reserva + payment pago ──────────────────────────────────────────
do $$
declare u uuid := gen_random_uuid(); v_lpt uuid; a jsonb; v_pay uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (u,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','race@ex.com',now(),now());
  insert into public.profiles(id, role) values (u,'customer') on conflict (id) do nothing;
  select id into v_lpt from public.location_parking_type where capacity > 0 and is_active limit 1;
  update public.location_parking_type set capacity = 5 where id = v_lpt;
  a := public.create_booking_atomic(u, v_lpt, '2026-11-10T12:00:00Z', '2026-11-12T12:00:00Z');
  insert into public.payment (booking_id, provider, amount, status, paid_at)
    values ((a ->> 'booking_id')::uuid, 'pagarme', 100, 'paid', now())
    returning id into v_pay;
  perform set_config('test.payment_id', v_pay::text, false);
end $$;

-- 1. A CORRIDA: paid -> pending é bloqueada, status permanece paid.
select is(
  (select applied from apply_payment_webhook_status(current_setting('test.payment_id')::uuid, 'pending', false)),
  false, 'paid->pending (a corrida) NÃO é aplicada'
);
select is(
  (select status from payment where id = current_setting('test.payment_id')::uuid),
  'paid'::payment_status, 'status continua paid depois da tentativa de rebaixamento'
);

-- 1b. paid -> cancelled também é bloqueado (a única saída de 'paid' é o estorno).
select is(
  (select applied from apply_payment_webhook_status(current_setting('test.payment_id')::uuid, 'cancelled', false)),
  false, 'paid->cancelled NÃO é aplicado'
);

-- 2. ESTORNO: paid -> refunded é aplicado (não pode ser bloqueado pelo fix).
select is(
  (select applied from apply_payment_webhook_status(current_setting('test.payment_id')::uuid, 'refunded', false)),
  true, 'paid->refunded (estorno) é aplicado'
);

-- 3. refunded -> pending é bloqueado.
select is(
  (select applied from apply_payment_webhook_status(current_setting('test.payment_id')::uuid, 'pending', false)),
  false, 'refunded->pending NÃO é aplicado'
);

-- 4. Avanço normal pending -> paid é aplicado e grava paid_at.
do $$
begin
  update payment set status='pending', paid_at=null where id = current_setting('test.payment_id')::uuid;
  perform apply_payment_webhook_status(current_setting('test.payment_id')::uuid, 'paid', true);
end $$;
select is(
  (select status from payment where id = current_setting('test.payment_id')::uuid),
  'paid'::payment_status, 'pending->paid é aplicado'
);
select ok(
  (select paid_at is not null from payment where id = current_setting('test.payment_id')::uuid),
  'pending->paid grava paid_at'
);

select finish();
rollback;
