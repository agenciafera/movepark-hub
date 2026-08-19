-- pgTAP: catálogo "Vaga Avulsa" + RLS de escrita em company_parking_type/location_parking_type.
--
-- Antes de 20260819203903_vaga_avulsa_parking_type.sql, as duas tabelas só tinham policy de
-- LEITURA: mesmo hub_admin editando pela UI do Manager batia em RLS por baixo (0 linhas
-- afetadas em silêncio no update, exceção no insert), sem aviso nenhum na tela. Este teste
-- cobre a lacuna fechada (escopo parking-types:write, mesmo padrão de lpt_operator_update)
-- e o dado da Garageinn.

begin;
select plan(10);

-- catálogo: "avulsa" nasceu com o código e o nome certos -----------------------
select is(
  (select name from public.parking_type where code = 'avulsa'),
  'Vaga Avulsa',
  'catálogo tem o tipo "avulsa" / "Vaga Avulsa"'
);

-- Garageinn: único company_parking_type dela foi reatribuído de uncovered pra avulsa ---
select is(
  (
    select pt.code from public.company_parking_type cpt
    join public.parking_type pt on pt.id = cpt.parking_type_id
    where cpt.id = '69462a09-e46d-4fc3-af0f-29536426af95'
  ),
  'avulsa',
  'Garageinn foi reatribuída de uncovered pra avulsa'
);

