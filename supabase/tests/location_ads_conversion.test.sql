-- pgTAP: conversão do Google Ads por unidade.
-- Spec: docs/specs/analytics-ecommerce.md §3.1
--
-- O que este arquivo protege: a conta de Ads que recebe a conversão de uma unidade é configuração
-- de mídia paga da plataforma. Quem tem `locations:write` edita a unidade inteira pelo PostgREST,
-- então a única barreira que vale é a do banco; e os dois valores têm formato fechado, porque
-- texto errado aqui vira tag que dispara e não registra nada, em silêncio.

begin;
select plan(13);

-- ── fixtures (como postgres; RLS não se aplica) ────────────────────────────
do $$
declare
  v_admin uuid := gen_random_uuid();
  v_gerente uuid := gen_random_uuid();
  v_company uuid;
  v_loc uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (v_admin,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','ads-admin@ex.com',now(),now()),
    (v_gerente,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','ads-gerente@ex.com',now(),now());
  insert into public.profiles(id, role) values
    (v_admin,'hub_admin'), (v_gerente,'company_operator')
    on conflict (id) do update set role = excluded.role;

  insert into public.company(name, slug) values ('Ads Parceiro','ads-parceiro')
    returning id into v_company;

  insert into public.profile_company(profile_id, company_id, role)
    values (v_gerente, v_company, 'manager');

  insert into public.location(company_id, name, slug)
    values (v_company, 'Ads Unidade', 'ads-unidade') returning id into v_loc;

  perform set_config('test.admin', v_admin::text, false);
  perform set_config('test.gerente', v_gerente::text, false);
  perform set_config('test.loc', v_loc::text, false);
end $$;

create or replace function pg_temp.as_user(p_uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

-- ── estrutura ──────────────────────────────────────────────────────────────
select has_column('public','location','ads_conversion_id','location.ads_conversion_id existe');
select has_column('public','location','ads_conversion_label','location.ads_conversion_label existe');

select is(
  (select ads_conversion_id from public.location where id = current_setting('test.loc')::uuid),
  null, 'unidade nasce sem conta de Ads de parceiro'
);

select ok(
  not has_function_privilege('authenticated', 'public.location_ads_conversion_guard()', 'EXECUTE'),
  'authenticated não executa a função-trigger'
);

-- ── formato fechado ────────────────────────────────────────────────────────
select throws_ok(
  format($$ update public.location set ads_conversion_id = '326904374', ads_conversion_label = 'EaA6CMu82aYbELbU8JsB' where id = %L $$,
    current_setting('test.loc')),
  '23514', null, 'id sem o prefixo AW- é recusado'
);
select throws_ok(
  format($$ update public.location set ads_conversion_id = 'AW-326904374', ads_conversion_label = 'tem espaço' where id = %L $$,
    current_setting('test.loc')),
  '23514', null, 'rótulo com caractere fora do snippet é recusado'
);
select throws_ok(
  format($$ update public.location set ads_conversion_id = 'AW-326904374' where id = %L $$,
    current_setting('test.loc')),
  '23514', null, 'id sem rótulo é recusado: metade configurada não dispara nada'
);

-- ── quem configura ─────────────────────────────────────────────────────────
-- O gerente tem locations:write e edita a unidade, mas não aponta a conversão para conta nenhuma.
select pg_temp.as_user(current_setting('test.gerente'));
select throws_ok(
  format($$ update public.location set ads_conversion_id = 'AW-326904374', ads_conversion_label = 'EaA6CMu82aYbELbU8JsB' where id = %L $$,
    current_setting('test.loc')),
  '42501', null, 'parceiro com locations:write não configura a conta de Ads'
);

select pg_temp.as_user(current_setting('test.admin'));
select lives_ok(
  format($$ update public.location set ads_conversion_id = 'AW-326904374', ads_conversion_label = 'EaA6CMu82aYbELbU8JsB' where id = %L $$,
    current_setting('test.loc')),
  'hub_admin configura o par'
);
select is(
  (select ads_conversion_label from public.location where id = current_setting('test.loc')::uuid),
  'EaA6CMu82aYbELbU8JsB', 'o rótulo gravou'
);

-- Update que não toca as colunas passa por qualquer um: o trigger recusa a MUDANÇA, não a edição.
select pg_temp.as_user(current_setting('test.gerente'));
select lives_ok(
  format($$ update public.location set name = 'Ads Unidade renomeada' where id = %L $$, current_setting('test.loc')),
  'com a conta configurada, o parceiro segue editando o resto da unidade'
);
select throws_ok(
  format($$ update public.location set ads_conversion_id = null, ads_conversion_label = null where id = %L $$,
    current_setting('test.loc')),
  '42501', null, 'o parceiro também não apaga a configuração'
);

select pg_temp.as_user(current_setting('test.admin'));
select lives_ok(
  format($$ update public.location set ads_conversion_id = null, ads_conversion_label = null where id = %L $$,
    current_setting('test.loc')),
  'hub_admin desliga: os dois nulos juntos passam na constraint do par'
);

select * from finish();
rollback;
