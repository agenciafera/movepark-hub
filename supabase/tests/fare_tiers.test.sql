-- pgTAP: E2.8-e — Tarifas de flexibilidade (Básica/Flex/Superflex). Cobre schema, seed, RLS,
-- get_unit_fares e a criação de reserva com Tarifa (snapshot de preço/janela). Transação + rollback.

begin;
select plan(20);

-- ── schema ──────────────────────────────────────────────────────────────────
select has_type('public', 'fare_tier', 'enum fare_tier existe');
select has_table('public', 'fare', 'tabela fare existe');
select has_column('public', 'booking', 'fare_tier', 'booking.fare_tier existe');
select has_column('public', 'booking', 'fare_price_cents', 'booking.fare_price_cents existe');
select has_column('public', 'booking', 'fare_cancel_until', 'booking.fare_cancel_until existe');
select has_column('public', 'booking', 'fare_benefits', 'booking.fare_benefits existe');

-- ── seed (preços E2.8-g) ──────────────────────────────────────────────────────
select is((select price_cents from public.fare where tier='basica'), 0, 'Básica grátis');
select is((select price_cents from public.fare where tier='flex'), 1290, 'Flex R$ 12,90');
select is((select price_cents from public.fare where tier='superflex'), 2490, 'Superflex R$ 24,90');
select is((select is_popular from public.fare where tier='flex'), true, 'Flex é "Mais popular"');
select is((select cancel_window_minutes from public.fare where tier='superflex'), 1, 'Superflex cancela até 1 min');
select is((select cancel_window_minutes from public.fare where tier='basica'), 1440, 'Básica/Flex janela 24h');

-- ── get_unit_fares retorna as 3 ativas ────────────────────────────────────────
select is((select count(*)::int from public.get_unit_fares(null)), 3, 'get_unit_fares lista as 3 Tarifas ativas');

-- ── RLS: catálogo é público pra leitura; escrita só hub_admin ─────────────────
set local role anon;
select isnt_empty('select 1 from public.fare', 'anon lê o catálogo de Tarifas');
reset role;

do $$
declare uc uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (uc,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','fare-c@ex.com',now(),now());
  insert into public.profiles(id, role) values (uc,'customer') on conflict (id) do nothing;
  perform set_config('test.uc', uc::text, false);
end $$;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.uc'))::text, true);
-- RLS bloqueia a escrita silenciosamente: o UPDATE filtrado pela policy USING afeta 0 linhas
-- (não lança 42501). Verificamos que nenhuma Tarifa foi alterada.
update public.fare set price_cents = 999 where tier = 'flex';
reset role;
select is(
  (select count(*)::int from public.fare where price_cents = 999),
  0, 'customer NÃO escreve no catálogo de Tarifas (RLS bloqueia a escrita)');

-- ── criação de reserva com Tarifa (snapshot) ─────────────────────────────────
do $$
declare u uuid := gen_random_uuid(); v_lpt uuid; r_flex jsonb; r_super jsonb; r_basica jsonb;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (u,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','fare-book@ex.com',now(),now());
  insert into public.profiles(id, role) values (u,'customer') on conflict (id) do nothing;
  select id into v_lpt from public.location_parking_type where capacity > 0 and is_active limit 1;
  update public.location_parking_type set capacity = 10 where id = v_lpt;

  r_basica := public.create_booking_atomic(u, v_lpt, '2026-12-10T12:00:00Z', '2026-12-12T12:00:00Z');
  r_flex   := public.create_booking_atomic(u, v_lpt, '2026-12-10T12:00:00Z', '2026-12-12T12:00:00Z', p_fare_tier => 'flex');
  r_super  := public.create_booking_atomic(u, v_lpt, '2026-12-10T12:00:00Z', '2026-12-12T12:00:00Z', p_fare_tier => 'superflex');
  perform set_config('test.basica', r_basica::text, false);
  perform set_config('test.flex', r_flex::text, false);
  perform set_config('test.super', r_super::text, false);
end $$;

-- Básica: sem custo de Tarifa
select is(
  (select fare_price_cents from public.booking where id = (current_setting('test.basica')::jsonb ->> 'booking_id')::uuid),
  0, 'Básica não cobra Tarifa (fare_price_cents = 0)');

-- Flex: +R$12,90 no total e fare_tier persistido
select is(
  (select fare_tier::text from public.booking where id = (current_setting('test.flex')::jsonb ->> 'booking_id')::uuid),
  'flex', 'fare_tier persistido = flex');
select is(
  (select (current_setting('test.flex')::jsonb ->> 'total_amount')::numeric
          - (current_setting('test.basica')::jsonb ->> 'total_amount')::numeric),
  12.90, 'Flex soma exatamente R$ 12,90 ao total');

-- Flex: janela de cancelamento = check_in − 24h
select is(
  (select fare_cancel_until from public.booking where id = (current_setting('test.flex')::jsonb ->> 'booking_id')::uuid),
  '2026-12-09T12:00:00Z'::timestamptz, 'Flex: fare_cancel_until = check_in − 24h');

-- Superflex: janela = check_in − 1 min
select is(
  (select fare_cancel_until from public.booking where id = (current_setting('test.super')::jsonb ->> 'booking_id')::uuid),
  '2026-12-10T11:59:00Z'::timestamptz, 'Superflex: fare_cancel_until = check_in − 1 min');

select * from finish();
rollback;
