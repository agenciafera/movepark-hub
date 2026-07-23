-- pgTAP: C-18 do roteiro do consumidor (docs/testes/roteiro-consumidor-reserva.md),
-- REESCRITO. Decisão de 23/07 (ClickUp 86ajnxf04): tarifa é fonte única global.
-- Não existe mais preço por unidade. O contrato que este arquivo trava agora:
--   1. location_fare e operator_set_unit_fare não existem mais;
--   2. get_unit_fares devolve o preço global e ignora a unidade;
--   3. criação e upgrade cobram o preço global (a mesma fonte de quem mostra).
--
-- Antes, o arquivo travava o oposto (get_unit_fares aplicava location_fare.price
-- _cents_override). A inversão acompanha a remoção do mecanismo por unidade.

begin;
select plan(7);

select hasnt_table('public', 'location_fare', 'location_fare foi removida (fonte única global)');
select hasnt_function('public', 'operator_set_unit_fare', 'operator_set_unit_fare foi removida');

-- fixture: customer + um tipo de vaga com capacidade
do $$
declare u uuid := gen_random_uuid(); v_lpt uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (u,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','fare-global@ex.com',now(),now());
  insert into public.profiles(id, role) values (u,'customer') on conflict (id) do nothing;
  select id into v_lpt from public.location_parking_type where capacity > 0 and is_active limit 1;
  update public.location_parking_type
     set capacity = 10, has_minimum_stay = false, has_minimum_date = false
   where id = v_lpt;
  update public.pricing_rule set advance_booking_minutes = null where location_parking_type_id = v_lpt;
  perform set_config('test.u', u::text, false);
  perform set_config('test.lpt', v_lpt::text, false);
  perform set_config('test.sflex', (select price_cents from public.fare where tier='superflex')::text, false);
end $$;

create or replace function pg_temp.cents(p_bk uuid) returns int language sql as $$
  select fare_price_cents from public.booking where id = p_bk;
$$;
create or replace function pg_temp.total(p_bk uuid) returns numeric language sql as $$
  select total_amount from public.booking where id = p_bk;
$$;

-- 1. get_unit_fares devolve o preço global, e não muda com a unidade.
select is(
  (select price_cents from public.get_unit_fares(current_setting('test.lpt')::uuid) where tier='superflex'),
  current_setting('test.sflex')::int,
  'get_unit_fares(unidade) devolve o preço global da Superflex');
select is(
  (select price_cents from public.get_unit_fares(null) where tier='superflex'),
  (select price_cents from public.get_unit_fares(current_setting('test.lpt')::uuid) where tier='superflex'),
  'get_unit_fares ignora a unidade: global igual a por-unidade');

-- 2. Criação usa o preço global no snapshot.
do $$
declare r jsonb;
begin
  r := public.create_booking_atomic(
    current_setting('test.u')::uuid, current_setting('test.lpt')::uuid,
    now() + interval '30 days', now() + interval '32 days', p_fare_tier => 'superflex');
  perform set_config('test.bk', (r ->> 'booking_id'), false);
end $$;
select is(pg_temp.cents(current_setting('test.bk')::uuid), current_setting('test.sflex')::int,
  'reserva nasce com o preço global da Superflex');

-- 3. Upgrade (Básica → Superflex) cobra o delta pelo preço global.
do $$
declare r jsonb; v_bk uuid; v0 numeric;
begin
  r := public.create_booking_atomic(
    current_setting('test.u')::uuid, current_setting('test.lpt')::uuid,
    now() + interval '34 days', now() + interval '36 days');            -- basica
  v_bk := (r ->> 'booking_id')::uuid;
  update public.booking set status = 'confirmed' where id = v_bk;
  v0 := pg_temp.total(v_bk);
  perform public.apply_fare_upgrade(v_bk, 'superflex');
  perform set_config('test.bk2', v_bk::text, false);
  perform set_config('test.delta', (pg_temp.total(v_bk) - v0)::text, false);
end $$;
select is(pg_temp.cents(current_setting('test.bk2')::uuid), current_setting('test.sflex')::int,
  'snapshot pós-upgrade = preço global da Superflex');
select is(current_setting('test.delta')::numeric, current_setting('test.sflex')::int / 100.0,
  'delta do upgrade = preço global (Básica 0 vai a Superflex)');

select * from finish();
rollback;
