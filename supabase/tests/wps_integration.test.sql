begin;
select plan(11);

-- Schema inbound
select has_table('public', 'wps_event', 'tabela wps_event existe');
select has_function('public', 'api_wps_event',
  ARRAY['uuid', 'text', 'text', 'text', 'text', 'text', 'timestamptz'],
  'api_wps_event(...) existe');
select col_is_unique('public', 'wps_event', ARRAY['company_id', 'external_event_id'],
  'wps_event é único por (company_id, external_event_id) — idempotência');

-- Mapeamento
select has_column('public', 'location', 'external_ref', 'location.external_ref existe');
select has_column('public', 'vehicle', 'plate_normalized', 'vehicle.plate_normalized existe');

-- Escopo da Public API
select results_eq(
  $$ select count(*)::int from public.api_scope where scope = 'wps:write' $$,
  $$ values (1) $$,
  'escopo wps:write registrado em api_scope'
);

-- Outbound
select has_table('public', 'wps_delivery', 'tabela wps_delivery existe');
select col_is_unique('public', 'wps_delivery', ARRAY['event_id'], 'wps_delivery.event_id é único');
select has_column('public', 'company', 'wps_webhook_url', 'company.wps_webhook_url existe');

-- anon não executa a RPC
select function_privs_are(
  'public', 'api_wps_event',
  ARRAY['uuid', 'text', 'text', 'text', 'text', 'text', 'timestamptz'],
  'anon', ARRAY[]::text[], 'anon não tem EXECUTE em api_wps_event'
);

-- CHECK: não dá pra ligar o webhook sem url+secret
select throws_ok(
  $$ insert into public.company (name, slug, wps_webhook_enabled)
     values ('WPS x', 'wps-check', true) $$,
  '23514', null, 'ligar wps_webhook_enabled sem url/secret viola o CHECK'
);

select * from finish();
rollback;
