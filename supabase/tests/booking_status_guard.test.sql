-- pgTAP: guarda de transição de status em `booking` (20260915000000).
-- Fecha a escalada do cliente: um cliente NÃO pode promover a própria reserva (pending -> confirmed)
-- nem mexer em dinheiro; só pode abandonar/cancelar o próprio pending. Staff (operador) mantém as
-- transições operacionais; o servidor (service_role / SECURITY DEFINER) passa livre.
-- Transação com rollback.

begin;
select plan(10);

-- ── fixtures (como postgres; a guarda só age sobre authenticated/anon) ───────
do $$
declare
  u1 uuid := gen_random_uuid();   -- cliente dono
  uop uuid := gen_random_uuid();  -- operador
  v_loc uuid; v_cid uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (u1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','guard-c1@ex.com',now(),now()),
    (uop,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','guard-op@ex.com',now(),now());
  insert into public.profiles(id, role) values
    (u1,'customer'), (uop,'company_operator') on conflict (id) do nothing;

  -- Uma location do seed e a empresa dela; o operador é vinculado a essa empresa.
  select id, company_id into v_loc, v_cid from public.location where deleted_at is null limit 1;
  insert into public.profile_company(profile_id, company_id) values (uop, v_cid) on conflict do nothing;

  -- Reservas do cliente (insert direto: a guarda é sobre UPDATE).
  insert into public.booking(code, profile_id, location_id, check_in_at, check_out_at, status, total_amount) values
    ('GUARD-A', u1, v_loc, now() + interval '2 day', now() + interval '3 day', 'pending', 100),
    ('GUARD-B', u1, v_loc, now() + interval '4 day', now() + interval '5 day', 'pending', 100),
    ('GUARD-C', u1, v_loc, now() + interval '6 day', now() + interval '7 day', 'pending', 100),
    ('GUARD-D', u1, v_loc, now() + interval '8 day', now() + interval '9 day', 'confirmed', 100);

  perform set_config('test.u1', u1::text, false);
  perform set_config('test.uop', uop::text, false);
  perform set_config('test.loc', v_loc::text, false);
  perform set_config('test.a', (select id::text from public.booking where code = 'GUARD-A'), false);
  perform set_config('test.b', (select id::text from public.booking where code = 'GUARD-B'), false);
  perform set_config('test.c', (select id::text from public.booking where code = 'GUARD-C'), false);
  perform set_config('test.d', (select id::text from public.booking where code = 'GUARD-D'), false);
end $$;

create or replace function pg_temp.as_user(p_uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid)::text, true);
end $$;

-- ── cliente NÃO pode promover status (bypass de pagamento) ──────────────────
set local role authenticated;
select pg_temp.as_user(current_setting('test.u1'));

-- INSERT direto: cliente NÃO cria reserva (muito menos já confirmed) — o mesmo bypass pelo verbo INSERT.
select throws_ok(
  format($$ insert into public.booking(code, profile_id, location_id, check_in_at, check_out_at, status, total_amount)
            values ('GUARD-HACK', %L, %L, now() + interval '3 day', now() + interval '4 day', 'confirmed', 0) $$,
         current_setting('test.u1'), current_setting('test.loc')),
  'P0001', null, 'cliente NÃO consegue INSERIR reserva direto (bypass de pagamento via INSERT)');

select throws_ok(
  format($$ update public.booking set status = 'confirmed' where id = %L $$, current_setting('test.a')),
  'P0001', null, 'cliente NÃO consegue autoconfirmar o próprio pending (bypass de pagamento)');

select throws_ok(
  format($$ update public.booking set status = 'checked_in' where id = %L $$, current_setting('test.a')),
  'P0001', null, 'cliente NÃO consegue marcar checked_in');

-- ── cliente NÃO pode mexer em dinheiro (nem mantendo pending) ────────────────
select throws_ok(
  format($$ update public.booking set total_amount = 1 where id = %L $$, current_setting('test.b')),
  'P0001', null, 'cliente NÃO consegue baixar total_amount do próprio pending');

select throws_ok(
  format($$ update public.booking set status = 'expired', total_amount = 1 where id = %L $$, current_setting('test.b')),
  'P0001', null, 'cliente NÃO consegue abandonar E adulterar total no mesmo update');

-- ── cliente PODE editar a própria reserva pending no checkout (identidade etc.) ─
select lives_ok(
  format($$ update public.booking set customer_email = 'novo@ex.com', passenger_count = 2 where id = %L $$, current_setting('test.b')),
  'cliente PODE editar dados do checkout do próprio pending (pending -> pending)');

-- ── cliente PODE abandonar/cancelar o próprio pending ───────────────────────
select lives_ok(
  format($$ update public.booking set status = 'expired', deleted_at = now() where id = %L $$, current_setting('test.a')),
  'cliente PODE abandonar (pending -> expired) o próprio pending');
select is(
  (select status::text from public.booking where id = current_setting('test.a')::uuid),
  'expired', 'GUARD-A ficou expired');

reset role;

-- ── staff (operador da empresa) mantém as transições operacionais ───────────
set local role authenticated;
select pg_temp.as_user(current_setting('test.uop'));
select lives_ok(
  format($$ update public.booking set status = 'checked_in', checked_in_at = now() where id = %L $$, current_setting('test.d')),
  'operador PODE confirmed -> checked_in na unidade da própria empresa');
reset role;

-- ── servidor (SECURITY DEFINER) passa livre pela guarda ─────────────────────
select is(
  public.cancel_booking_with_release(current_setting('test.c')::uuid, 'teste'),
  'expired'::public.booking_status,
  'cancel_booking_with_release (SECURITY DEFINER) não é barrado pela guarda');

select * from finish();
rollback;
