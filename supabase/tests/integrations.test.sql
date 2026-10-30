-- pgTAP: integrações com terceiros, Fase 1 (motor). Migration: 20261201150000_integracoes_cloudpark.sql
-- Spec: docs/specs/integracoes.md § 5 e § 6 (Fase 1).
--
-- O que este arquivo protege:
--   1. os escopos: integrations:read para Dono, Gerente e Operação; integrations:write só do Dono
--      (decisão D3 de 30/10/2026), nenhum dos dois atribuível a chave de API;
--   2. a configuração só por RPC, com o escopo checado no servidor e o endereço da Cloudpark
--      restrito ao link de nuvem;
--   3. o token: vai para o Vault, nunca volta numa leitura, e só o service_role o decifra;
--   4. a fila: reserva confirmada numa unidade com integração ligada vira UMA entrega pendente,
--      com o e-mail retido por 15 minutos; integração desligada, ou reserva que já tem código,
--      não enfileira;
--   5. o código de acesso: o dono da reserva vê, quem não é dono nem equipe não vê;
--   6. a reivindicação da fila e da soltura do e-mail: cada linha sai uma vez só.

begin;
select plan(29);

do $$
declare
  v_admin uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_manager uuid := gen_random_uuid();
  v_cust uuid := gen_random_uuid();
  v_stranger uuid := gen_random_uuid();
  v_c uuid;
  v_l uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (v_admin,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','intg-admin@ex.com',now(),now()),
    (v_owner,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','intg-owner@ex.com',now(),now()),
    (v_manager,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','intg-mgr@ex.com',now(),now()),
    (v_cust,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','intg-cust@ex.com',now(),now()),
    (v_stranger,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','intg-str@ex.com',now(),now());
  insert into public.profiles(id, role) values
    (v_admin,'hub_admin'), (v_owner,'company_operator'), (v_manager,'company_operator'),
    (v_cust,'customer'), (v_stranger,'customer')
    on conflict (id) do update set role = excluded.role;

  insert into public.company(name, slug) values ('INTG Alfa', 'intg-alfa') returning id into v_c;
  insert into public.location(company_id, name, slug) values (v_c, 'INTG Loc', 'intg-loc') returning id into v_l;
  insert into public.profile_company(profile_id, company_id, role) values
    (v_owner, v_c, 'owner'), (v_manager, v_c, 'manager');

  perform set_config('test.c', v_c::text, false);
  perform set_config('test.l', v_l::text, false);
  perform set_config('test.admin', v_admin::text, false);
  perform set_config('test.owner', v_owner::text, false);
  perform set_config('test.manager', v_manager::text, false);
  perform set_config('test.cust', v_cust::text, false);
  perform set_config('test.stranger', v_stranger::text, false);
end $$;

-- ── 1. escopos ───────────────────────────────────────────────────────────────
select is(
  (select count(*)::int from public.api_scope
    where scope in ('integrations:read', 'integrations:write')
      and not assignable_to_api_key and not is_platform_scope),
  2, 'integrations:read e :write são de empresa e não vão para chave de API');
select is(
  (select array_agg(role::text order by role::text) from public.company_role_scope where scope = 'integrations:write'),
  array['owner'], 'só o Dono configura integrações');
select is(
  (select count(distinct role)::int from public.company_role_scope
    where scope = 'integrations:read' and role in ('owner', 'manager', 'operator')),
  3, 'Dono, Gerente e Operação veem as integrações');

-- ── 2. configuração por RPC ──────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.manager'))::text, true);
select throws_ok(
  format($q$select public.integration_upsert_connection('%s', 'cloudpark', '{"base_url":"https://1269.cloudpark.com.br"}')$q$,
         current_setting('test.l')),
  '42501', null, 'o Gerente não instala integração');

select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.owner'))::text, true);
select throws_ok(
  format($q$select public.integration_upsert_connection('%s', 'cloudpark', '{"base_url":"http://192.168.0.10"}')$q$,
         current_setting('test.l')),
  '22023', null, 'endereço fora do link de nuvem da Cloudpark é recusado');
select throws_ok(
  format($q$select public.integration_upsert_connection('%s', 'cloudpark', '{"base_url":"https://evil.example.com"}')$q$,
         current_setting('test.l')),
  '22023', null, 'host que não é da Cloudpark é recusado');
select lives_ok(
  format($q$select public.integration_upsert_connection('%s', 'cloudpark', '{"base_url":"https://1269.Cloudpark.com.br/"}')$q$,
         current_setting('test.l')),
  'o Dono instala a Cloudpark na unidade');
select is(
  (select config->>'base_url' from public.integration_connections(current_setting('test.c')::uuid)),
  'https://1269.cloudpark.com.br', 'o endereço é normalizado (minúsculo, sem barra no fim)');
select throws_ok(
  format($q$select public.integration_upsert_connection('%s', 'cloudpark', null, true)$q$, current_setting('test.l')),
  '22023', null, 'não liga sem token salvo');

-- ── 3. o token ───────────────────────────────────────────────────────────────
select lives_ok(
  format($q$select public.integration_set_secret('%s', 'Token abcdefgh12349f3a')$q$,
         (select id from public.integration_connections(current_setting('test.c')::uuid))),
  'o Dono grava o token');
select is(
  (select array[has_secret::text, secret_hint] from public.integration_connections(current_setting('test.c')::uuid)),
  array['true', '9f3a'], 'a leitura diz só que o token existe e o final dele');
select ok(
  pg_get_function_result('public.integration_connections(uuid)'::regprocedure) !~ 'secret_id',
  'a RPC de leitura nem tem coluna para o segredo');
select is(
  (select count(*)::int from public.integration_connection),
  0, 'o parceiro não lê a tabela direto (RLS)');
select lives_ok(
  format($q$select public.integration_upsert_connection('%s', 'cloudpark', null, true)$q$, current_setting('test.l')),
  'com token, o Dono liga a integração');

select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.manager'))::text, true);
select is(
  (select count(*)::int from public.integration_connections(current_setting('test.c')::uuid)),
  1, 'o Gerente vê a integração da empresa');
select throws_ok(
  format($q$select public.integration_set_secret('%s', 'outro-token-123')$q$,
         (select id from public.integration_connections(current_setting('test.c')::uuid))),
  '42501', null, 'o Gerente não troca o token');

select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.stranger'))::text, true);
select throws_ok(
  format($q$select * from public.integration_connections('%s')$q$, current_setting('test.c')),
  '42501', null, 'quem não é da empresa não lista as integrações');
reset role;

select is(
  public.integration_connection_secret((select id from public.integration_connection
                                         where location_id = current_setting('test.l')::uuid)),
  'abcdefgh12349f3a', 'o service_role decifra o token, sem o prefixo "Token"');
select ok(
  not has_function_privilege('authenticated', 'public.integration_connection_secret(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.integration_delivery_claim(integer, interval, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.integration_hold_release_claim(integer)', 'execute')
  and not has_function_privilege('anon', 'public.booking_access_code(text)', 'execute')
  and not has_function_privilege('anon', 'public.integration_upsert_connection(uuid, text, jsonb, boolean, boolean, boolean)', 'execute'),
  'segredo e fila só para o service_role; anon não executa nada');

-- ── 4. a fila ────────────────────────────────────────────────────────────────
insert into public.booking(code, profile_id, location_id, check_in_at, check_out_at, status, total_amount)
values ('INTG0001', current_setting('test.cust')::uuid, current_setting('test.l')::uuid,
        now() + interval '2 days', now() + interval '4 days', 'pending', 100);
update public.booking set status = 'confirmed' where code = 'INTG0001';
update public.booking set notes = 'mexe em outra coluna' where code = 'INTG0001';

select is(
  (select count(*)::int from public.integration_delivery d join public.booking b on b.id = d.booking_id
    where b.code = 'INTG0001' and d.status = 'pending' and d.source = 'hub'),
  1, 'reserva confirmada vira uma entrega pendente, uma vez só');
select ok(
  (select d.hold_until between now() + interval '14 minutes' and now() + interval '16 minutes'
     from public.integration_delivery d join public.booking b on b.id = d.booking_id where b.code = 'INTG0001'),
  'o e-mail de confirmação fica retido por 15 minutos');

-- Reserva que já tem código (carga da Fase 0) não vai de novo.
insert into public.booking(code, profile_id, location_id, check_in_at, check_out_at, status, total_amount)
values ('INTG0002', current_setting('test.cust')::uuid, current_setting('test.l')::uuid,
        now() + interval '2 days', now() + interval '4 days', 'pending', 100);
insert into public.integration_access_code(connection_id, company_id, booking_id, code)
select c.id, c.company_id, b.id, 'codigo-fase-0'
  from public.integration_connection c, public.booking b
 where c.location_id = current_setting('test.l')::uuid and b.code = 'INTG0002';
update public.booking set status = 'confirmed' where code = 'INTG0002';
select is(
  (select count(*)::int from public.integration_delivery d join public.booking b on b.id = d.booking_id
    where b.code = 'INTG0002'),
  0, 'reserva que já tem código não é enviada de novo');

-- Integração desligada não enfileira.
update public.integration_connection set enabled = false where location_id = current_setting('test.l')::uuid;
insert into public.booking(code, profile_id, location_id, check_in_at, check_out_at, status, total_amount)
values ('INTG0003', current_setting('test.cust')::uuid, current_setting('test.l')::uuid,
        now() + interval '2 days', now() + interval '4 days', 'confirmed', 100);
select is(
  (select count(*)::int from public.integration_delivery d join public.booking b on b.id = d.booking_id
    where b.code = 'INTG0003'),
  0, 'integração desligada não enfileira');
update public.integration_connection set enabled = true where location_id = current_setting('test.l')::uuid;

-- ── 5. o código de acesso ────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.cust'))::text, true);
select is(
  (select array[coalesce(code, '-'), pending::text] from public.booking_access_code('INTG0001')),
  array['-', 'true'], 'o dono da reserva vê que o QR de acesso está sendo gerado');
select is(
  (select code from public.booking_access_code('INTG0002')),
  'codigo-fase-0', 'e vê o código quando ele existe');
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.stranger'))::text, true);
select is(
  (select count(*)::int from public.booking_access_code('INTG0002')),
  0, 'quem não é dono nem equipe não vê o código');
reset role;

-- ── 6. reivindicação ─────────────────────────────────────────────────────────
select is(
  (select count(*)::int from public.integration_delivery_claim(10, interval '5 minutes')
    where booking_id = (select id from public.booking where code = 'INTG0001')),
  1, 'a entrega vencida é reivindicada');
select is(
  (select count(*)::int from public.integration_delivery_claim(10, interval '5 minutes')
    where booking_id = (select id from public.booking where code = 'INTG0001')),
  0, 'e não sai de novo enquanto a concessão vale');

update public.integration_delivery set hold_until = now() - interval '1 minute'
 where booking_id = (select id from public.booking where code = 'INTG0001');
select is(
  (select count(*)::int from public.integration_hold_release_claim(10)
    where booking_id = (select id from public.booking where code = 'INTG0001'))
  + (select count(*)::int from public.integration_hold_release_claim(10)
    where booking_id = (select id from public.booking where code = 'INTG0001')),
  1, 'a soltura do e-mail retido sai uma vez só');

select * from finish();
rollback;
