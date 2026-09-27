-- pgTAP: listar no Hub exige o pré-voo (27/09/2026). Transação com rollback.
begin;
select plan(6);

do $$
declare adm uuid := gen_random_uuid(); cid uuid := gen_random_uuid(); loc uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (adm,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','lg-adm@ex.com',now(),now());
  insert into public.profiles(id, role) values (adm,'hub_admin') on conflict (id) do update set role='hub_admin';
  insert into public.company(id, name, slug, status, onboarding_status) values (cid, 'Guard Empresa', 'guard-empresa', 'active', 'active');
  insert into public.location(id, company_id, name, slug, checkout_mode, is_listed) values (loc, cid, 'Guard Loc', 'guard-loc', 'hub', false);
  perform set_config('test.adm', adm::text, false);
  perform set_config('test.loc', loc::text, false);
end $$;

select has_function('public', '_hub_readiness', array['uuid'], '_hub_readiness existe');
select is((public._hub_readiness(current_setting('test.loc')::uuid) ->> 'ready')::boolean, false, 'unidade sem contrato, recebedor e vaga reprova no pré-voo');

-- serviço (sem uid) segue livre: é o caminho do cron, das Edges e das fixtures
select lives_ok(format('update public.location set is_listed = true where id = %L::uuid', current_setting('test.loc')), 'serviço lista sem gate');
update public.location set is_listed = false where id = current_setting('test.loc')::uuid;

-- pessoa (hub_admin) não lista unidade hub reprovada
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.adm'), 'role', 'authenticated')::text, true);
select throws_ok(format('update public.location set is_listed = true where id = %L::uuid', current_setting('test.loc')), '23514', null, 'hub_admin não lista antes do pré-voo');
select is((select is_listed from public.location where id = current_setting('test.loc')::uuid), false, 'continua despublicada');
-- e pode despublicar e editar o resto sem passar pelo gate
select lives_ok(format('update public.location set name = %L where id = %L::uuid', 'Guard Loc 2', current_setting('test.loc')), 'editar outro campo não passa pelo gate');

select * from finish();
rollback;
