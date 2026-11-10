-- pgTAP: idempotência do consumidor em create_booking_atomic (achado H1 / §16-1).
-- O create_booking do consumidor (chatbot/agente) não manda idempotency_key, então duas "reserva"
-- seguidas criavam duas pending idênticas, cada uma segurando vaga real até o cron expirar.
-- Correção (ADR): a chave é DERIVADA no servidor de (profile, tipo de vaga, entrada, saída) e
-- deduplica contra a pending viva. Cobre: duplo-envio → 1 reserva (replay); datas diferentes →
-- 2 reservas; re-reserva depois que a 1ª sai de pending → nova reserva permitida.
-- Roda em transação com rollback.

begin;
-- 11 = 8 originais + 3 do caso de tarifa. O plano estava em 9 com 8 asserções (Bad plan
-- pré-existente, mesma classe do retroactive_check_in relatado em 86ajmx4yc). +4 do segundo carro, +2 do EXECUTE.
select plan(17);

-- ── fixture: customer + um tipo de vaga do seed, capacidade folgada ─────────
do $$
declare u uuid := gen_random_uuid(); v_lpt uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (u,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','idem@ex.com',now(),now());
  insert into public.profiles(id, role) values (u,'customer') on conflict (id) do nothing;
  select id into v_lpt from public.location_parking_type where capacity > 0 and is_active limit 1;
  update public.location_parking_type set capacity = 20, has_minimum_stay = false, has_minimum_date = false
   where id = v_lpt;
  perform set_config('test.u', u::text, false);
  perform set_config('test.lpt', v_lpt::text, false);
end $$;

-- ── 1) primeira reserva cria pending e carimba idempotency_key derivada ─────
do $$
declare r jsonb;
begin
  r := public.create_booking_atomic(
    current_setting('test.u')::uuid, current_setting('test.lpt')::uuid,
    '2027-05-01T12:00:00Z', '2027-05-03T12:00:00Z');
  perform set_config('test.bk1', r ->> 'booking_id', false);
end $$;

select isnt(current_setting('test.bk1'), '', 'primeira reserva criada');
select ok(
  (select idempotency_key is not null from public.booking where id = current_setting('test.bk1')::uuid),
  'idempotency_key derivada carimbada na 1ª reserva');
select is(
  (select status::text from public.booking where id = current_setting('test.bk1')::uuid),
  'pending', '1ª reserva nasce pending');

-- ── 2) duplo-envio idêntico → devolve a MESMA reserva (idempotent_replay) ───
do $$
declare r jsonb;
begin
  r := public.create_booking_atomic(
    current_setting('test.u')::uuid, current_setting('test.lpt')::uuid,
    '2027-05-01T12:00:00Z', '2027-05-03T12:00:00Z');
  perform set_config('test.bk2', r ->> 'booking_id', false);
  perform set_config('test.replay2', coalesce((r ->> 'idempotent_replay'), 'false'), false);
end $$;

select is(current_setting('test.bk2'), current_setting('test.bk1'),
  'duplo-envio idêntico devolve a mesma reserva');
select is(current_setting('test.replay2'), 'true',
  'a 2ª chamada é marcada como idempotent_replay');
select is(
  (select count(*)::int from public.booking
    where profile_id = current_setting('test.u')::uuid and status = 'pending' and deleted_at is null),
  1, 'só existe UMA pending após o duplo-envio');

-- ── 3) datas diferentes NÃO deduplicam → nova reserva ──────────────────────
do $$
declare r jsonb;
begin
  r := public.create_booking_atomic(
    current_setting('test.u')::uuid, current_setting('test.lpt')::uuid,
    '2027-06-10T12:00:00Z', '2027-06-12T12:00:00Z');
  perform set_config('test.bk3', r ->> 'booking_id', false);
end $$;

select isnt(current_setting('test.bk3'), current_setting('test.bk1'),
  'datas diferentes criam reserva nova (não deduplica)');

-- ── 4) 1ª saindo de pending (expira/confirma) libera re-reserva idêntica ───
-- Simula a 1ª virando cancelada (o cron faz isso ao expirar). A janela de dedup é a vida do
-- pending, então a mesma (profile+vaga+datas) pode ser reservada de novo depois.
update public.booking set status = 'cancelled' where id = current_setting('test.bk1')::uuid;

do $$
declare r jsonb;
begin
  r := public.create_booking_atomic(
    current_setting('test.u')::uuid, current_setting('test.lpt')::uuid,
    '2027-05-01T12:00:00Z', '2027-05-03T12:00:00Z');
  perform set_config('test.bk4', r ->> 'booking_id', false);
end $$;

select isnt(current_setting('test.bk4'), current_setting('test.bk1'),
  're-reserva após a 1ª sair de pending cria reserva nova');

