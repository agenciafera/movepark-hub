-- pgTAP: estender a saída com o carro no pátio (migration 20261208120000).
--
-- O balcão cobra pelo Hub os dias a mais de quem já entrou. O que trava aqui:
--   1. A cotação em modo extensão aceita entrada no passado (ela não muda) e cobra a diferença pela
--      tabela da compra; fora desse modo, a mesma entrada é recusada.
--   2. Piso zero: estadia maior que custa menos não devolve, e o valor da vaga fica como estava.
--   3. Recusa nova saída antes da reservada, reserva com saída registrada e entrada diferente.
--   4. A reserva da vaga segura só os dias acrescentados e a liberação devolve os mesmos dias.
--   5. A gravação muda só a saída e não tira a reserva de concluída.
--   6. Só o service_role chama as funções.

begin;
select plan(16);

-- Reserva criada pelo caminho real numa unidade que vende pelo Hub, depois levada ao passado:
-- entrou em 20/11 12:00, saída prevista 22/11 12:00, concluída pelo sistema sem saída registrada.
do $$
declare u uuid := gen_random_uuid(); v_lpt uuid; r jsonb;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'extensao-no-patio@ex.com', now(), now());
  insert into public.profiles(id, role) values (u, 'customer') on conflict (id) do nothing;
  select lpt.id into v_lpt
  from public.location_parking_type lpt join public.location l on l.id = lpt.location_id
  where lpt.capacity > 0 and lpt.is_active and l.deleted_at is null
  order by (l.checkout_mode::text = 'hub') desc, (l.is_listed is true) desc, lpt.created_at limit 1;
  -- Capacidade alta: o teste não pode depender da ocupação real da unidade nesses dias.
  update public.location_parking_type set capacity = 100000, has_minimum_stay = false where id = v_lpt;
  update public.location set tolerance_minutes = 60
    where id = (select location_id from public.location_parking_type where id = v_lpt);
  r := public.create_booking_atomic(u, v_lpt, '2027-02-10T12:00:00Z', '2027-02-15T12:00:00Z');
  perform set_config('test.bid', r ->> 'booking_id', false);
  perform set_config('test.lpt', v_lpt::text, false);
end $$;

-- Tabela da compra controlada: 2 = 100, 3 = 140, 4 = 160, 5 = 150 (pacote). Vaga 100, sem tarifa.
update public.booking
   set check_in_at = '2026-11-20T12:00:00Z', check_out_at = '2026-11-22T12:00:00Z',
       status = 'completed', checked_out_at = null,
       price_by_days = jsonb_build_object('max_days', 5, 'prices',
         jsonb_build_object('1', null, '2', 100, '3', 140, '4', 160, '5', 150)),
       total_amount = 100, fare_price_cents = 0,
       price_breakdown = coalesce(price_breakdown, '{}'::jsonb) || '{"days": 2, "subtotal": 100}'::jsonb
 where id = current_setting('test.bid')::uuid;
update public.booking_item set unit_price = 100, subtotal = 100
 where booking_id = current_setting('test.bid')::uuid and item_type = 'parking';
delete from public.booking_item where booking_id = current_setting('test.bid')::uuid and item_type = 'add_on';
delete from public.booking_coupon where booking_id = current_setting('test.bid')::uuid;

-- ── 1. Cotação ────────────────────────────────────────────────────────────────────────────
select is(
  public.reprice_booking_dates(current_setting('test.bid')::uuid, '2026-11-20T12:00:00Z', '2026-11-24T12:00:00Z') ->> 'reason',
  'A data e o horário de entrada não podem estar no passado.',
  'fora do modo extensão, a entrada no passado segue recusada');
select is(
  (public.reprice_booking_dates(current_setting('test.bid')::uuid, '2026-11-20T12:00:00Z', '2026-11-24T12:00:00Z', true) ->> 'available')::boolean,
  true, 'em modo extensão, a mesma saída nova é cotada');
select is(
  (public.reprice_booking_dates(current_setting('test.bid')::uuid, '2026-11-20T12:00:00Z', '2026-11-24T12:00:00Z', true) ->> 'delta_cents')::int,
  6000, '2 para 4 diárias: 160 - 100 pela tabela da compra');
select is(
  public.reprice_booking_dates(current_setting('test.bid')::uuid, '2026-11-20T12:00:00Z', '2026-11-24T12:00:00Z', true) ->> 'price_source',
  'compra', 'usa a tabela guardada na compra');
select is(
  (public.reprice_booking_dates(current_setting('test.bid')::uuid, '2026-11-20T12:00:00Z', '2026-11-22T12:50:00Z', true) ->> 'delta_cents')::int,
  0, 'saída dentro da tolerância de 60 min não cobra nada');

-- ── 2. Piso zero ──────────────────────────────────────────────────────────────────────────
update public.booking set price_by_days = jsonb_set(price_by_days, '{prices,3}', '90')
 where id = current_setting('test.bid')::uuid;
