-- pgTAP: C-18 do roteiro do consumidor (docs/testes/roteiro-consumidor-reserva.md).
-- "Upgrade de Tarifa respeita o preço da unidade" · DEFEITO CONHECIDO, ainda sem correção.
-- Tarefa: https://app.clickup.com/t/86ajmwhdk
--
-- O que o teste prova, em duas camadas:
--   (a) asserções FORA de todo = comportamento de HOJE (registro do estado atual, ficam verdes);
--   (b) asserções DENTRO de todo_start/todo_end = comportamento DEVIDO (viram o aceite da correção;
--       quando o fix entrar, elas passam a passar e o bloco de todo sai daqui junto com as (a)).
--
-- Mapa do defeito:
--   1. `get_unit_fares` APLICA o override da unidade (20260721000000_location_fare.sql:36). É o preço
--      que o cliente vê no checkout.
--   2. `_create_booking_core` NÃO aplica. A versão de 20260721000000 aplicava (coalesce, linha 124),
--      mas a redefinição de 20260811000000_block_retroactive_check_in.sql:74 reintroduziu
--      `v_fare.price_cents` cru e derrubou o overlay. Conferido também no banco vivo.
--   3. `apply_fare_upgrade` também lê o catálogo global (20260720000000_fare_upgrade.sql:28).
-- Ou seja: a unidade configura um preço de Tarifa, o cliente vê esse preço, e nem a reserva nem o
-- upgrade cobram por ele.

begin;
select plan(16);

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
-- 2. Criação da reserva: o snapshot ignora o override (regressão de 20260811000000)
--    A reserva nasce direto na Superflex, com override MAIS BARATO que o global.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare r jsonb;
begin
  r := public.create_booking_atomic(
    current_setting('test.u')::uuid, current_setting('test.lpt')::uuid,
    '2026-12-10T12:00:00Z', '2026-12-12T12:00:00Z', p_fare_tier => 'superflex');
  perform set_config('test.bk_nasce', (r ->> 'booking_id'), false);
end $$;

select is(pg_temp.cents(current_setting('test.bk_nasce')::uuid), 2490,
  'HOJE: a reserva nasce com o preço GLOBAL, não com o da unidade');

select todo_start('C-18: criação e upgrade precisam usar o preço da unidade. https://app.clickup.com/t/86ajmwhdk');
select is(pg_temp.cents(current_setting('test.bk_nasce')::uuid), 1500,
  'DEVIDO: o snapshot da reserva usa o preço da unidade (1500)');
select todo_end();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. C-18 · override MAIS BARATO que o global → o delta cobrado fica ACIMA do devido
--    Reserva Básica (0) numa unidade cuja Superflex custa R$ 15,00.
--    Devido: 1500 − 0 = R$ 15,00. Cobrado: 2490 − 0 = R$ 24,90.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare r jsonb; v_bk uuid; v_total0 numeric;
begin
  r := public.create_booking_atomic(
    current_setting('test.u')::uuid, current_setting('test.lpt')::uuid,
    '2026-12-14T12:00:00Z', '2026-12-16T12:00:00Z');            -- basica
  v_bk := (r ->> 'booking_id')::uuid;
  update public.booking set status = 'confirmed' where id = v_bk;
  v_total0 := pg_temp.total(v_bk);
  perform public.apply_fare_upgrade(v_bk, 'superflex');
  perform set_config('test.bk_barato', v_bk::text, false);
  perform set_config('test.delta_barato', (pg_temp.total(v_bk) - v_total0)::text, false);
end $$;

select is(current_setting('test.delta_barato')::numeric, 24.90,
  'HOJE: override mais barato → cobra R$ 24,90 (o global), acima do devido');
select is(pg_temp.cents(current_setting('test.bk_barato')::uuid), 2490,
  'HOJE: o snapshot pós-upgrade grava o preço global');

select todo_start('C-18: o delta do upgrade precisa sair do preço da unidade. https://app.clickup.com/t/86ajmwhdk');
select is(current_setting('test.delta_barato')::numeric, 15.00,
  'DEVIDO: delta = preço da unidade (R$ 15,00)');
select is(pg_temp.cents(current_setting('test.bk_barato')::uuid), 1500,
  'DEVIDO: snapshot pós-upgrade = 1500');
