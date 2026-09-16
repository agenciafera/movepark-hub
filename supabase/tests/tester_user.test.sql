-- pgTAP: testadores (16/09/2026). Conta marcada em `tester_user` (ou hub_admin) enxerga
-- unidade em RASCUNHO no catálogo: policy de leitura de `location` e as quatro funções de
-- preço/disponibilidade. Cliente comum e anon seguem sem ver nada.
-- Transação com rollback.

begin;
select plan(14);

select has_table('public', 'tester_user', 'tester_user existe');
select has_function('public', 'is_tester', 'is_tester() existe');
select has_function('public', 'admin_set_tester', array['uuid', 'boolean'], 'admin_set_tester(uuid, boolean) existe');

do $$
declare
  adm uuid := gen_random_uuid(); cust uuid := gen_random_uuid(); tst uuid := gen_random_uuid();
  cid uuid := gen_random_uuid(); loc uuid := gen_random_uuid(); pt uuid := gen_random_uuid();
  cpt uuid := gen_random_uuid(); lpt uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (adm,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','tester-adm@ex.com',now(),now()),
           (cust,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','tester-cust@ex.com',now(),now()),
           (tst,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','tester-tst@ex.com',now(),now());
  insert into public.profiles(id, role) values (adm,'hub_admin') on conflict (id) do update set role='hub_admin';
  insert into public.profiles(id, role) values (cust,'customer') on conflict (id) do nothing;
  insert into public.profiles(id, role) values (tst,'customer') on conflict (id) do nothing;

  insert into public.company(id, name, slug, status, onboarding_status)
    values (cid, 'Tester Empresa', 'tester-empresa', 'active', 'active');
  insert into public.payout_recipient(company_id, provider, external_recipient_id, status)
    values (cid, 'pagarme', 're_tester', 'active');
  -- Rascunho: viva, com foto, empresa apta; o gatilho força is_listed = false.
  insert into public.location(id, company_id, name, slug, status, photos, is_draft)
    values (loc, cid, 'Tester Unidade', 'tester-unidade', 'active',
            '["/Estacionamentos/seed/foto-de-teste.webp"]'::jsonb, true);
  insert into public.parking_type(id, code, name) values (pt, 'tester_coberta', 'Tester Coberta');
  insert into public.company_parking_type(id, company_id, parking_type_id, base_price, default_capacity)
    values (cpt, cid, pt, 40, 10);
  insert into public.location_parking_type(id, location_id, company_parking_type_id, capacity, is_active)
    values (lpt, loc, cpt, 10, true);
  perform public.wl_mirror_apply_pricing(
    lpt, '{"strategy":"uniform_by_duration","old_price_strategy":"none"}'::jsonb,
    '[{"from_day":1,"to_day":null,"unit_price":30,"is_old_price":false}]'::jsonb, 40, '[]'::jsonb, 1);

  perform set_config('test.adm', adm::text, false);
  perform set_config('test.cust', cust::text, false);
  perform set_config('test.tst', tst::text, false);
  perform set_config('test.loc', loc::text, false);
end $$;

select is((select is_listed from public.location where id = current_setting('test.loc')::uuid), false,
  'a unidade de teste está em rascunho (não listada)');

-- anon: não é testador, não vê
set local role anon;
select is(public.is_tester(), false, 'anon não é testador');
select is((select count(*) from public.location where id = current_setting('test.loc')::uuid), 0::bigint,
  'anon não lê a unidade em rascunho');
reset role;

-- cliente comum: não é testador, não marca ninguém, não vê
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.cust'), 'role', 'authenticated')::text, true);
select is(public.is_tester(), false, 'cliente comum não é testador');
select throws_ok(
  format('select public.admin_set_tester(%L::uuid, true)', current_setting('test.tst')),
  'P0001', 'Só hub_admin marca testador.', 'cliente comum não marca testador');
select is((select count(*) from public.location where id = current_setting('test.loc')::uuid), 0::bigint,
  'cliente comum não lê a unidade em rascunho');
reset role;

-- hub_admin: é testador por definição, e marca o cliente de teste
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.adm'), 'role', 'authenticated')::text, true);
select is(public.is_tester(), true, 'hub_admin conta como testador');
select lives_ok(
  format('select public.admin_set_tester(%L::uuid, true)', current_setting('test.tst')),
  'hub_admin marca o testador');
reset role;

-- testador: vê a unidade e precifica
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.tst'), 'role', 'authenticated')::text, true);
select is(public.is_tester(), true, 'conta marcada é testador');
select is((select count(*) from public.location where id = current_setting('test.loc')::uuid), 1::bigint,
  'testador lê a unidade em rascunho pela policy');
select is((public.simulate_price('tester-empresa','tester-unidade','tester_coberta', 2) ->> 'price')::numeric, 60.00,
  'testador precifica a unidade em rascunho (2 diárias a R$ 30)');
reset role;

select * from finish();
rollback;
