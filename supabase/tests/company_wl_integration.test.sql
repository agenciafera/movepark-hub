begin;
select plan(5);

-- Colunas de integração WL existem
select has_column('public', 'company', 'wl_domain', 'company.wl_domain existe');
select has_column('public', 'company', 'wl_tenant_key', 'company.wl_tenant_key existe');
select has_column('public', 'company', 'wl_sync_enabled', 'company.wl_sync_enabled existe');

-- Default desligado
select results_eq(
  $$ select column_default like '%false%' from information_schema.columns
     where table_name='company' and column_name='wl_sync_enabled' $$,
  $$ values (true) $$,
  'wl_sync_enabled default false'
);

-- Não dá pra ligar a sync sem URL + tenant (CHECK company_wl_sync_requires_config)
select throws_ok(
  $$ insert into public.company (name, slug, contact_name, contact_email, contact_phone, wl_sync_enabled)
     values ('WL Test', 'wl-test-cfg', 'x', 'x@x.co', '11999999999', true) $$,
  '23514',
  null,
  'ligar wl_sync_enabled sem wl_base_url/wl_tenant_key viola o CHECK'
);

select * from finish();
rollback;
