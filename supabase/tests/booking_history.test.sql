-- pgTAP: histórico da reserva do Hub com quem fez (reservas unificadas, fase 6, 09/10/2026).
-- Migration: 20261129140000_historico_da_reserva.sql.
--
-- O que este arquivo protege:
--   1. check-in, check-out e no-show passam a registrar quem marcou (status_change), e mudança que
--      não é operacional não registra (cancelamento já é registrado por quem cancela);
--   2. `booking_history` dá nome a quem fez: equipe Movepark e cliente sem nome para o parceiro;
--   3. membro sem `bookings:read` não lê o histórico; a anon key não executa.

begin;
select plan(9);

do $$
declare
  v_owner uuid := gen_random_uuid();
  v_fin uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_cust uuid := gen_random_uuid();
  v_c uuid; v_l uuid; v_b uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (v_owner,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','bh-own@ex.com',now(),now()),
    (v_fin,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','bh-fin@ex.com',now(),now()),
    (v_admin,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','bh-adm@ex.com',now(),now()),
    (v_cust,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','bh-cus@ex.com',now(),now());
  insert into public.profiles(id, role, first_name, last_name) values
    (v_owner,'company_operator','Dona','Alfa'), (v_fin,'company_operator','Fin','Beta'),
    (v_admin,'hub_admin','Pessoa','Admin'), (v_cust,'customer','Caio','Cliente')
    on conflict (id) do update set role = excluded.role, first_name = excluded.first_name, last_name = excluded.last_name;

  insert into public.company(name, slug) values ('BH Co', 'bh-co') returning id into v_c;
  insert into public.profile_company(profile_id, company_id, role) values (v_owner, v_c, 'owner'), (v_fin, v_c, 'finance');
  insert into public.location(company_id, name, slug) values (v_c, 'BH Loc', 'bh-loc') returning id into v_l;
  insert into public.booking(code, location_id, profile_id, status, check_in_at, check_out_at, total_amount, customer_name)
    values ('BHTEST01', v_l, v_cust, 'confirmed', now() - interval '1 hour', now() + interval '2 days', 100, 'Caio')
    returning id into v_b;

  perform set_config('test.b', v_b::text, false);
  perform set_config('test.c', v_c::text, false);
  perform set_config('test.owner', v_owner::text, false);
  perform set_config('test.fin', v_fin::text, false);
  perform set_config('test.admin', v_admin::text, false);
end $$;

-- O Financeiro não lê reserva: tira o escopo dele para o teste (o pacote seedado pode ter).
delete from public.company_role_scope where role = 'finance' and scope = 'bookings:read';

-- ── 1. quem marcou ───────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.admin'))::text, true);
update public.booking set status = 'checked_in', checked_in_at = now() where id = current_setting('test.b')::uuid;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.owner'))::text, true);
update public.booking set status = 'completed', checked_out_at = now() where id = current_setting('test.b')::uuid;
update public.booking set notes = 'só nota' where id = current_setting('test.b')::uuid;
reset role;

select is((select count(*)::int from public.booking_modification where booking_id = current_setting('test.b')::uuid and type = 'status_change'),
  2, 'check-in e check-out registrados; nota não é mudança de status');
select is((select changes->'status'->>'to' from public.booking_modification
            where booking_id = current_setting('test.b')::uuid order by created_at, id limit 1),
  'checked_in', 'registra de onde para onde');
select is((select actor_role from public.booking_modification
            where booking_id = current_setting('test.b')::uuid and changes->'status'->>'to' = 'completed'),
  'staff', 'o dono do estacionamento entra como equipe');

-- ── 2. nomes ─────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.owner'))::text, true);
create temp table _h on commit drop as select public.booking_history(current_setting('test.b')::uuid) h;
select is((select jsonb_array_length(h) from _h), 2, 'o parceiro lê o histórico');
select is((select h->0->>'actor_name' from _h), 'Equipe Movepark', 'a equipe Movepark aparece sem nome para o parceiro');
select is((select h->1->>'actor_name' from _h), 'Dona Alfa', 'o próprio parceiro aparece com nome');

select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.admin'))::text, true);
select is((select public.booking_history(current_setting('test.b')::uuid) -> 0 ->> 'actor_name'),
  'Pessoa Admin', 'a equipe vê o nome');

-- ── 3. escopo ────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.fin'))::text, true);
select is((select jsonb_array_length(public.booking_history(current_setting('test.b')::uuid))), 0,
  'membro sem bookings:read não lê o histórico');
reset role;

select ok(not has_function_privilege('anon', 'public.booking_history(uuid)', 'execute'), 'a anon key não executa');

select * from finish();
rollback;
