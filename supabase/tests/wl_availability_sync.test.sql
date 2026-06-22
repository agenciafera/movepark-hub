begin;
select plan(4);

-- Mapa de SKU no tipo de vaga
select has_column('public', 'location_parking_type', 'wl_category_slug', 'lpt.wl_category_slug existe');
select has_column('public', 'location_parking_type', 'wl_product_slug', 'lpt.wl_product_slug existe');

-- RPC de config gateada
select has_function('public', 'wl_company_config', ARRAY['uuid'], 'wl_company_config(uuid) existe');

-- Anônimo não executa a RPC (revoke do public)
select function_privs_are(
  'public', 'wl_company_config', ARRAY['uuid'], 'anon', ARRAY[]::text[],
  'anon não tem EXECUTE em wl_company_config'
);

select * from finish();
rollback;