-- ── 5) MESMAS datas com TARIFA diferente → reserva nova (86ajmycpc) ─────────
-- A chave cobre o que o cliente comprou. Sem isto, quem criava uma pending na Básica e voltava
-- para escolher Superflex recebia replay da Básica: pagava achando que tinha a janela de 1 minuto
-- e ficava com a de 24h, descobrindo só na hora de cancelar.
do $$
declare r_basica jsonb; r_super jsonb;
begin
  r_basica := public.create_booking_atomic(
    current_setting('test.u')::uuid, current_setting('test.lpt')::uuid,
    '2027-08-01T12:00:00Z', '2027-08-03T12:00:00Z');
  r_super := public.create_booking_atomic(
    current_setting('test.u')::uuid, current_setting('test.lpt')::uuid,
    '2027-08-01T12:00:00Z', '2027-08-03T12:00:00Z', p_fare_tier => 'superflex');
  perform set_config('test.tier_basica', r_basica ->> 'booking_id', false);
  perform set_config('test.tier_super', r_super ->> 'booking_id', false);
  perform set_config('test.tier_replay', coalesce(r_super ->> 'idempotent_replay', 'false'), false);
end $$;

select isnt(current_setting('test.tier_super'), current_setting('test.tier_basica'),
  'trocar a tarifa nas mesmas datas cria reserva NOVA (não deduplica)');
select is(current_setting('test.tier_replay'), 'false',
  'a reserva com tarifa diferente não é marcada como replay');
select is(
  (select fare_tier::text from public.booking where id = current_setting('test.tier_super')::uuid),
  'superflex', 'a tarifa escolhida é a que fica persistida');

-- ── 6) SEGUNDO CARRO da mesma conta, mesmas datas (09/11/2026) ──────────────
-- O site e a Mia criam a reserva sem veículo e vinculam a placa depois. Antes, a 2ª reserva (do
-- carro do parente) recebia replay da 1ª, e vincular a placa dela trocava a placa da 1ª.
do $$
declare r1 jsonb; r_dup jsonb; r2 jsonb; v_carro1 uuid;
begin
  insert into public.vehicle(profile_id, license_plate) values (current_setting('test.u')::uuid, 'AAA1A11')
    returning id into v_carro1;
  r1 := public.create_booking_atomic(
    current_setting('test.u')::uuid, current_setting('test.lpt')::uuid,
    '2027-09-01T12:00:00Z', '2027-09-03T12:00:00Z');
  -- Duplo-envio antes de qualquer placa: ainda é a mesma compra.
  r_dup := public.create_booking_atomic(
    current_setting('test.u')::uuid, current_setting('test.lpt')::uuid,
    '2027-09-01T12:00:00Z', '2027-09-03T12:00:00Z');
  -- O cliente vincula o carro 1 (o que o checkout e o set_booking_vehicle fazem).
  update public.booking set vehicle_id = v_carro1 where id = (r1 ->> 'booking_id')::uuid;
  -- Agora reserva o carro do parente, mesmas datas e mesma vaga.
  r2 := public.create_booking_atomic(
    current_setting('test.u')::uuid, current_setting('test.lpt')::uuid,
    '2027-09-01T12:00:00Z', '2027-09-03T12:00:00Z');
  perform set_config('test.car_r1', r1 ->> 'booking_id', false);
  perform set_config('test.car_dup', r_dup ->> 'booking_id', false);
  perform set_config('test.car_r2', r2 ->> 'booking_id', false);
  perform set_config('test.car_r2_replay', coalesce(r2 ->> 'idempotent_replay', 'false'), false);
  perform set_config('test.carro1', v_carro1::text, false);
end $$;

select is(current_setting('test.car_dup'), current_setting('test.car_r1'),
  'duplo-envio antes da placa continua caindo na mesma reserva');
select isnt(current_setting('test.car_r2'), current_setting('test.car_r1'),
  'segundo carro nas mesmas datas ganha reserva própria');
select is(current_setting('test.car_r2_replay'), 'false',
  'a reserva do segundo carro não é replay');
select is(
  (select vehicle_id::text from public.booking where id = current_setting('test.car_r1')::uuid),
  current_setting('test.carro1'), 'a 1ª reserva segue com o carro 1');

-- ── 7) Só a Edge cria reserva (20261201231000) ──────────────────────────────
-- As duas funções recebem o profile_id por parâmetro. Com EXECUTE para o usuário logado, ele
-- reservava na conta de outra pessoa chamando a RPC direto.
select ok(not has_function_privilege('authenticated',
  'public.create_booking_atomic(uuid, uuid, timestamptz, timestamptz, integer, boolean, uuid, uuid[], text, text, public.fare_tier)',
  'execute'), 'usuário logado não executa create_booking_atomic direto');
select ok(not has_function_privilege('authenticated',
  'public._create_booking_core(uuid, uuid, text, text, text, uuid, timestamptz, timestamptz, integer, boolean, uuid, uuid[], text, text, public.fare_tier)',
  'execute'), 'usuário logado não executa _create_booking_core direto');

rollback;
