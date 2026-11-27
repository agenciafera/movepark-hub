-- pgTAP: tipo de vaga na lista de reservas (migration 20261209120000).
--
-- O que trava aqui:
--   1. A lista do balcão (`operator_bookings_by_ids`) traz o tipo de vaga da reserva nos itens, e os
--      itens não levam preço, quantidade nem subtotal.
--   2. Quem tem finance:read (o Dono aqui) lê o item com o tipo de vaga pela tabela, como a lista
--      do Manager e do Operator faz (`items:booking_item(item_type, parking_type(name))`).
--   3. O cliente segue lendo os itens da própria reserva, mas não escreve mais neles: antes ele
--      trocava o tipo de vaga, o preço e o subtotal pelo PostgREST.

begin;
select plan(12);

-- ── Fixture ────────────────────────────────────────────────────────────────────────────────
insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-4000-9200-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tvl-dono@exemplo.test'),
  ('00000000-0000-4000-9200-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tvl-operacao@exemplo.test'),
  ('00000000-0000-4000-9200-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tvl-cliente@exemplo.test');

insert into public.profiles (id, role) values
  ('00000000-0000-4000-9200-000000000002', 'company_operator'),
  ('00000000-0000-4000-9200-000000000005', 'company_operator'),
  ('00000000-0000-4000-9200-000000000006', 'customer')
on conflict (id) do update set role = excluded.role;

insert into public.company (id, name, slug) values
  ('00000000-0000-4000-9200-0000000000c1', 'TVL Estacionamentos', 'tvl-estacionamentos');

insert into public.location (id, company_id, name, slug) values
  ('00000000-0000-4000-9200-0000000000a1', '00000000-0000-4000-9200-0000000000c1', 'Unidade TVL', 'tvl-unidade');

insert into public.profile_company (profile_id, company_id, role) values
  ('00000000-0000-4000-9200-000000000002', '00000000-0000-4000-9200-0000000000c1', 'owner'),
  ('00000000-0000-4000-9200-000000000005', '00000000-0000-4000-9200-0000000000c1', 'operator');

insert into public.booking (id, code, profile_id, location_id, check_in_at, check_out_at, status, customer_name) values
  ('00000000-0000-4000-9200-0000000000b1', 'MP-TVL001', '00000000-0000-4000-9200-000000000006',
   '00000000-0000-4000-9200-0000000000a1', now() + interval '1 hour', now() + interval '3 days', 'confirmed', 'Cliente TVL');

insert into public.booking_item (id, booking_id, item_type, parking_type_id, quantity, unit_price, subtotal)
select '00000000-0000-4000-9200-0000000000e1', '00000000-0000-4000-9200-0000000000b1', 'parking',
       pt.id, 2, 50, 100
  from public.parking_type pt where pt.code = 'covered';

-- ── 1. Balcão: o tipo de vaga vem nos itens, sem valor ───────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-9200-000000000005","role":"authenticated"}', true);

select is(
  jsonb_array_length(public.operator_bookings_by_ids(array['00000000-0000-4000-9200-0000000000b1']::uuid[]) -> 0 -> 'items'), 1,
  'a lista do balcão traz o item da reserva'
);
select is(
  public.operator_bookings_by_ids(array['00000000-0000-4000-9200-0000000000b1']::uuid[]) -> 0 -> 'items' -> 0 -> 'parking_type' ->> 'name',
  'Vaga Coberta',
  'o item do balcão traz o nome do tipo de vaga'
);
select is(
  (select array_agg(k order by k)
     from jsonb_object_keys(public.operator_bookings_by_ids(array['00000000-0000-4000-9200-0000000000b1']::uuid[]) -> 0 -> 'items' -> 0) k),
  array['item_type', 'parking_type'],
  'o item do balcão não leva preço, quantidade nem subtotal'
);
select is_empty(
  $$ select 1 from public.booking_item where booking_id = '00000000-0000-4000-9200-0000000000b1' $$,
  'o balcão segue sem ler booking_item pela tabela'
);

-- ── 2. Dono (finance:read): lê o tipo de vaga pela tabela ────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-9200-000000000002","role":"authenticated"}', true);
select is(
  (select pt.name from public.booking_item i join public.parking_type pt on pt.id = i.parking_type_id
    where i.booking_id = '00000000-0000-4000-9200-0000000000b1' and i.item_type = 'parking'),
  'Vaga Coberta',
  'o Dono lê o tipo de vaga do item pela tabela'
);

-- ── 3. Cliente: lê o próprio item, não escreve ───────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-9200-000000000006","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.booking_item where booking_id = '00000000-0000-4000-9200-0000000000b1'), 1,
  'o cliente lê o item da própria reserva'
);
select throws_ok(
  $$ update public.booking_item
        set parking_type_id = (select id from public.parking_type where code = 'uncovered'), subtotal = 1
      where id = '00000000-0000-4000-9200-0000000000e1' $$,
  '42501', null,
  'o cliente não troca o tipo de vaga nem o subtotal do item da própria reserva'
);
select throws_ok(
  $$ insert into public.booking_item (booking_id, item_type, quantity, unit_price, subtotal)
     values ('00000000-0000-4000-9200-0000000000b1', 'add_on', 1, 0, 0) $$,
  '42501', null,
  'o cliente não inclui item na própria reserva'
);
select throws_ok(
  $$ delete from public.booking_item where id = '00000000-0000-4000-9200-0000000000e1' $$,
  '42501', null,
  'o cliente não apaga item da própria reserva'
);

reset role;
select is(
  (select pt.code || ':' || i.subtotal::text from public.booking_item i join public.parking_type pt on pt.id = i.parking_type_id
    where i.id = '00000000-0000-4000-9200-0000000000e1'),
  'covered:100.00',
  'depois das tentativas, o item segue com o tipo de vaga e o subtotal originais'
);
select ok(
  not has_any_column_privilege('authenticated', 'public.booking_item', 'INSERT, UPDATE')
    and not has_table_privilege('authenticated', 'public.booking_item', 'DELETE')
    and not has_any_column_privilege('anon', 'public.booking_item', 'INSERT, UPDATE')
    and not has_table_privilege('anon', 'public.booking_item', 'DELETE'),
  'anon e authenticated não têm escrita em booking_item, nem por coluna'
);
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'booking_item' and cmd <> 'SELECT'),
  0,
  'booking_item só tem policy de leitura'
);

select * from finish();
rollback;