select is(
  (public.reprice_booking_dates(current_setting('test.bid')::uuid, '2026-11-20T12:00:00Z', '2026-11-23T12:00:00Z', true) ->> 'delta_cents')::int,
  0, 'estadia maior que custa menos (3 = 90): não devolve nada');
select is(
  (public.reprice_booking_dates(current_setting('test.bid')::uuid, '2026-11-20T12:00:00Z', '2026-11-23T12:00:00Z', true) ->> 'subtotal_new')::numeric,
  100::numeric, 'e o valor da vaga fica como estava');
update public.booking set price_by_days = jsonb_set(price_by_days, '{prices,3}', '140')
 where id = current_setting('test.bid')::uuid;

-- ── 3. Recusas ────────────────────────────────────────────────────────────────────────────
select is(
  public.reprice_booking_dates(current_setting('test.bid')::uuid, '2026-11-20T12:00:00Z', '2026-11-21T12:00:00Z', true) ->> 'reason',
  'A nova saída precisa ser depois da saída reservada.', 'saída antes da reservada não é extensão');
select throws_ok(
  $$ select public.reprice_booking_dates(current_setting('test.bid')::uuid, '2026-11-21T12:00:00Z', '2026-11-24T12:00:00Z', true) $$,
  'P0001', 'Na extensão, a entrada não muda.', 'extensão com outra entrada é recusada');

-- ── 4. Reserva da vaga só dos dias acrescentados, e liberação ─────────────────────────────
create temp table antes as
  select date, booked_count from public.location_parking_availability
   where location_parking_type_id = current_setting('test.lpt')::uuid and date between '2026-11-20' and '2026-11-24';
select is(
  (public.hold_paid_date_change(current_setting('test.bid')::uuid, '2026-11-20T12:00:00Z', '2026-11-24T12:00:00Z', true) ->> 'held')::boolean,
  true, 'a extensão segura a vaga');
select is(
  (select array_agg(a.date order by a.date)
     from public.location_parking_availability a
     left join antes b on b.date = a.date
    where a.location_parking_type_id = current_setting('test.lpt')::uuid
      and a.date between '2026-11-20' and '2026-11-24'
      and a.booked_count > coalesce(b.booked_count, 0)),
  array['2026-11-23'::date, '2026-11-24'::date],
  'só os dias acrescentados (23 e 24) ganham ocupação');

insert into public.payment (id, booking_id, provider, method, kind, date_change_check_in_at, date_change_check_out_at, amount, status)
values ('00000000-0000-4000-9300-0000000000e1', current_setting('test.bid')::uuid, 'pagarme', 'pix', 'date_change',
        '2026-11-20T12:00:00Z', '2026-11-24T12:00:00Z', 60, 'pending');
select is(
  (public.expire_paid_date_change_hold('00000000-0000-4000-9300-0000000000e1') ->> 'released')::boolean,
  true, 'PIX vencido solta a vaga da extensão');
select is(
  (select count(*)::int
     from public.location_parking_availability a
     left join antes b on b.date = a.date
    where a.location_parking_type_id = current_setting('test.lpt')::uuid
      and a.date between '2026-11-20' and '2026-11-24'
      and a.booked_count <> coalesce(b.booked_count, 0)),
  0, 'e a ocupação volta ao que era');

-- ── 5. Gravação ───────────────────────────────────────────────────────────────────────────
select public.apply_paid_date_change(
  current_setting('test.bid')::uuid, '2026-11-20T12:00:00Z', '2026-11-24T12:00:00Z', null, true, 'staff',
  public.reprice_booking_dates(current_setting('test.bid')::uuid, '2026-11-20T12:00:00Z', '2026-11-24T12:00:00Z', true));
select is(
  (select row(check_in_at, check_out_at, status::text, total_amount)::text from public.booking where id = current_setting('test.bid')::uuid),
  row('2026-11-20T12:00:00Z'::timestamptz, '2026-11-24T12:00:00Z'::timestamptz, 'completed', 160.00::numeric)::text,
  'grava a saída nova e o total de 4 diárias, e a reserva segue concluída');

update public.booking set checked_out_at = '2026-11-24T13:00:00Z' where id = current_setting('test.bid')::uuid;
select throws_ok(
  $$ select public.hold_paid_date_change(current_setting('test.bid')::uuid, '2026-11-20T12:00:00Z', '2026-11-26T12:00:00Z', true) $$,
  'P0001', 'Esta reserva não está mais no pátio.', 'com a saída registrada, não estende mais');

-- ── 6. Permissões ─────────────────────────────────────────────────────────────────────────
select ok(
  not has_function_privilege('authenticated', 'public.reprice_booking_dates(uuid, timestamptz, timestamptz, boolean)', 'execute')
  and not has_function_privilege('anon', 'public.hold_paid_date_change(uuid, timestamptz, timestamptz, boolean)', 'execute')
  and not has_function_privilege('authenticated', 'public.hold_paid_date_change(uuid, timestamptz, timestamptz, boolean)', 'execute'),
  'cotação e reserva da vaga só pelo service_role (a Edge)');

select * from finish();
rollback;
