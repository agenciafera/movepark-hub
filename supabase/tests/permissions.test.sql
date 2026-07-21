begin;
select plan(12);

-- Estrutura (ADR-005) --------------------------------------------------------
select has_table('public', 'company_role_scope', 'tabela company_role_scope existe');
select has_column('public', 'api_scope', 'assignable_to_api_key', 'flag assignable_to_api_key existe');
select has_function('public', 'member_has_scope', ARRAY['uuid', 'text'], 'member_has_scope(uuid,text) existe');
select has_function('public', 'current_member_scopes', ARRAY['uuid'], 'current_member_scopes(uuid) existe');

-- Enum com os 4 papéis fixos -------------------------------------------------
select is(
  (select count(*)::int from unnest(enum_range(null::public.company_role)) r
   where r::text in ('owner','manager','operator','finance')),
  4, 'company_role tem owner/manager/operator/finance'
);

-- Integridade do seed: todo escopo de preset existe no catálogo --------------
select is(
  (select count(*)::int from public.company_role_scope crs
   left join public.api_scope s on s.scope = crs.scope where s.scope is null),
  0, 'todo company_role_scope.scope existe em api_scope'
);

-- owner = catálogo de EMPRESA ------------------------------------------------
-- A invariante do ADR-005 ("o Dono tem tudo") vale sobre os escopos de empresa, não sobre o
-- catálogo inteiro. Escopo de plataforma (is_platform_scope) é da Movepark, não de parceiro: o
-- checkout:link é do bot que gera link de checkout, e nenhum Dono de estacionamento o exerce.
-- assignable_to_api_key não serve de discriminador aqui, porque o checkout:link É atribuído a uma
-- chave de API (a do bot) e tem a flag true com razão. Ver 86ajmx4yc.
select is(
  (select count(*)::int from public.company_role_scope where role = 'owner'),
  (select count(*)::int from public.api_scope where not is_platform_scope),
  'owner recebe todos os escopos de EMPRESA do catálogo'
);

-- Escopo de plataforma não vaza para papel de empresa (guard por trigger) -----
select is(
  (select count(*)::int from public.company_role_scope crs
   join public.api_scope s on s.scope = crs.scope
   where s.is_platform_scope),
  0, 'nenhum escopo de plataforma foi concedido a papel de empresa'
);

-- Presets restritivos: papéis não-Dono NÃO têm os escopos sensíveis ----------
select is(
  (select count(*)::int from public.company_role_scope
   where role in ('manager','operator','finance')
     and scope in ('team:write','api-keys:write','payouts:write')),
  0, 'manager/operator/finance não têm team:write/api-keys:write/payouts:write'
);

-- Operação tem reservas+checkin mas NÃO preços/financeiro --------------------
select ok(
  exists(select 1 from public.company_role_scope where role='operator' and scope='bookings:checkin')
  and not exists(select 1 from public.company_role_scope where role='operator' and scope='pricing:write')
  and not exists(select 1 from public.company_role_scope where role='operator' and scope='finance:read'),
  'operator: bookings:checkin sim; pricing:write/finance:read não'
);

-- Financeiro tem finance:read mas NÃO catálogo de escrita --------------------
select ok(
  exists(select 1 from public.company_role_scope where role='finance' and scope='finance:read')
  and not exists(select 1 from public.company_role_scope where role='finance' and scope='locations:write'),
  'finance: finance:read sim; locations:write não'
);

-- Escopos só-internos não são atribuíveis a chave de API ---------------------
select is(
  (select count(*)::int from public.api_scope
   where scope in ('team:write','api-keys:write','finance:read','payouts:read','payouts:write')
     and assignable_to_api_key = true),
  0, 'escopos só-internos têm assignable_to_api_key = false'
);

select * from finish();
rollback;