-- ── fixtures (como postgres; RLS não se aplica a superuser) ────────────────
-- cpt1: alvo dos testes de UPDATE (reatribuir o tipo). cpt2/cpt3: alvos distintos dos
-- testes de INSERT em location_parking_type, pra não colidir no unique(location_id,
-- company_parking_type_id) entre o insert que passa (manager) e o que é barrado (operator).
do $$
declare
  u_manager uuid := gen_random_uuid();   -- role=manager na empresa: tem parking-types:write
  u_operator uuid := gen_random_uuid();  -- role=operator na empresa: NÃO tem o escopo
  u_stranger uuid := gen_random_uuid();  -- customer sem vínculo nenhum com a empresa
  cid uuid;
  v_loc uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (u_manager,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','pt-rls-manager@ex.com',now(),now()),
    (u_operator,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','pt-rls-operator@ex.com',now(),now()),
    (u_stranger,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','pt-rls-stranger@ex.com',now(),now());
  -- do update, não do nothing: o trigger on_auth_user_created já criou a linha (banco vivo
  -- tem o schema auth; CI/local não, e lá o insert "funciona por acidente" — ver
  -- [[fixture-pgtap-profiles-hub-admin]]). Sem o update, quem já nasceu com o role certo
  -- (customer) não denuncia nada, mas o hub_admin abaixo ficaria preso em customer.
  insert into public.profiles(id, role) values
    (u_manager,'customer'),(u_operator,'customer'),(u_stranger,'customer')
    on conflict (id) do update set role = excluded.role;

  cid := public.submit_partner_lead('PT RLS Parceira', 'Dono PT RLS', 'pt-rls-owner@ex.com', '+5511999990001');
  insert into public.profile_company(profile_id, company_id, role) values
    (u_manager, cid, 'manager'),
    (u_operator, cid, 'operator');

  insert into public.location (company_id, name, slug) values (cid, 'PT RLS Unidade', 'pt-rls-unidade')
    returning id into v_loc;

  insert into public.company_parking_type (id, company_id, parking_type_id, base_price, default_capacity)
  values
    ('00000000-0000-4000-8000-0000000000c1'::uuid, cid, (select id from public.parking_type where code = 'covered'), 0, 10),
    ('00000000-0000-4000-8000-0000000000c2'::uuid, cid, (select id from public.parking_type where code = 'valet'), 0, 10),
    ('00000000-0000-4000-8000-0000000000c3'::uuid, cid, (select id from public.parking_type where code = 'premium'), 0, 10);

  perform set_config('test.pt_rls.u_manager', u_manager::text, false);
  perform set_config('test.pt_rls.u_operator', u_operator::text, false);
  perform set_config('test.pt_rls.u_stranger', u_stranger::text, false);
  perform set_config('test.pt_rls.cid', cid::text, false);
  perform set_config('test.pt_rls.loc', v_loc::text, false);
end $$;

create or replace function pg_temp.as_user(p_uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid)::text, true);
end $$;

-- ── manager (tem parking-types:write): reatribui o tipo da própria empresa ──
set local role authenticated;
select pg_temp.as_user(current_setting('test.pt_rls.u_manager'));
update public.company_parking_type set parking_type_id = (select id from public.parking_type where code = 'avulsa')
  where id = '00000000-0000-4000-8000-0000000000c1'::uuid;
reset role;
select is(
  (select code from public.parking_type pt join public.company_parking_type cpt on cpt.parking_type_id = pt.id
   where cpt.id = '00000000-0000-4000-8000-0000000000c1'::uuid),
  'avulsa',
  'manager com parking-types:write reatribui o tipo da própria empresa'
);

-- ── operator (NÃO tem parking-types:write): update não pega nenhuma linha ──
set local role authenticated;
select pg_temp.as_user(current_setting('test.pt_rls.u_operator'));
update public.company_parking_type set parking_type_id = (select id from public.parking_type where code = 'garage')
  where id = '00000000-0000-4000-8000-0000000000c1'::uuid;
reset role;
select is(
  (select code from public.parking_type pt join public.company_parking_type cpt on cpt.parking_type_id = pt.id
   where cpt.id = '00000000-0000-4000-8000-0000000000c1'::uuid),
  'avulsa',
  'operator sem o escopo NÃO reatribui (update de RLS não pega a linha, continua avulsa)'
);

-- ── stranger (sem vínculo): idem, update vira no-op ─────────────────────────
set local role authenticated;
select pg_temp.as_user(current_setting('test.pt_rls.u_stranger'));
update public.company_parking_type set parking_type_id = (select id from public.parking_type where code = 'garage')
  where id = '00000000-0000-4000-8000-0000000000c1'::uuid;
reset role;
select is(
  (select code from public.parking_type pt join public.company_parking_type cpt on cpt.parking_type_id = pt.id
   where cpt.id = '00000000-0000-4000-8000-0000000000c1'::uuid),
  'avulsa',
  'customer sem vínculo com a empresa NÃO reatribui'
);

-- ── manager: insert de um tipo novo pra empresa passa ───────────────────────
set local role authenticated;
select pg_temp.as_user(current_setting('test.pt_rls.u_manager'));
select lives_ok(
  format(
    $sql$ insert into public.company_parking_type (company_id, parking_type_id, base_price, default_capacity)
          values (%L, (select id from public.parking_type where code = 'motorcycle'), 0, 5) $sql$,
    current_setting('test.pt_rls.cid')
  ),
  'manager com parking-types:write habilita um tipo novo pra empresa (insert)'
);
reset role;

-- ── operator: insert em company_parking_type é barrado pela policy ─────────
-- code 'garage': tem que ser um tipo que a empresa ainda não tem, senão o insert bloqueado
-- vira unique_violation (company_id, parking_type_id) em vez de testar a RLS de verdade —
-- 'avulsa' já está em uso por cpt1 desde o update do teste anterior.
set local role authenticated;
select pg_temp.as_user(current_setting('test.pt_rls.u_operator'));
select throws_ok(
  format(
    $sql$ insert into public.company_parking_type (company_id, parking_type_id, base_price, default_capacity)
          values (%L, (select id from public.parking_type where code = 'garage'), 0, 5) $sql$,
    current_setting('test.pt_rls.cid')
  ),
  '42501',
  null,
  'operator sem o escopo NÃO habilita tipo novo (insert barrado pela RLS)'
);
reset role;

-- ── manager: insert em location_parking_type (associar tipo cpt2 à unidade) passa ──
set local role authenticated;
select pg_temp.as_user(current_setting('test.pt_rls.u_manager'));
select lives_ok(
  format(
    $sql$ insert into public.location_parking_type (location_id, company_parking_type_id, capacity)
          values (%L, '00000000-0000-4000-8000-0000000000c2'::uuid, 5) $sql$,
    current_setting('test.pt_rls.loc')
  ),
  'manager com parking-types:write associa um tipo a uma unidade da própria empresa (insert)'
);
reset role;

-- ── operator: insert em location_parking_type (cpt3, outro par) é barrado ──
set local role authenticated;
select pg_temp.as_user(current_setting('test.pt_rls.u_operator'));
select throws_ok(
  format(
    $sql$ insert into public.location_parking_type (location_id, company_parking_type_id, capacity)
          values (%L, '00000000-0000-4000-8000-0000000000c3'::uuid, 5) $sql$,
    current_setting('test.pt_rls.loc')
  ),
  '42501',
  null,
  'operator sem o escopo NÃO associa tipo a unidade (insert barrado pela RLS)'
);
reset role;

-- ── hub_admin: reatribui o tipo de QUALQUER empresa ─────────────────────────
-- code 'uncovered': é o único dos 7 que ninguém pegou até aqui (cpt1..3 + o insert do
-- teste 6 já usam avulsa/valet/premium/motorcycle) — mesma armadilha do unique(company_id,
-- parking_type_id) do teste anterior, e essa reatribuição PRECISA funcionar de verdade
-- (é o hub_admin, sem o bug do RLS mascarando um unique_violation atrás de outro).
do $$
declare ua uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (ua,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','pt-rls-admin@ex.com',now(),now());
  insert into public.profiles(id, role) values (ua,'hub_admin')
    on conflict (id) do update set role = excluded.role;
  perform set_config('test.pt_rls.ua', ua::text, false);
end $$;
set local role authenticated;
select pg_temp.as_user(current_setting('test.pt_rls.ua'));
update public.company_parking_type set parking_type_id = (select id from public.parking_type where code = 'uncovered')
  where id = '00000000-0000-4000-8000-0000000000c1'::uuid;
reset role;
select is(
  (select code from public.parking_type pt join public.company_parking_type cpt on cpt.parking_type_id = pt.id
   where cpt.id = '00000000-0000-4000-8000-0000000000c1'::uuid),
  'uncovered',
  'hub_admin reatribui o tipo de qualquer empresa, mesmo sem vínculo'
);

select * from finish();
rollback;
