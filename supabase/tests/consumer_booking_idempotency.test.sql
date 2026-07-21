-- pgTAP: idempotência do consumidor em create_booking_atomic (achado H1 / §16-1).
-- O create_booking do consumidor (chatbot/agente) não manda idempotency_key, então duas "reserva"
-- seguidas criavam duas pending idênticas, cada uma segurando vaga real até o cron expirar.
-- Correção (ADR): a chave é DERIVADA no servidor de (profile, tipo de vaga, entrada, saída) e
-- deduplica contra a pending viva. Cobre: duplo-envio → 1 reserva (replay); datas diferentes →
-- 2 reservas; re-reserva depois que a 1ª sai de pending → nova reserva permitida.
-- Roda em transação com rollback.

begin;
select plan(9);

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

rollback;
