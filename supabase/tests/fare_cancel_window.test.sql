-- pgTAP: C-19, C-20 e C-21 do roteiro do consumidor (docs/testes/roteiro-consumidor-reserva.md),
-- mais um complemento do C-13. Janela de cancelamento por Tarifa, ponta a ponta no banco.
--
-- A armadilha central do roteiro é que `booking.fare_cancel_until` é SNAPSHOT, não cálculo: nasce na
-- criação da reserva (20260717000000_fare_tiers.sql:162-163) e só muda na troca de datas e no upgrade
-- de Tarifa (20260720000000_fare_upgrade.sql:38-46). Quem mexer em `check_in_at` sem mexer no snapshot
-- não simula nada: o gate continua lendo o valor antigo. Por isso, quando este teste precisa de uma
-- reserva com check-in perto, ele cria a reserva JÁ com esse check-in, que é a forma preferida do
-- roteiro. O único caso em que o snapshot é reescrito à mão é o do upgrade, e lá os dois campos andam
-- juntos, de propósito.
--
-- O gate de horário em si mora na Edge `cancel-booking` (logic.ts). O que o banco entrega é o insumo
-- do gate, `fare_cancel_until`, e é isso que este teste trava.
--
-- Regra do seed (20260717000000_fare_tiers.sql:46-70): basica e flex com cancel_window_minutes 1440,
-- superflex com 1.

begin;
select plan(20);

