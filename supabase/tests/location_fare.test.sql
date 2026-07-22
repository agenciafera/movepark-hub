-- pgTAP: E2.8-f — config de Tarifa por unidade. Overlay no get_unit_fares (preço + on/off) e
-- gate de escopo do operator_set_unit_fare. Transação + rollback.

begin;
select plan(8);

select has_table('public', 'location_fare', 'tabela location_fare existe');
select has_function('public', 'operator_set_unit_fare', 'RPC operator_set_unit_fare existe');

-- fixture: um lpt
do $$
declare v_lpt uuid;
begin
  select id into v_lpt from public.location_parking_type where is_active limit 1;
  perform set_config('test.lpt', v_lpt::text, false);
end $$;

-- sem override: get_unit_fares devolve as 3 do catálogo (preços globais)
select is((select count(*)::int from public.get_unit_fares(current_setting('test.lpt')::uuid)), 3,
  'sem override → 3 Tarifas do catálogo');
select is((select price_cents from public.get_unit_fares(current_setting('test.lpt')::uuid) where tier='flex'),
  1290, 'sem override → Flex no preço global (1290)');

-- com override: preço sobrescrito + desativar um tier
insert into public.location_fare(location_parking_type_id, tier, enabled, price_cents_override)
values (current_setting('test.lpt')::uuid, 'flex', true, 1990),
       (current_setting('test.lpt')::uuid, 'superflex', false, null);

select is((select price_cents from public.get_unit_fares(current_setting('test.lpt')::uuid) where tier='flex'),
  1990, 'override aplica preço por unidade (1990)');
select is((select count(*)::int from public.get_unit_fares(current_setting('test.lpt')::uuid)), 2,
  'tier desativado some do resolver (2 visíveis)');

-- gate: customer sem escopo não pode chamar a RPC
do $$
declare uc uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (uc,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','fare-cfg@ex.com',now(),now());
  insert into public.profiles(id, role) values (uc,'customer') on conflict (id) do nothing;
  perform set_config('test.uc', uc::text, false);
end $$;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.uc'))::text, true);
select throws_ok(
  format($$ select public.operator_set_unit_fare(%L::uuid, 'flex', true, 1500) $$, current_setting('test.lpt')),
  '42501', null, 'customer sem pricing:write é barrado');
reset role;

-- Plano de cancelamento é produto da Movepark: nem o DONO da empresa edita.
-- Antes deste gate, `owner` (que carrega pricing:write) passava.
do $$
declare uo uuid := gen_random_uuid(); v_company uuid;
begin
  select l.company_id into v_company
  from public.location_parking_type lpt
  join public.location l on l.id = lpt.location_id
  where lpt.id = current_setting('test.lpt')::uuid;

  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (uo,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','fare-owner@ex.com',now(),now());
  insert into public.profiles(id, role) values (uo,'company_operator') on conflict (id) do nothing;
  insert into public.profile_company(profile_id, company_id, role) values (uo, v_company, 'owner');
  perform set_config('test.uo', uo::text, false);
end $$;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.uo'))::text, true);
select throws_ok(
  format($$ select public.operator_set_unit_fare(%L::uuid, 'superflex', true, 2500) $$, current_setting('test.lpt')),
  '42501', null, 'dono da empresa, mesmo com pricing:write, não edita plano de cancelamento');
reset role;

select * from finish();
rollback;
