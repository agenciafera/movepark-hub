-- pgTAP: `confirm_or_refund_booking` não reconfirma estadia que já terminou.
--
-- O caso vem do reconcile-pending-charges: um PIX de agosto ficou preso em `pending` porque o
-- webhook `charge.paid` se perdeu, o cron expirou a reserva, e o pagamento só é descoberto semanas
-- depois. Sem a guarda de data, a descoberta reconfirmaria uma reserva cuja diária já passou: o
-- cliente não estacionou, a vaga voltou pro estoque e ainda viraria dívida com o parceiro.
-- Estadia terminada só tem um desfecho, que é devolver o dinheiro.
-- Transação com rollback.

begin;
select plan(9);

select has_function(
  'public', 'confirm_or_refund_booking', array['uuid', 'uuid'],
  'confirm_or_refund_booking existe'
);

-- ── fixture: duas reservas expiradas, uma no passado e uma no futuro ─────────
do $$
declare
  u uuid := gen_random_uuid();
  v_lpt uuid;
  a jsonb;
  v_b_passada uuid; v_b_futura uuid; v_b_viva uuid;
  v_p_passada uuid; v_p_futura uuid; v_p_viva uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (u,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','estadia@ex.com',now(),now());
  insert into public.profiles(id, role) values (u,'customer') on conflict (id) do update set role = excluded.role;

  select id into v_lpt from public.location_parking_type where capacity > 0 and is_active limit 1;
  update public.location_parking_type set capacity = 50 where id = v_lpt;

  -- Reserva cuja estadia já acabou. As datas entram por update depois do create_booking_atomic
  -- porque criar reserva no passado não passa pelas validações do fluxo normal, e é justamente
  -- assim que a linha antiga chega até aqui: ela envelheceu parada.
  a := public.create_booking_atomic(u, v_lpt, now() + interval '2 days', now() + interval '4 days');
  v_b_passada := (a ->> 'booking_id')::uuid;
  update public.booking
     set check_in_at = now() - interval '40 days',
         check_out_at = now() - interval '38 days',
         status = 'expired'
   where id = v_b_passada;
  insert into public.payment (booking_id, provider, amount, status, provider_charge_id)
    values (v_b_passada, 'pagarme', 162.40, 'paid', 'ch_passada')
    returning id into v_p_passada;

  -- Reserva expirada, mas cuja estadia ainda está por vir: continua reconfirmável.
  a := public.create_booking_atomic(u, v_lpt, now() + interval '10 days', now() + interval '12 days');
  v_b_futura := (a ->> 'booking_id')::uuid;
  update public.booking set status = 'expired' where id = v_b_futura;
  insert into public.payment (booking_id, provider, amount, status, provider_charge_id)
    values (v_b_futura, 'pagarme', 30.90, 'paid', 'ch_futura')
    returning id into v_p_futura;

  -- Reserva viva: o caminho normal do webhook, que não pode mudar.
  a := public.create_booking_atomic(u, v_lpt, now() + interval '20 days', now() + interval '22 days');
  v_b_viva := (a ->> 'booking_id')::uuid;
  insert into public.payment (booking_id, provider, amount, status, provider_charge_id)
    values (v_b_viva, 'pagarme', 21.90, 'paid', 'ch_viva')
    returning id into v_p_viva;

  perform set_config('test.b_passada', v_b_passada::text, false);
  perform set_config('test.b_futura',  v_b_futura::text,  false);
  perform set_config('test.b_viva',    v_b_viva::text,    false);
  perform set_config('test.p_passada', v_p_passada::text, false);
  perform set_config('test.p_futura',  v_p_futura::text,  false);
  perform set_config('test.p_viva',    v_p_viva::text,    false);
end $$;

-- 1. Estadia terminada: estorna, não reconfirma.
select is(
  (select public.confirm_or_refund_booking(
     current_setting('test.b_passada')::uuid, current_setting('test.p_passada')::uuid) ->> 'outcome'),
  'needs_refund',
  'estadia terminada pede estorno'
);
select is(
  (select public.confirm_or_refund_booking(
     current_setting('test.b_passada')::uuid, current_setting('test.p_passada')::uuid) ->> 'charge_id'),
  'ch_passada',
  'o estorno vai com o charge id certo'
);
select is(
  (select status from public.booking where id = current_setting('test.b_passada')::uuid),
  'expired'::booking_status,
  'a reserva de estadia terminada continua expirada'
);
select isnt(
  (select refund_reason from public.payment where id = current_setting('test.p_passada')::uuid),
  null,
  'o motivo do estorno fica gravado no pagamento'
);

-- 2. Expirada com estadia ainda por vir: reconfirma (o comportamento antigo, preservado).
select is(
  (select public.confirm_or_refund_booking(
     current_setting('test.b_futura')::uuid, current_setting('test.p_futura')::uuid) ->> 'outcome'),
  'reconfirmed',
  'expirada com estadia futura ainda reconfirma'
);
select is(
  (select status from public.booking where id = current_setting('test.b_futura')::uuid),
  'confirmed'::booking_status,
  'e a reserva volta a valer'
);

-- 3. Reserva viva: caminho normal do webhook, intacto.
select is(
  (select public.confirm_or_refund_booking(
     current_setting('test.b_viva')::uuid, current_setting('test.p_viva')::uuid) ->> 'outcome'),
  'confirmed',
  'reserva pendente confirma como sempre'
);
select is(
  (select status from public.booking where id = current_setting('test.b_viva')::uuid),
  'confirmed'::booking_status,
  'e fica confirmada'
);

select * from finish();
rollback;
