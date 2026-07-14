-- pgTAP: E2.8-h (Fase B, B2.1) — hold + apply + expire de troca de datas de reserva paga.
-- Rodar com: supabase test db (ver README.md).

begin;
select plan(14);

-- Reserva confirmada (paga) de 2 diárias (Dez 10-12).
do $$
declare u uuid := gen_random_uuid(); v_lpt uuid; r jsonb;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'pdc-apply@ex.com', now(), now());
  insert into public.profiles(id, role) values (u, 'customer') on conflict (id) do nothing;
  select id into v_lpt from public.location_parking_type where capacity > 0 and is_active limit 1;
  update public.location_parking_type set capacity = 10 where id = v_lpt;
  r := public.create_booking_atomic(u, v_lpt, '2026-12-10T12:00:00Z', '2026-12-12T12:00:00Z');
  update public.booking set status = 'confirmed' where id = (r ->> 'booking_id')::uuid;
  perform set_config('test.bid', r ->> 'booking_id', false);
  perform set_config('test.lpt', v_lpt::text, false);
end $$;

-- hold das NOVAS datas (Dez 15-17): segura sem mover a reserva.
select ok(
  (public.hold_paid_date_change(current_setting('test.bid')::uuid,
    '2026-12-15T12:00:00Z', '2026-12-17T12:00:00Z') ->> 'held')::boolean,
  'hold segura as novas datas');
select is(
  (select booked_count from public.location_parking_availability
     where location_parking_type_id = current_setting('test.lpt')::uuid and date = '2026-12-15'),
  1, 'nova data (Dez 15) segurada');
select is(
  (select booked_count from public.location_parking_availability
     where location_parking_type_id = current_setting('test.lpt')::uuid and date = '2026-12-10'),
  1, 'data antiga (Dez 10) ainda segura antes do apply');

-- apply: move pras novas datas, libera as antigas.
select ok(
  (public.apply_paid_date_change(current_setting('test.bid')::uuid,
    '2026-12-15T12:00:00Z', '2026-12-17T12:00:00Z', null, false) ->> 'applied')::boolean,
  'apply move a reserva');
select is(
  (select check_in_at from public.booking where id = current_setting('test.bid')::uuid),
  '2026-12-15T12:00:00Z'::timestamptz, 'datas da reserva movidas');
select is(
  (select booked_count from public.location_parking_availability
     where location_parking_type_id = current_setting('test.lpt')::uuid and date = '2026-12-10'),
  0, 'data antiga liberada no apply');
select is(
  (select count(*)::int from public.booking_modification
     where booking_id = current_setting('test.bid')::uuid and type = 'date_change'),
  1, 'histórico date_change gravado');

-- idempotência: reaplicar as mesmas datas é noop.
select is(
  public.apply_paid_date_change(current_setting('test.bid')::uuid,
    '2026-12-15T12:00:00Z', '2026-12-17T12:00:00Z', null, false) ->> 'reason',
  'already_applied', 'apply idempotente (webhook pode reentregar)');

-- expire: segura Dez 20-22, cria a cobrança pendente do delta e expira → libera o hold.
do $$
declare v_pid uuid := gen_random_uuid();
begin
  perform public.hold_paid_date_change(current_setting('test.bid')::uuid,
    '2026-12-20T12:00:00Z', '2026-12-22T12:00:00Z');
  insert into public.payment (id, booking_id, provider, amount, status, kind,
      date_change_check_in_at, date_change_check_out_at)
    values (v_pid, current_setting('test.bid')::uuid, 'pagarme', 20.00, 'pending', 'date_change',
      '2026-12-20T12:00:00Z', '2026-12-22T12:00:00Z');
  perform set_config('test.pid', v_pid::text, false);
end $$;
select is(
  public.expire_paid_date_change_hold(current_setting('test.pid')::uuid) ->> 'released',
  'true', 'expire libera o hold das novas datas');
select is(
  (select booked_count from public.location_parking_availability
     where location_parking_type_id = current_setting('test.lpt')::uuid and date = '2026-12-20'),
  0, 'capacidade de Dez 20 liberada após expirar');

-- SOBREPOSIÇÃO: estender uma reserva NÃO conta a data que ela já ocupa contra si mesma.
do $$
declare u uuid := gen_random_uuid(); v_lpt uuid; r jsonb;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'pdc-overlap@ex.com', now(), now());
  insert into public.profiles(id, role) values (u, 'customer') on conflict (id) do nothing;
  select id into v_lpt from public.location_parking_type where capacity > 0 and is_active limit 1;
  -- capacidade 1: força o cenário "lotado na data sobreposta" que quebrava antes.
  update public.location_parking_type set capacity = 1 where id = v_lpt;
  r := public.create_booking_atomic(u, v_lpt, '2027-03-10T12:00:00Z', '2027-03-12T12:00:00Z');
  update public.booking set status = 'confirmed' where id = (r ->> 'booking_id')::uuid;
  perform set_config('test.obid', r ->> 'booking_id', false);
  perform set_config('test.olpt', v_lpt::text, false);
end $$;

-- Estende Mar 10-12 (ocupa 10,11) para Mar 10-14 (novas: 12,13; sobreposição 10,11). Capacidade 1.
select ok(
  (public.hold_paid_date_change(current_setting('test.obid')::uuid,
    '2027-03-10T12:00:00Z', '2027-03-14T12:00:00Z') ->> 'held')::boolean,
  'hold com sobreposição não falha em capacidade 1');
select is(
  (select booked_count from public.location_parking_availability
     where location_parking_type_id = current_setting('test.olpt')::uuid and date = '2027-03-11'),
  1, 'data sobreposta (Mar 11) segue com 1 (não conta 2x)');
select is(
  (select booked_count from public.location_parking_availability
     where location_parking_type_id = current_setting('test.olpt')::uuid and date = '2027-03-13'),
  1, 'data nova (Mar 13) segurada');

-- GUARDA: expirar um pagamento cujas datas-alvo == datas atuais da reserva NÃO libera capacidade
-- (a troca já foi aplicada; evita liberar vaga de reserva ativa).
do $$
declare v_pid uuid := gen_random_uuid();
begin
  insert into public.payment (id, booking_id, provider, amount, status, kind,
      date_change_check_in_at, date_change_check_out_at)
    values (v_pid, current_setting('test.bid')::uuid, 'pagarme', 30.00, 'pending', 'date_change',
      (select check_in_at from public.booking where id = current_setting('test.bid')::uuid),
      (select check_out_at from public.booking where id = current_setting('test.bid')::uuid));
  perform set_config('test.pid2', v_pid::text, false);
end $$;
select is(
  public.expire_paid_date_change_hold(current_setting('test.pid2')::uuid) ->> 'reason',
  'already_applied', 'expire não libera se a troca já foi aplicada (guarda)');

select * from finish();
rollback;
