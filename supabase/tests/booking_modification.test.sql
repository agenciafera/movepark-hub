-- pgTAP: histórico de alterações da reserva (booking_modification). Cobre schema, o grant trancado
-- do helper (SECURITY DEFINER só service_role) e a RLS (dono vê o próprio; terceiro não).
-- Rodar com: supabase test db (ver README.md).

begin;
select plan(9);

select has_table('public', 'booking_modification', 'tabela booking_modification existe');
select has_type('public', 'booking_modification_type', 'enum booking_modification_type existe');
select is(
  (select relrowsecurity from pg_class where oid = 'public.booking_modification'::regclass),
  true, 'RLS ligado em booking_modification');

-- Helper é SECURITY DEFINER e trancado: authenticated NÃO pode executar (senão insere histórico falso).
set local role authenticated;
select throws_ok(
  $$ select public.log_booking_modification(gen_random_uuid(), 'cancel') $$,
  '42501', null,
  'authenticated não executa log_booking_modification (permission denied)');
reset role;

-- Usuário + reserva reais pra referenciar (FK).
do $$
declare u uuid := gen_random_uuid(); v_lpt uuid; r jsonb;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'bm-owner@ex.com', now(), now());
  insert into public.profiles(id, role) values (u, 'customer') on conflict (id) do nothing;
  select id into v_lpt from public.location_parking_type where capacity > 0 and is_active limit 1;
  update public.location_parking_type set capacity = 10 where id = v_lpt;
  r := public.create_booking_atomic(u, v_lpt, '2026-12-10T12:00:00Z', '2026-12-12T12:00:00Z');
  perform set_config('test.u', u::text, false);
  perform set_config('test.bid', r ->> 'booking_id', false);
end $$;

-- Helper insere (contexto postgres/service_role).
select lives_ok(
  format(
    $$ select public.log_booking_modification(%L::uuid, 'cancel', %L::uuid, 'customer', '{"a":1}'::jsonb, -500, 'teste') $$,
    current_setting('test.bid'), current_setting('test.u')),
  'log_booking_modification insere o histórico');
select is(
  (select count(*)::int from public.booking_modification where booking_id = current_setting('test.bid')::uuid),
  1, 'histórico gravado');
select is(
  (select amount_delta_cents from public.booking_modification where booking_id = current_setting('test.bid')::uuid),
  -500, 'delta financeiro (estorno) gravado');

-- RLS: o dono vê o próprio histórico; um terceiro não.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.u'))::text, true);
select is(
  (select count(*)::int from public.booking_modification where booking_id = current_setting('test.bid')::uuid),
  1, 'dono vê o próprio histórico');
select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid())::text, true);
select is(
  (select count(*)::int from public.booking_modification where booking_id = current_setting('test.bid')::uuid),
  0, 'terceiro não vê o histórico (RLS bloqueia)');
reset role;

select * from finish();
rollback;