-- ── fixture: customer + tipo de vaga com capacidade e sem travas de estadia ──
do $$
declare u uuid := gen_random_uuid(); v_lpt uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (u,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','cancel-win@ex.com',now(),now());
  insert into public.profiles(id, role) values (u,'customer') on conflict (id) do nothing;
  select id into v_lpt from public.location_parking_type where capacity > 0 and is_active limit 1;
  update public.location_parking_type
     set capacity = 10, has_minimum_stay = false, has_minimum_date = false
   where id = v_lpt;
  -- antecedência mínima fora do caminho: aqui se reserva de propósito para daqui a poucas horas
  update public.pricing_rule set advance_booking_minutes = null where location_parking_type_id = v_lpt;
  perform set_config('test.u', u::text, false);
  perform set_config('test.lpt', v_lpt::text, false);
end $$;

-- Espelha o gate da Edge: dá para cancelar enquanto `fare_cancel_until` está no futuro.
create or replace function pg_temp.dentro_da_janela(p_bk uuid) returns boolean language sql as $$
  select fare_cancel_until > now() from public.booking where id = p_bk;
$$;
create or replace function pg_temp.janela(p_bk uuid) returns timestamptz language sql as $$
  select fare_cancel_until from public.booking where id = p_bk;
$$;
create or replace function pg_temp.reserva(p_tier public.fare_tier, p_in timestamptz, p_out timestamptz)
returns uuid language plpgsql as $$
declare r jsonb;
begin
  r := public.create_booking_atomic(
    current_setting('test.u')::uuid, current_setting('test.lpt')::uuid, p_in, p_out,
    p_fare_tier => p_tier);
  update public.booking set status = 'confirmed' where id = (r ->> 'booking_id')::uuid;
  return (r ->> 'booking_id')::uuid;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. O snapshot é calculado certo na criação, para as três Tarifas
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('test.b_basica',
  pg_temp.reserva('basica', '2026-12-10T12:00:00Z', '2026-12-12T12:00:00Z')::text, false);
select set_config('test.b_flex',
  pg_temp.reserva('flex', '2026-12-10T12:00:00Z', '2026-12-12T12:00:00Z')::text, false);
select set_config('test.b_super',
  pg_temp.reserva('superflex', '2026-12-10T12:00:00Z', '2026-12-12T12:00:00Z')::text, false);

select is(pg_temp.janela(current_setting('test.b_basica')::uuid), '2026-12-09T12:00:00Z'::timestamptz,
  'Básica: fare_cancel_until = check_in menos 24h');
select is(pg_temp.janela(current_setting('test.b_flex')::uuid), '2026-12-09T12:00:00Z'::timestamptz,
  'Flex: fare_cancel_until = check_in menos 24h');
select is(pg_temp.janela(current_setting('test.b_flex')::uuid),
  pg_temp.janela(current_setting('test.b_basica')::uuid),
  'Básica e Flex têm a MESMA janela (a Flex se diferencia por data e placa, não por cancelamento)');
select is(pg_temp.janela(current_setting('test.b_super')::uuid), '2026-12-10T11:59:00Z'::timestamptz,
  'Superflex: fare_cancel_until = check_in menos 1 minuto');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. C-19 · dentro da janela: Básica com check-in daqui a 48h
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('test.b_c19',
  pg_temp.reserva('basica', now() + interval '48 hours', now() + interval '72 hours')::text, false);

select ok(pg_temp.dentro_da_janela(current_setting('test.b_c19')::uuid),
  'C-19: Básica com check-in em 48h está DENTRO da janela (cancela com estorno integral)');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. C-20 · fora da janela: Básica com check-in daqui a 3h
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('test.b_c20',
  pg_temp.reserva('basica', now() + interval '3 hours', now() + interval '27 hours')::text, false);

select ok(not pg_temp.dentro_da_janela(current_setting('test.b_c20')::uuid),
  'C-20: Básica com check-in em 3h está FORA da janela (a Edge devolve 403 cancel_window_closed)');

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. C-21 · Superflex nascida Superflex: check-in daqui a 30 minutos, ainda dentro
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('test.b_c21',
  pg_temp.reserva('superflex', now() + interval '30 minutes', now() + interval '25 hours')::text, false);

select ok(pg_temp.dentro_da_janela(current_setting('test.b_c21')::uuid),
  'C-21: Superflex com check-in em 30min segue DENTRO da janela (falta mais de 1 minuto)');

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. C-21 pelo outro caminho · a Superflex chegou por UPGRADE
--    É aqui que um recálculo esquecido apareceria: a reserva nasce Básica e, com o mesmo check-in,
--    está fora da janela; depois do upgrade a janela encurta e ela volta a ser cancelável.
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('test.b_up',
  pg_temp.reserva('basica', now() + interval '30 minutes', now() + interval '25 hours')::text, false);

select ok(not pg_temp.dentro_da_janela(current_setting('test.b_up')::uuid),
  'upgrade, antes: Básica com check-in em 30min está fora da janela');

do $$
begin
  perform public.apply_fare_upgrade(current_setting('test.b_up')::uuid, 'superflex');
end $$;

select is(
  pg_temp.janela(current_setting('test.b_up')::uuid),
  (select check_in_at - interval '1 minute' from public.booking where id = current_setting('test.b_up')::uuid),
  'upgrade RECALCULA fare_cancel_until para check_in menos 1 minuto');
select ok(pg_temp.dentro_da_janela(current_setting('test.b_up')::uuid),
  'upgrade, depois: a mesma reserva passa a estar DENTRO da janela');
select is(
  (select fare_tier::text from public.booking where id = current_setting('test.b_up')::uuid),
  'superflex', 'upgrade: fare_tier persistido como superflex');

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. O gate de horário NÃO mora no banco
--    Registro de onde a barreira vive: a RPC de cancelamento cancela a reserva do C-20 mesmo com a
--    janela fechada. Quem proíbe é a Edge `cancel-booking`. Trocar a Edge por uma chamada direta à
--    RPC contorna a regra, então qualquer caminho novo de cancelamento precisa refazer o gate.
-- ─────────────────────────────────────────────────────────────────────────────
select is(
  public.cancel_booking_with_release(current_setting('test.b_c20')::uuid, 'teste fora da janela'),
  'cancelled'::public.booking_status,
  'a RPC não valida janela: o gate do C-20 é exclusivo da Edge cancel-booking');

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. C-19 · cancel_booking_with_release é idempotente e libera capacidade UMA vez
--    Duas reservas nas mesmas datas; cancelar a primeira duas vezes não pode devolver a vaga da outra.
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('test.b_x',
  pg_temp.reserva('basica', '2026-11-10T12:00:00Z', '2026-11-12T12:00:00Z')::text, false);
select set_config('test.b_y',
  pg_temp.reserva('basica', '2026-11-10T12:00:00Z', '2026-11-12T12:00:00Z')::text, false);

select is(
  (select booked_count from public.location_parking_availability
    where location_parking_type_id = current_setting('test.lpt')::uuid and date = '2026-11-10'),
  2, 'duas reservas nas mesmas datas seguram 2 vagas');

select is(
  public.cancel_booking_with_release(current_setting('test.b_x')::uuid, 'C-19'),
  'cancelled'::public.booking_status, 'primeira chamada cancela e retorna cancelled');
select is(
  (select booked_count from public.location_parking_availability
    where location_parking_type_id = current_setting('test.lpt')::uuid and date = '2026-11-10'),
  1, 'a capacidade da reserva cancelada volta');

select is(
  public.cancel_booking_with_release(current_setting('test.b_x')::uuid, 'de novo'),
  'cancelled'::public.booking_status, 'cancelar reserva já cancelada é noop, não erro');
select is(
  (select booked_count from public.location_parking_availability
    where location_parking_type_id = current_setting('test.lpt')::uuid and date = '2026-11-10'),
  1, 'REGRESSÃO: a capacidade é liberada UMA vez (a vaga da outra reserva é preservada)');

-- status terminal: não cancela, levanta exceção
update public.booking set status = 'completed' where id = current_setting('test.b_y')::uuid;
select throws_ok(
  format($$ select public.cancel_booking_with_release(%L::uuid, 'terminal') $$, current_setting('test.b_y')),
  'P0001', null, 'status terminal (completed) levanta exceção em vez de cancelar');

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. C-13 (complemento) · a expiração do hold não encosta em reserva confirmada
--    O grosso do C-13 já está em booking_hold.test.sql (cancela PIX ocioso, respeita o grace, não
--    cancela pagamento comprometido). O que faltava era a outra ponta: uma reserva JÁ confirmada com
--    `expires_at` vencido continua confirmada e mantém a vaga.
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('test.b_conf',
  pg_temp.reserva('basica', '2026-11-20T12:00:00Z', '2026-11-22T12:00:00Z')::text, false);

do $$
begin
  update public.booking set expires_at = now() - interval '2 hours'
   where id = current_setting('test.b_conf')::uuid;
  perform public.cron_expire_pending_bookings();
end $$;

select is(
  (select status::text from public.booking where id = current_setting('test.b_conf')::uuid),
  'confirmed', 'C-13: reserva confirmada com expires_at vencido NÃO é cancelada pelo cron');
select is(
  (select booked_count from public.location_parking_availability
    where location_parking_type_id = current_setting('test.lpt')::uuid and date = '2026-11-20'),
  1, 'C-13: a vaga da reserva confirmada continua segurada');

select * from finish();
rollback;
