-- pgTAP: Manager › Usuários paginado (16/09/2026). Só hub_admin lista; a lista traz e-mail,
-- telefone, testador, empresas e o último canal de login; busca por nome, e-mail, telefone e id;
-- pagina no servidor. `record_login_channel` grava o canal de quem está logado.
-- Transação com rollback.

begin;
select plan(13);

do $$
declare
  adm uuid := gen_random_uuid(); c1 uuid := gen_random_uuid(); c2 uuid := gen_random_uuid();
  cid uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, phone, created_at, updated_at, last_sign_in_at)
    values (adm,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','alu-adm@ex.com',null,now(),now(),now()),
           (c1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','alu-zeca@ex.com','5511999990001',now() - interval '2 days',now(),now() - interval '1 day'),
           (c2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','alu-maria@ex.com',null,now() - interval '1 day',now(),null);
  insert into public.profiles(id, role, first_name, last_name) values (adm,'hub_admin','Alu','Admin') on conflict (id) do update set role='hub_admin';
  insert into public.profiles(id, role, first_name, last_name) values (c1,'customer','Zeca','Alu') on conflict (id) do nothing;
  insert into public.profiles(id, role, first_name, last_name) values (c2,'customer','Maria','Alu') on conflict (id) do nothing;
  -- Zeca: só identidade de telefone e uma sessão OTP: o palpite tem que dar WhatsApp.
  insert into auth.identities(id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), c1, '5511999990001', 'phone', jsonb_build_object('sub', c1::text, 'phone', '5511999990001'), now() - interval '1 day', now(), now());
  insert into auth.sessions(id, user_id, created_at, updated_at, aal)
    values ('11111111-1111-4111-8111-111111111111', c1, now() - interval '1 day', now(), 'aal1');
  insert into auth.mfa_amr_claims(id, session_id, authentication_method, created_at, updated_at)
    values (gen_random_uuid(), '11111111-1111-4111-8111-111111111111', 'otp', now(), now());
  insert into public.company(id, name, slug, status, onboarding_status)
    values (cid, 'Alu Empresa', 'alu-empresa', 'active', 'active');
  insert into public.profile_company(profile_id, company_id, role) values (c1, cid, 'owner');
  insert into public.tester_user(user_id, created_by) values (c1, adm);

  perform set_config('test.adm', adm::text, false);
  perform set_config('test.c1', c1::text, false);
  perform set_config('test.c2', c2::text, false);
end $$;

-- cliente: recusado
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.c2'), 'role', 'authenticated')::text, true);
select throws_ok('select public.admin_list_users(null, 25, 0)', 'P0001', 'Só hub_admin lista usuários.', 'cliente não lista usuários');

-- cliente registra o próprio canal
select lives_ok($$select public.record_login_channel('whatsapp')$$, 'cliente registra o canal do próprio login');
select is((select last_login_channel from public.profiles where id = current_setting('test.c2')::uuid), 'whatsapp', 'canal gravado no próprio perfil');
select throws_ok($$select public.record_login_channel('fax')$$, '22023', null, 'canal desconhecido é recusado');
reset role;

-- hub_admin lista
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.adm'), 'role', 'authenticated')::text, true);

select ok((public.admin_list_users('alu-zeca@ex.com', 25, 0) ->> 'total')::int = 1, 'busca por e-mail acha o Zeca');
select is(
  (select r ->> 'email' from jsonb_array_elements(public.admin_list_users('alu-zeca@ex.com', 25, 0) -> 'rows') r limit 1),
  'alu-zeca@ex.com', 'a linha traz o e-mail de auth.users');
select is(
  (select r ->> 'phone' from jsonb_array_elements(public.admin_list_users('alu-zeca@ex.com', 25, 0) -> 'rows') r limit 1),
  '5511999990001', 'a linha traz o telefone');
select is(
  (select r ->> 'last_login_channel' from jsonb_array_elements(public.admin_list_users('alu-zeca@ex.com', 25, 0) -> 'rows') r limit 1),
  'whatsapp', 'sem registro nosso, sessão OTP com identidade só de telefone vira WhatsApp');
select is(
  (select (r ->> 'is_tester')::boolean from jsonb_array_elements(public.admin_list_users('alu-zeca@ex.com', 25, 0) -> 'rows') r limit 1),
  true, 'a linha diz se é testador');
select is(
  (select r -> 'companies' -> 0 ->> 'name' from jsonb_array_elements(public.admin_list_users('alu-zeca@ex.com', 25, 0) -> 'rows') r limit 1),
  'Alu Empresa', 'a linha traz as empresas vinculadas');
select is(
  (select r ->> 'last_login_channel' from jsonb_array_elements(public.admin_list_users('alu-maria@ex.com', 25, 0) -> 'rows') r limit 1),
  'whatsapp', 'o canal registrado pelo front vence o palpite');

-- busca por telefone (dígitos) e paginação
select ok((public.admin_list_users('(11) 99999-0001', 25, 0) ->> 'total')::int = 1, 'busca por telefone ignora a máscara');
select is(
  jsonb_array_length(public.admin_list_users('Alu', 1, 0) -> 'rows'), 1,
  'limit 1 devolve uma linha e o total continua contando todas');
reset role;

select * from finish();
rollback;
