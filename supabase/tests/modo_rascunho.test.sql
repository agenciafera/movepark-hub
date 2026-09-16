-- pgTAP: modo rascunho (15/09/2026, testadores em 16/09). Unidade em RASCUNHO: invisível para anon e para
-- cliente, visível para hub_admin (testador por definição) nas quatro funções. A trava da
-- 20261029100000 continua inteira para quem não é da Movepark.
-- Transação com rollback.

begin;
select plan(8);

do $$
declare
  adm uuid := gen_random_uuid(); cust uuid := gen_random_uuid();
  cid uuid := gen_random_uuid(); loc uuid := gen_random_uuid(); pt uuid := gen_random_uuid();
  cpt uuid := gen_random_uuid(); lpt uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (adm,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','rascunho-adm@ex.com',now(),now()),
           (cust,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','rascunho-cust@ex.com',now(),now());
  insert into public.profiles(id, role) values (adm,'hub_admin') on conflict (id) do update set role='hub_admin';
  insert into public.profiles(id, role) values (cust,'customer') on conflict (id) do nothing;

  insert into public.company(id, name, slug, status, onboarding_status)
    values (cid, 'Rascunho Empresa', 'rascunho-empresa', 'active', 'active');
  -- Viva, com foto, mas NÃO listada: é o rascunho.
  insert into public.location(id, company_id, name, slug, status, photos, is_draft)
    values (loc, cid, 'Rascunho Unidade', 'rascunho-unidade', 'active',
            '["/Estacionamentos/seed/foto-de-teste.webp"]'::jsonb, true);
  insert into public.parking_type(id, code, name) values (pt, 'rascunho_coberta', 'Rascunho Coberta');
  insert into public.company_parking_type(id, company_id, parking_type_id, base_price, default_capacity)
    values (cpt, cid, pt, 40, 10);
  insert into public.location_parking_type(id, location_id, company_parking_type_id, capacity, is_active)
    values (lpt, loc, cpt, 10, true);
  perform public.wl_mirror_apply_pricing(
    lpt, '{"strategy":"uniform_by_duration","old_price_strategy":"none"}'::jsonb,
    '[{"from_day":1,"to_day":null,"unit_price":30,"is_old_price":false}]'::jsonb, 40, '[]'::jsonb, 1);

  perform set_config('test.adm', adm::text, false);
  perform set_config('test.cust', cust::text, false);
end $$;

-- anon: nada
set local role anon;
select is((public.simulate_price('rascunho-empresa','rascunho-unidade','rascunho_coberta', 2) ->> 'price'), null,
  'anon não precifica unidade não listada');
select is((public.check_availability('rascunho-empresa','rascunho-unidade','rascunho_coberta',
  now() + interval '10 days', now() + interval '12 days') ->> 'ok'), null,
  'anon não vê disponibilidade de unidade não listada');
reset role;

-- cliente logado: nada
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.cust'), 'role', 'authenticated')::text, true);
select is((public.simulate_price('rascunho-empresa','rascunho-unidade','rascunho_coberta', 2) ->> 'price'), null,
  'cliente não precifica unidade não listada');
reset role;

-- hub_admin: vê e precifica
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.adm'), 'role', 'authenticated')::text, true);
select is((public.simulate_price('rascunho-empresa','rascunho-unidade','rascunho_coberta', 2) ->> 'price')::numeric, 60.00,
  'hub_admin precifica a unidade em rascunho (2 diárias a R$ 30)');
select isnt((public.check_availability('rascunho-empresa','rascunho-unidade','rascunho_coberta',
  now() + interval '10 days', now() + interval '12 days') ->> 'ok'), null,
  'hub_admin vê disponibilidade da unidade em rascunho');
select isnt(
  (select count(*) from public.get_pricing_data('rascunho-empresa','rascunho-unidade','rascunho_coberta')), 0::bigint,
  'hub_admin lê os dados de preço da unidade em rascunho');
reset role;

-- listar continua o caminho público: depois de listar, anon vê
update public.location set is_listed = true where slug = 'rascunho-unidade';
set local role anon;
select is((public.simulate_price('rascunho-empresa','rascunho-unidade','rascunho_coberta', 2) ->> 'price')::numeric, 60.00,
  'listada, anon volta a precificar');
reset role;

-- unidade inativa NÃO é rascunho: nem hub_admin vê
update public.location set status = 'inactive' where slug = 'rascunho-unidade';
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.adm'), 'role', 'authenticated')::text, true);
select is((public.simulate_price('rascunho-empresa','rascunho-unidade','rascunho_coberta', 2) ->> 'price'), null,
  'unidade inativa continua invisível até para hub_admin: rascunho é viva e não listada');
reset role;

select * from finish();
rollback;
