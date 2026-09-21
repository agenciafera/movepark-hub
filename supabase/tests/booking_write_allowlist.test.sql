-- pgTAP: allowlist de colunas na escrita direta em `booking` (20261121100000).
-- O `booking_guard_status_transition` liberava o hub_admin e o membro da empresa sem olhar coluna:
-- o operador dava PATCH em total_amount, price_breakdown, tarifa, datas e profile_id das reservas
-- das unidades dele. Agora a escrita direta (authenticated/anon) só muda o que a UI escreve de
-- fato: staff com escopo muda status, carimbos de operação e notas; o dono muda os dados do
-- checkout do próprio pending. O servidor (service_role / SECURITY DEFINER) passa livre.
-- Transação com rollback.

begin;
select plan(24);

-- ── fixtures (como postgres; a guarda só age sobre authenticated/anon) ───────
do $$
declare
  u1 uuid := gen_random_uuid();    -- cliente dono
  u2 uuid := gen_random_uuid();    -- outro cliente (alvo de profile_id)
  uop uuid := gen_random_uuid();   -- operador (papel operator)
  ufin uuid := gen_random_uuid();  -- financeiro (sem bookings:write nem bookings:checkin)
  uadm uuid := gen_random_uuid();  -- hub_admin
  v_loc uuid; v_cid uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (u1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','allow-c1@ex.com',now(),now()),
    (u2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','allow-c2@ex.com',now(),now()),
    (uop,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','allow-op@ex.com',now(),now()),
    (ufin,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','allow-fin@ex.com',now(),now()),
    (uadm,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','allow-adm@ex.com',now(),now());
  insert into public.profiles(id, role) values
    (u1,'customer'), (u2,'customer'), (uop,'company_operator'), (ufin,'company_operator'), (uadm,'hub_admin')
  on conflict (id) do update set role = excluded.role;

  select id, company_id into v_loc, v_cid from public.location where deleted_at is null limit 1;
  insert into public.profile_company(profile_id, company_id, role) values
    (uop, v_cid, 'operator'), (ufin, v_cid, 'finance')
  on conflict do nothing;

  insert into public.booking(code, profile_id, location_id, check_in_at, check_out_at, status, total_amount) values
    ('ALLOW-A', u1, v_loc, now() + interval '2 day', now() + interval '3 day', 'confirmed', 100),
    ('ALLOW-B', u1, v_loc, now() + interval '4 day', now() + interval '5 day', 'pending', 100),
    ('ALLOW-C', u1, v_loc, now() + interval '6 day', now() + interval '7 day', 'confirmed', 100);

  perform set_config('test.u1', u1::text, false);
  perform set_config('test.u2', u2::text, false);
  perform set_config('test.uop', uop::text, false);
  perform set_config('test.ufin', ufin::text, false);
  perform set_config('test.uadm', uadm::text, false);
  perform set_config('test.a', (select id::text from public.booking where code = 'ALLOW-A'), false);
  perform set_config('test.b', (select id::text from public.booking where code = 'ALLOW-B'), false);
  perform set_config('test.c', (select id::text from public.booking where code = 'ALLOW-C'), false);
end $$;

create or replace function pg_temp.as_user(p_uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid)::text, true);
end $$;

-- ── operador NÃO mexe em dinheiro, tarifa, datas, dono nem snapshot do cliente ─
set local role authenticated;
select pg_temp.as_user(current_setting('test.uop'));

select throws_ok(
  format($$ update public.booking set total_amount = 1 where id = %L $$, current_setting('test.a')),
  '42501', null, 'operador NÃO muda total_amount');
select throws_ok(
  format($$ update public.booking set price_breakdown = '{"total_cents": 1}'::jsonb where id = %L $$, current_setting('test.a')),
  '42501', null, 'operador NÃO muda price_breakdown');
select throws_ok(
  format($$ update public.booking set fare_tier = 'superflex' where id = %L $$, current_setting('test.a')),
  '42501', null, 'operador NÃO muda fare_tier');
select throws_ok(
  format($$ update public.booking set fare_price_cents = coalesce(fare_price_cents, 0) + 990 where id = %L $$, current_setting('test.a')),
  '42501', null, 'operador NÃO muda fare_price_cents');
select throws_ok(
  format($$ update public.booking set fare_cancel_until = now() + interval '10 year' where id = %L $$, current_setting('test.a')),
  '42501', null, 'operador NÃO estica fare_cancel_until');
select throws_ok(
  format($$ update public.booking set check_in_at = check_in_at + interval '30 day', check_out_at = check_out_at + interval '60 day' where id = %L $$, current_setting('test.a')),
  '42501', null, 'operador NÃO muda as datas da reserva');
select throws_ok(
  format($$ update public.booking set profile_id = %L where id = %L $$, current_setting('test.u2'), current_setting('test.a')),
  '42501', null, 'operador NÃO troca o dono da reserva');
select throws_ok(
  format($$ update public.booking set customer_email = 'outro@ex.com' where id = %L $$, current_setting('test.a')),
  '42501', null, 'operador NÃO reescreve o snapshot do cliente');
select throws_ok(
  format($$ update public.booking set expires_at = now() + interval '10 year' where id = %L $$, current_setting('test.b')),
  '42501', null, 'operador NÃO estica o hold (expires_at)');
select throws_ok(
  format($$ update public.booking set deleted_at = now() where id = %L $$, current_setting('test.a')),
  '42501', null, 'operador NÃO faz soft delete da reserva');
select throws_ok(
  format($$ update public.booking set status = 'checked_in', checked_in_at = now(), total_amount = 1 where id = %L $$, current_setting('test.a')),
  '42501', null, 'operador NÃO embute coluna proibida num PATCH de check-in');

-- ── operador mantém a operação: status, carimbos e notas ─────────────────────
select lives_ok(
  format($$ update public.booking set status = 'checked_in', checked_in_at = now() where id = %L $$, current_setting('test.a')),
  'operador PODE fazer check-in (status + checked_in_at)');
select lives_ok(
  format($$ update public.booking set status = 'completed', checked_out_at = now(), notes = 'saiu 10h' where id = %L $$, current_setting('test.a')),
  'operador PODE fazer check-out com nota (status + checked_out_at + notes)');
select lives_ok(
  format($$ update public.booking set total_amount = total_amount, notes = 'saiu 10h' where id = %L $$, current_setting('test.a')),
  'PATCH que repete o valor atual de coluna proibida não é mudança');
reset role;

-- ── membro sem escopo de reserva (Financeiro) não escreve nada ───────────────
set local role authenticated;
select pg_temp.as_user(current_setting('test.ufin'));
select throws_ok(
  format($$ update public.booking set status = 'checked_in', checked_in_at = now() where id = %L $$, current_setting('test.c')),
  '42501', null, 'Financeiro (sem bookings:write/checkin) NÃO muda status');
reset role;

-- ── hub_admin segue a mesma allowlist: correção de dinheiro passa por RPC ────
set local role authenticated;
select pg_temp.as_user(current_setting('test.uadm'));
select throws_ok(
  format($$ update public.booking set total_amount = 1 where id = %L $$, current_setting('test.c')),
  '42501', null, 'hub_admin NÃO muda total_amount por escrita direta');
select lives_ok(
  format($$ update public.booking set status = 'no_show', notes = 'não veio' where id = %L $$, current_setting('test.c')),
  'hub_admin PODE fazer a transição operacional');
reset role;

-- ── dono: dados do checkout do próprio pending, e só eles ────────────────────
set local role authenticated;
select pg_temp.as_user(current_setting('test.u1'));
select lives_ok(
  format($$ update public.booking set customer_first_name = 'Ana', customer_last_name = 'Lima',
              customer_email = 'ana@ex.com', customer_phone = '31999990000', customer_tax_id = '52998224725',
              passenger_first_name = 'Bia', passenger_last_name = 'Lima', passenger_phone = '31988880000',
              passenger_count = 2, has_pcd = true where id = %L $$, current_setting('test.b')),
  'dono PODE gravar os dados do checkout no próprio pending');
select is(
  (select customer_name from public.booking where id = current_setting('test.b')::uuid),
  'Ana Lima', 'o nome reconciliado pelo trigger não conta como escrita do cliente');
select throws_ok(
  format($$ update public.booking set fare_price_cents = coalesce(fare_price_cents, 0) + 990 where id = %L $$, current_setting('test.b')),
  '42501', null, 'dono NÃO muda fare_price_cents (o guarda de status não cobria)');
select throws_ok(
  format($$ update public.booking set expires_at = now() + interval '10 year' where id = %L $$, current_setting('test.b')),
  '42501', null, 'dono NÃO estica o próprio hold');
select throws_ok(
  format($$ update public.booking set notes = 'x', checked_in_at = now() where id = %L $$, current_setting('test.b')),
  '42501', null, 'dono NÃO escreve coluna de operação');
select lives_ok(
  format($$ update public.booking set status = 'expired', deleted_at = now() where id = %L $$, current_setting('test.b')),
  'dono PODE abandonar o próprio pending (status + deleted_at)');
reset role;

-- ── servidor (SECURITY DEFINER / service_role) passa livre ───────────────────
select lives_ok(
  format($$ update public.booking set total_amount = 250, expires_at = now() where id = %L $$, current_setting('test.c')),
  'servidor (postgres/service_role) segue escrevendo qualquer coluna');

select * from finish();
rollback;
