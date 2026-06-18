-- pgTAP: E2.2.1 — snapshot de preço. create_booking_atomic persiste booking.price_breakdown
-- (imutável) com o total final, base_price, estratégia, dias e line_items. Transação com rollback.

begin;
select plan(8);

select has_column('public', 'booking', 'price_breakdown', 'booking.price_breakdown existe');

-- ── fixture: customer + um tipo de vaga do seed com pricing ─────────────────
do $$
declare u uuid := gen_random_uuid(); v_lpt uuid; r jsonb;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (u,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','snap@ex.com',now(),now());
  insert into public.profiles(id, role) values (u,'customer') on conflict (id) do nothing;
  select id into v_lpt from public.location_parking_type where capacity > 0 and is_active limit 1;
  update public.location_parking_type set capacity = 5 where id = v_lpt;
  r := public.create_booking_atomic(u, v_lpt, '2026-12-10T12:00:00Z', '2026-12-12T12:00:00Z');
  perform set_config('test.bk', r::text, false);
end $$;

-- a resposta já traz o breakdown
select ok(
  (current_setting('test.bk')::jsonb -> 'price_breakdown') is not null,
  'resposta de create_booking_atomic inclui price_breakdown');

-- e ele foi PERSISTIDO no booking
select isnt(
  (select price_breakdown from public.booking
   where id = (current_setting('test.bk')::jsonb ->> 'booking_id')::uuid),
  null, 'booking.price_breakdown persistido (não nulo)');

-- snapshot consistente: total do breakdown == total_amount cobrado
select is(
  (select (price_breakdown ->> 'total')::numeric from public.booking
   where id = (current_setting('test.bk')::jsonb ->> 'booking_id')::uuid),
  (select total_amount from public.booking
   where id = (current_setting('test.bk')::jsonb ->> 'booking_id')::uuid),
  'price_breakdown.total == booking.total_amount (snapshot fiel)');

-- base_price presente e >= total (descontos só reduzem)
select cmp_ok(
  (select (price_breakdown ->> 'base_price')::numeric from public.booking
   where id = (current_setting('test.bk')::jsonb ->> 'booking_id')::uuid),
  '>=',
  (select (price_breakdown ->> 'total')::numeric from public.booking
   where id = (current_setting('test.bk')::jsonb ->> 'booking_id')::uuid),
  'base_price >= total');

-- dias snapshotados (10→12 = 2)
select is(
  (select (price_breakdown ->> 'days')::int from public.booking
   where id = (current_setting('test.bk')::jsonb ->> 'booking_id')::uuid),
  2, 'price_breakdown.days = 2');

-- guarda a estratégia de preço
select ok(
  (select price_breakdown ? 'strategy' from public.booking
   where id = (current_setting('test.bk')::jsonb ->> 'booking_id')::uuid),
  'price_breakdown tem a estratégia de preço');

-- line_items é um array com a vaga
select cmp_ok(
  (select jsonb_array_length(price_breakdown -> 'line_items') from public.booking
   where id = (current_setting('test.bk')::jsonb ->> 'booking_id')::uuid),
  '>=', 1, 'price_breakdown.line_items tem ao menos a vaga');

select * from finish();
rollback;
