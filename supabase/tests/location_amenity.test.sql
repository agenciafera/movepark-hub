-- pgTAP: escrita de amenidades por unidade (ClickUp 86ajnetje).
-- RPC operator_set_location_amenities + o gate de escopo, na RPC e no RLS direto.
-- Transação + rollback.

begin;
select plan(10);

select has_function('public', 'operator_set_location_amenities', 'RPC existe');

-- fixture: uma unidade + os ids de empresa e dono dela
do $$
declare v_loc uuid; v_company uuid;
begin
  select l.id, l.company_id into v_loc, v_company
  from public.location l
  where l.deleted_at is null limit 1;
  perform set_config('test.loc', v_loc::text, false);
  perform set_config('test.company', v_company::text, false);
end $$;

-- dono da empresa: tem locations:write → grava
do $$
declare uo uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (uo,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','am-owner@ex.com',now(),now());
  insert into public.profiles(id, role) values (uo,'company_operator') on conflict (id) do nothing;
  insert into public.profile_company(profile_id, company_id, role)
    values (uo, current_setting('test.company')::uuid, 'owner');
  perform set_config('test.uo', uo::text, false);
end $$;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.uo'))::text, true);

select lives_ok(
  format($$ select public.operator_set_location_amenities(%L::uuid, array['cameras_24h','valet']) $$, current_setting('test.loc')),
  'dono grava o conjunto de comodidades');
select is(
  (select count(*)::int from public.location_amenity where location_id = current_setting('test.loc')::uuid),
  2, 'o conjunto ficou exatamente com as 2 marcadas');

-- substituição de conjunto: desmarcar tem que apagar
select lives_ok(
  format($$ select public.operator_set_location_amenities(%L::uuid, array['valet']) $$, current_setting('test.loc')),
  'grava um conjunto menor');
select is(
  (select string_agg(amenity_code, ',' order by amenity_code) from public.location_amenity where location_id = current_setting('test.loc')::uuid),
  'valet', 'cameras_24h foi removido, sobrou só valet');

-- lista vazia limpa tudo
select lives_ok(
  format($$ select public.operator_set_location_amenities(%L::uuid, array[]::text[]) $$, current_setting('test.loc')),
  'lista vazia é válida');
select is(
  (select count(*)::int from public.location_amenity where location_id = current_setting('test.loc')::uuid),
  0, 'lista vazia apaga todas');

-- código fora do catálogo é erro, não silêncio
select throws_ok(
  format($$ select public.operator_set_location_amenities(%L::uuid, array['nao_existe']) $$, current_setting('test.loc')),
  'P0001', null, 'código fora do catálogo é rejeitado');
reset role;

-- operador de OUTRA empresa: nem pela RPC, nem direto na tabela
do $$
declare ux uuid := gen_random_uuid(); v_other uuid;
begin
  insert into public.company(id, name, slug)
    values (gen_random_uuid(), 'Empresa X do teste', 'empresa-x-teste-'||substr(gen_random_uuid()::text,1,8))
    returning id into v_other;
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (ux,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','am-outra@ex.com',now(),now());
  insert into public.profiles(id, role) values (ux,'company_operator') on conflict (id) do nothing;
  insert into public.profile_company(profile_id, company_id, role) values (ux, v_other, 'owner');
  perform set_config('test.ux', ux::text, false);
end $$;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.ux'))::text, true);

select throws_ok(
  format($$ select public.operator_set_location_amenities(%L::uuid, array['valet']) $$, current_setting('test.loc')),
  '42501', null, 'operador de outra empresa é barrado pela RPC');

-- e o RLS direto também barra (o furo que a migration fechou): sem locations:write
-- na empresa dona, o insert não passa
select throws_ok(
  format($$ insert into public.location_amenity(location_id, amenity_code) values (%L::uuid, 'valet') $$, current_setting('test.loc')),
  '42501', null, 'insert direto de outra empresa é barrado pelo RLS');
reset role;

select * from finish();
rollback;
