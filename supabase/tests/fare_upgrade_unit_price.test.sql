-- pgTAP: C-18 do roteiro do consumidor (docs/testes/roteiro-consumidor-reserva.md).
-- "Upgrade de Tarifa respeita o preço da unidade" · CORRIGIDO em 20260828000000 + 20260829000000.
-- Tarefa: https://app.clickup.com/t/86ajmwhdk
--
-- O contrato que este arquivo trava: quem MOSTRA e quem COBRA leem a mesma fonte. O preço da tarifa
-- sai de get_unit_fares(unidade), que aplica location_fare.price_cents_override, tanto na criação da
-- reserva quanto no upgrade.
--
-- Histórico do defeito, que é o motivo de o teste existir:
--   1. get_unit_fares sempre aplicou o override (20260721000000_location_fare.sql).
--   2. _create_booking_core aplicava (coalesce, 20260721000000:124) até 20260811000000 redefinir a
--      função a partir da versão de 20260717000000 e derrubar o overlay em silêncio. O comentário de
--      lá dizia "corpo idêntico", mas a versão copiada era anterior ao overlay.
--   3. apply_fare_upgrade nunca aplicou: lia o catálogo global.
-- Por isso 20260828000000 troca só as duas linhas do corpo vigente em vez de recriar a função
-- inteira. Se uma migration futura recriar _create_booking_core do zero, este arquivo fica vermelho.

begin;
select plan(9);