select todo_end();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. C-18 · override MAIS CARO que o global → o delta cobrado fica ABAIXO do devido
--    Mesma unidade, Superflex reconfigurada para R$ 40,00. O sinal do erro inverte:
--    aqui a Movepark deixa dinheiro na mesa em vez de cobrar a mais.
-- ─────────────────────────────────────────────────────────────────────────────
update public.location_fare set price_cents_override = 4000
 where location_parking_type_id = current_setting('test.lpt')::uuid and tier = 'superflex';

do $$
declare r jsonb; v_bk uuid; v_total0 numeric;
begin
  r := public.create_booking_atomic(
    current_setting('test.u')::uuid, current_setting('test.lpt')::uuid,
    '2026-12-18T12:00:00Z', '2026-12-20T12:00:00Z');            -- basica
  v_bk := (r ->> 'booking_id')::uuid;
  update public.booking set status = 'confirmed' where id = v_bk;
  v_total0 := pg_temp.total(v_bk);
  perform public.apply_fare_upgrade(v_bk, 'superflex');
  perform set_config('test.bk_caro', v_bk::text, false);
  perform set_config('test.delta_caro', (pg_temp.total(v_bk) - v_total0)::text, false);
end $$;

select is(current_setting('test.delta_caro')::numeric, 24.90,
  'HOJE: override mais caro → cobra R$ 24,90 (o global), abaixo do devido');

select todo_start('C-18: o efeito muda de sinal conforme o override. https://app.clickup.com/t/86ajmwhdk');
select is(current_setting('test.delta_caro')::numeric, 40.00,
  'DEVIDO: delta = preço da unidade (R$ 40,00)');
select todo_end();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. C-18 · caso extremo: fare_price_cents da reserva ACIMA do preço global do tier alvo
--    O guard de "sem downgrade" (20260720000000_fare_upgrade.sql:34-36) compara o preço GLOBAL do
--    alvo com o snapshot da reserva. Se o snapshot for maior, a RPC vira noop: a Edge cobra o PIX do
--    delta e o cliente não recebe o upgrade.
--    Nota de honestidade do teste: hoje a criação ignora o override (bloco 2), então esse snapshot
--    alto não nasce sozinho. Ele é gravado aqui na mão porque é exatamente o estado que uma correção
--    PARCIAL produz (arrumar a criação e esquecer o upgrade). É o cenário a provar primeiro.
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.location_fare(location_parking_type_id, tier, enabled, price_cents_override)
values (current_setting('test.lpt')::uuid, 'flex', true, 3000);

do $$
declare r jsonb; v_bk uuid; res jsonb;
begin
  r := public.create_booking_atomic(
    current_setting('test.u')::uuid, current_setting('test.lpt')::uuid,
    '2026-12-22T12:00:00Z', '2026-12-24T12:00:00Z', p_fare_tier => 'flex');
  v_bk := (r ->> 'booking_id')::uuid;
  -- snapshot da unidade (R$ 30,00), acima do global da Superflex (R$ 24,90)
  update public.booking set status = 'confirmed', fare_price_cents = 3000 where id = v_bk;
  perform set_config('test.total_extremo', pg_temp.total(v_bk)::text, false);
  res := public.apply_fare_upgrade(v_bk, 'superflex');
  perform set_config('test.bk_extremo', v_bk::text, false);
  perform set_config('test.res_extremo', res::text, false);
end $$;

select is(current_setting('test.res_extremo')::jsonb ->> 'upgraded', 'false',
  'HOJE: snapshot acima do global do alvo → RPC devolve upgraded = false (noop)');
select is(pg_temp.tier(current_setting('test.bk_extremo')::uuid), 'flex',
  'HOJE: a reserva continua na Flex, o upgrade não acontece');
select is(pg_temp.total(current_setting('test.bk_extremo')::uuid),
  current_setting('test.total_extremo')::numeric,
  'HOJE: total intocado (a cobrança do delta acontece fora da RPC, na Edge)');

select todo_start('C-18: com o preço da unidade, Superflex (R$ 40,00) > Flex (R$ 30,00) e o upgrade deve valer. https://app.clickup.com/t/86ajmwhdk');
select is(current_setting('test.res_extremo')::jsonb ->> 'upgraded', 'true',
  'DEVIDO: o upgrade é aplicado, o cliente recebe o que pagou');
select is(pg_temp.tier(current_setting('test.bk_extremo')::uuid), 'superflex',
  'DEVIDO: a reserva vira Superflex');
select is(pg_temp.cents(current_setting('test.bk_extremo')::uuid), 4000,
  'DEVIDO: snapshot = preço da Superflex na unidade (4000)');
select todo_end();

select * from finish();
rollback;
