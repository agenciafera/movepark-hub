-- pgTAP: E2.8-h (Fase B, B1) — cotação read-only de troca de datas (reprice_booking_dates) + schema.
-- Rodar com: supabase test db (ver README.md).

begin;
select plan(7);

select has_column('public', 'payment', 'date_change_check_in_at', 'payment.date_change_check_in_at existe');
select has_column('public', 'payment', 'date_change_check_out_at', 'payment.date_change_check_out_at existe');
select has_function('public', 'reprice_booking_dates', 'reprice_booking_dates existe');

-- Reserva de 2 diárias pra cotar.
do $$
declare u uuid := gen_random_uuid(); v_lpt uuid; r jsonb;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'reprice@ex.com', now(), now());
  insert into public.profiles(id, role) values (u, 'customer') on conflict (id) do nothing;
  select id into v_lpt from public.location_parking_type where capacity > 0 and is_active limit 1;
  update public.location_parking_type set capacity = 10 where id = v_lpt;
  r := public.create_booking_atomic(u, v_lpt, '2026-12-10T12:00:00Z', '2026-12-12T12:00:00Z');
  perform set_config('test.bid', r ->> 'booking_id', false);
  perform set_config('test.lpt', v_lpt::text, false);
end $$;

-- Mesmas datas: re-preço bate com o total atual (delta 0) e disponível.
select is(
  (public.reprice_booking_dates(current_setting('test.bid')::uuid,
    '2026-12-10T12:00:00Z', '2026-12-12T12:00:00Z') ->> 'delta_cents')::int,
  0, 'mesmas datas: delta 0');
select is(
  (public.reprice_booking_dates(current_setting('test.bid')::uuid,
    '2026-12-10T12:00:00Z', '2026-12-12T12:00:00Z') ->> 'available')::boolean,
  true, 'mesmas datas: disponível');

-- Dobrar as diárias (2 -> 4) cobra mais: delta > 0.
select ok(
  (public.reprice_booking_dates(current_setting('test.bid')::uuid,
    '2026-12-10T12:00:00Z', '2026-12-14T12:00:00Z') ->> 'delta_cents')::int > 0,
  '4 diárias: delta > 0');

-- Data NOVA bloqueada pelo estacionamento -> indisponível. (Bloquear uma data que a reserva já
-- ocupa não a torna indisponível: a vaga já é dela; o bloqueio vale só pra datas novas.)
insert into public.location_parking_availability (location_parking_type_id, date, booked_count, blocked)
  values (current_setting('test.lpt')::uuid, '2026-12-13', 0, true)
  on conflict (location_parking_type_id, date) do update set blocked = true;
select is(
  (public.reprice_booking_dates(current_setting('test.bid')::uuid,
    '2026-12-10T12:00:00Z', '2026-12-14T12:00:00Z') ->> 'available')::boolean,
  false, 'data nova bloqueada: indisponível');

select * from finish();
rollback;