-- ── fixture: customer + um tipo de vaga com capacidade ───────────────────────
do $$
declare u uuid := gen_random_uuid(); v_lpt uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (u,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','fare-unit@ex.com',now(),now());
  insert into public.profiles(id, role) values (u,'customer') on conflict (id) do nothing;
  select id into v_lpt from public.location_parking_type where capacity > 0 and is_active limit 1;
  update public.location_parking_type
     set capacity = 10, has_minimum_stay = false, has_minimum_date = false
   where id = v_lpt;
  update public.pricing_rule set advance_booking_minutes = null where location_parking_type_id = v_lpt;
  perform set_config('test.u', u::text, false);
  perform set_config('test.lpt', v_lpt::text, false);
end $$;

-- helpers de leitura (deixam as asserções curtas)
create or replace function pg_temp.cents(p_bk uuid) returns int language sql as $$
  select fare_price_cents from public.booking where id = p_bk;
$$;
create or replace function pg_temp.tier(p_bk uuid) returns text language sql as $$
  select fare_tier::text from public.booking where id = p_bk;
$$;
create or replace function pg_temp.total(p_bk uuid) returns numeric language sql as $$
  select total_amount from public.booking where id = p_bk;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Contrato de vitrine: o resolver aplica o override (é o preço que o cliente vê)
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.location_fare(location_parking_type_id, tier, enabled, price_cents_override)
values (current_setting('test.lpt')::uuid, 'superflex', true, 1500);

select is(
  (select price_cents from public.get_unit_fares(current_setting('test.lpt')::uuid) where tier = 'superflex'),
  1500, 'get_unit_fares mostra o preço da unidade (Superflex a R$ 15,00)');
select is(
  (select price_cents from public.fare where tier = 'superflex'),
  2490, 'catálogo global segue em R$ 24,90');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Criação da reserva usa o preço da unidade, não o global
--    Override MAIS BARATO que o global: sem o fix, o cliente pagaria a mais.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare r jsonb;
begin
  r := public.create_booking_atomic(
    current_setting('test.u')::uuid, current_setting('test.lpt')::uuid,
    now() + interval '30 days', now() + interval '32 days', p_fare_tier => 'superflex');
  perform set_config('test.bk_nasce', (r ->> 'booking_id'), false);
end $$;

select is(pg_temp.cents(current_setting('test.bk_nasce')::uuid), 1500,
  'o snapshot da reserva usa o preço da unidade (1500), não o global');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Upgrade com override MAIS BARATO que o global
--    Reserva Básica (0) numa unidade cuja Superflex custa R$ 15,00 → delta R$ 15,00.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare r jsonb; v_bk uuid; v_total0 numeric;
begin
  r := public.create_booking_atomic(
    current_setting('test.u')::uuid, current_setting('test.lpt')::uuid,
    now() + interval '34 days', now() + interval '36 days');            -- basica
  v_bk := (r ->> 'booking_id')::uuid;
  update public.booking set status = 'confirmed' where id = v_bk;
  v_total0 := pg_temp.total(v_bk);
  perform public.apply_fare_upgrade(v_bk, 'superflex');
  perform set_config('test.bk_barato', v_bk::text, false);
  perform set_config('test.delta_barato', (pg_temp.total(v_bk) - v_total0)::text, false);
end $$;

select is(current_setting('test.delta_barato')::numeric, 15.00,
  'delta do upgrade = preço da unidade (R$ 15,00)');
select is(pg_temp.cents(current_setting('test.bk_barato')::uuid), 1500,
  'snapshot pós-upgrade = 1500');

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Upgrade com override MAIS CARO que o global
--    O erro antigo mudava de sinal: aqui a casa é que deixava dinheiro na mesa.
-- ─────────────────────────────────────────────────────────────────────────────
update public.location_fare set price_cents_override = 4000
 where location_parking_type_id = current_setting('test.lpt')::uuid and tier = 'superflex';

do $$
declare r jsonb; v_bk uuid; v_total0 numeric;
begin
  r := public.create_booking_atomic(
    current_setting('test.u')::uuid, current_setting('test.lpt')::uuid,
    now() + interval '38 days', now() + interval '40 days');            -- basica
  v_bk := (r ->> 'booking_id')::uuid;
  update public.booking set status = 'confirmed' where id = v_bk;
  v_total0 := pg_temp.total(v_bk);
  perform public.apply_fare_upgrade(v_bk, 'superflex');
  perform set_config('test.bk_caro', v_bk::text, false);
  perform set_config('test.delta_caro', (pg_temp.total(v_bk) - v_total0)::text, false);
end $$;

select is(current_setting('test.delta_caro')::numeric, 40.00,
  'delta do upgrade = preço da unidade (R$ 40,00), acima do global');

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. O caso que uma correção PARCIAL quebraria
--    Flex da unidade a R$ 30,00, acima do global da Superflex (R$ 24,90). Se a criação usasse o
--    preço da unidade e o upgrade continuasse no global, o guard de "sem downgrade" compararia
--    2490 <= 3000 e viraria noop: a Edge cobra o PIX do delta e o cliente não recebe o upgrade.
--    Com as duas pontas na mesma fonte, Superflex (4000) > Flex (3000) e o upgrade vale.
--    O snapshot de 3000 agora NASCE da unidade, sem precisar ser gravado na mão.
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.location_fare(location_parking_type_id, tier, enabled, price_cents_override)
values (current_setting('test.lpt')::uuid, 'flex', true, 3000);

do $$
declare r jsonb; v_bk uuid; res jsonb;
begin
  r := public.create_booking_atomic(
    current_setting('test.u')::uuid, current_setting('test.lpt')::uuid,
    now() + interval '42 days', now() + interval '44 days', p_fare_tier => 'flex');
  v_bk := (r ->> 'booking_id')::uuid;
  update public.booking set status = 'confirmed' where id = v_bk;
  perform set_config('test.cents_extremo', pg_temp.cents(v_bk)::text, false);
  res := public.apply_fare_upgrade(v_bk, 'superflex');
  perform set_config('test.bk_extremo', v_bk::text, false);
  perform set_config('test.res_extremo', res::text, false);
end $$;

select is(current_setting('test.cents_extremo')::int, 3000,
  'a Flex nasce com o preço da unidade (3000), acima do global da Superflex');
select is(current_setting('test.res_extremo')::jsonb ->> 'upgraded', 'true',
  'o upgrade é aplicado: o cliente recebe o que pagou');
select is(pg_temp.cents(current_setting('test.bk_extremo')::uuid), 4000,
  'snapshot pós-upgrade = preço da Superflex na unidade (4000)');

select * from finish();
rollback;
