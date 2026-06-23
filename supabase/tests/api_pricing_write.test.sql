-- pgTAP: Public API — escritas de precificação (E1.4.1/E1.4.2). Ver public-api.md §9 / mcp.md §4.
-- api_set_pricing / api_set_date_blocked são keyed por company_id (o gateway já autorizou
-- empresa+escopo) e validam que o tipo de vaga pertence à empresa da chave. Transação + rollback.

begin;
select plan(8);

-- ── existência + grants (escrita só via service_role; nunca anon) ────────────
select has_function('public', 'api_set_pricing', 'api_set_pricing existe');
select has_function('public', 'api_set_date_blocked', 'api_set_date_blocked existe');
select ok(
  has_function_privilege('service_role', 'public.api_set_pricing(uuid,uuid,numeric,jsonb,jsonb)', 'execute'),
  'service_role executa api_set_pricing'
);
select ok(
  not has_function_privilege('anon', 'public.api_set_pricing(uuid,uuid,numeric,jsonb,jsonb)', 'execute'),
  'anon NÃO executa api_set_pricing'
);

-- ── webhooks:write virou escopo interno (não-atribuível a chave) ─────────────
select is(
  (select assignable_to_api_key from public.api_scope where scope = 'webhooks:write'),
  false,
  'webhooks:write não é atribuível a chave de API'
);

-- ── fixture: um tipo de vaga ativo do seed + sua empresa ─────────────────────
do $$
declare v_lpt uuid; v_company uuid;
begin
  select lpt.id, l.company_id into v_lpt, v_company
  from public.location_parking_type lpt
  join public.location l on l.id = lpt.location_id
  where lpt.is_active and lpt.capacity > 0
  limit 1;
  perform set_config('test.lpt', v_lpt::text, false);
  perform set_config('test.company', v_company::text, false);
end $$;

-- ── set_pricing aplica base_price para a empresa dona ────────────────────────
select lives_ok(
  format(
    $q$ select public.api_set_pricing(%L::uuid, %L::uuid, 199.90, '{"strategy":"uniform_by_duration"}'::jsonb, '[]'::jsonb) $q$,
    current_setting('test.company'), current_setting('test.lpt')
  ),
  'api_set_pricing aplica preço para a empresa dona'
);
select is(
  (select cpt.base_price
     from public.company_parking_type cpt
     join public.location_parking_type lpt on lpt.company_parking_type_id = cpt.id
     where lpt.id = current_setting('test.lpt')::uuid),
  199.90::numeric,
  'base_price persistido pela api_set_pricing'
);

-- ── empresa errada → 42501 (guard de tenant) ─────────────────────────────────
select throws_ok(
  format(
    $q$ select public.api_set_pricing(%L::uuid, %L::uuid, 10, '{}'::jsonb, '[]'::jsonb) $q$,
    gen_random_uuid()::text, current_setting('test.lpt')
  ),
  '42501', NULL, 'api_set_pricing nega lpt de outra empresa'
);

select * from finish();
rollback;
