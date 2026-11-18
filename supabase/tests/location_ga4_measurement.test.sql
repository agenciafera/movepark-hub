-- pgTAP: ID do GA4 do parceiro por unidade.
-- Spec: docs/specs/analytics-ecommerce.md §3.2
--
-- O que este arquivo protege: para qual propriedade do GA4 vai a cópia do funil de uma unidade é
-- configuração de mídia da plataforma. Quem tem `locations:write` edita a unidade inteira pelo
-- PostgREST, então a barreira que vale é a do banco. E o valor tem formato fechado, porque id
-- errado aqui vira tag que dispara e não registra nada, em silêncio (foi o que aconteceu com o id
-- do Ads até 18/11/2026).

begin;
select plan(14);

-- ── fixtures (como postgres; RLS não se aplica) ────────────────────────────
do $$
declare
  v_admin uuid := gen_random_uuid();
  v_gerente uuid := gen_random_uuid();
  v_company uuid;
  v_loc uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (v_admin,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','ga4-admin@ex.com',now(),now()),
    (v_gerente,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','ga4-gerente@ex.com',now(),now());
  insert into public.profiles(id, role) values
    (v_admin,'hub_admin'), (v_gerente,'company_operator')
    on conflict (id) do update set role = excluded.role;

  insert into public.company(name, slug) values ('GA4 Parceiro','ga4-parceiro')
    returning id into v_company;

  insert into public.profile_company(profile_id, company_id, role)
    values (v_gerente, v_company, 'manager');

  insert into public.location(company_id, name, slug)
    values (v_company, 'GA4 Unidade', 'ga4-unidade') returning id into v_loc;

  perform set_config('test.admin', v_admin::text, false);
  perform set_config('test.gerente', v_gerente::text, false);
  perform set_config('test.loc', v_loc::text, false);
end $$;

create or replace function pg_temp.as_user(p_uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

-- ── estrutura ──────────────────────────────────────────────────────────────
select has_column('public','location','ga4_measurement_id','location.ga4_measurement_id existe');

select is(
  (select ga4_measurement_id from public.location where id = current_setting('test.loc')::uuid),
  null, 'unidade nasce sem GA4 de parceiro'
);

select ok(
  not has_function_privilege('authenticated', 'public.location_ga4_measurement_guard()', 'EXECUTE'),
  'authenticated não executa a função-trigger'
);
select ok(
  not has_function_privilege('anon', 'public.location_ga4_measurement_guard()', 'EXECUTE'),
  'anon não executa a função-trigger'
);

-- ── formato fechado ────────────────────────────────────────────────────────
select throws_ok(
  format($$ update public.location set ga4_measurement_id = 'AW-17302388529' where id = %L $$, current_setting('test.loc')),
  '23514', null, 'id de tag do Google Ads no campo do GA4 é recusado'
);
select throws_ok(
  format($$ update public.location set ga4_measurement_id = 'GTM-KHBBZT9' where id = %L $$, current_setting('test.loc')),
  '23514', null, 'id de container do GTM é recusado'
);
select throws_ok(
  format($$ update public.location set ga4_measurement_id = 'UA-12345678-1' where id = %L $$, current_setting('test.loc')),
  '23514', null, 'id do Universal Analytics é recusado'
);
select throws_ok(
  format($$ update public.location set ga4_measurement_id = '284173242' where id = %L $$, current_setting('test.loc')),
  '23514', null, 'id numérico da propriedade é recusado: o campo é o ID da métrica'
);
select throws_ok(
  format($$ update public.location set ga4_measurement_id = 'g-l99117rgey' where id = %L $$, current_setting('test.loc')),
  '23514', null, 'minúsculo é recusado: o formulário normaliza, o banco não adivinha'
);

-- ── quem configura ─────────────────────────────────────────────────────────
-- O gerente tem locations:write e edita a unidade, mas não aponta o funil para propriedade nenhuma.
select pg_temp.as_user(current_setting('test.gerente'));
select throws_ok(
  format($$ update public.location set ga4_measurement_id = 'G-ABC123DEF4' where id = %L $$, current_setting('test.loc')),
  '42501', null, 'parceiro com locations:write não configura o GA4'
);

select pg_temp.as_user(current_setting('test.admin'));
select lives_ok(
  format($$ update public.location set ga4_measurement_id = 'G-ABC123DEF4' where id = %L $$, current_setting('test.loc')),
  'hub_admin configura o ID do GA4'
);
select is(
  (select ga4_measurement_id from public.location where id = current_setting('test.loc')::uuid),
  'G-ABC123DEF4', 'o id gravou'
);

-- Update que não toca a coluna passa por qualquer um: o trigger recusa a MUDANÇA, não a edição.
select pg_temp.as_user(current_setting('test.gerente'));
select lives_ok(
  format($$ update public.location set name = 'GA4 Unidade renomeada' where id = %L $$, current_setting('test.loc')),
  'com o GA4 configurado, o parceiro segue editando o resto da unidade'
);
select throws_ok(
  format($$ update public.location set ga4_measurement_id = null where id = %L $$, current_setting('test.loc')),
  '42501', null, 'o parceiro também não apaga a configuração'
);

select * from finish();
rollback;
