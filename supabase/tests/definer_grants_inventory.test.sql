-- pgTAP: inventário de grants das funções SECURITY DEFINER do schema `public`.
-- Ver ADR-005, public-api.md §12 e o irmão api_grants_inventory.test.sql.
--
-- O `api_grants_inventory` varre o recorte `api_*`, e o `anon_privileged_rpcs` lista
-- função por função. Sobrava o meio de campo: a função SECURITY DEFINER que não começa
-- com `api_` e que ninguém pensou em listar. Ela é a mais perigosa das três famílias,
-- porque definer roda com os direitos do dono, ou seja, ignora RLS. Se `anon` alcança
-- uma delas, alcança pela anon key, que vai embutida no bundle do front.
--
-- O risco que isto fecha é o default do Postgres somado ao do Supabase: função nova no
-- schema `public` nasce com EXECUTE para `anon` e `authenticated`, e um `grant ... to
-- authenticated` no fim da migration NÃO desfaz isso. Esquecer o `revoke` é silencioso.
-- Foi assim que as quatro RPCs do motor de crescimento ficaram abertas no repo enquanto
-- produção estava fechada (corrigido em 20260923000000).
--
-- A lista abaixo foi medida contra o banco vivo em leitura antes de virar arquivo.

begin;
select plan(3);

-- Piso de sanidade: sem ele, um schema meio migrado faria as asserções passarem sobre
-- um conjunto vazio, e o arquivo viraria decoração.
select cmp_ok(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef),
  '>=', 150,
  'o schema public tem pelo menos 150 funções SECURITY DEFINER (guarda contra teste vácuo)'
);

-- ── as definer que anon PODE chamar ──────────────────────────────────────────
-- A lista é EXATA nos dois sentidos, e é essa a graça:
--   entrar sem estar aqui  → `revoke` esquecido numa migration, que é o caso comum;
--   sair daqui             → alguém fechou um helper de RLS ou do catálogo público, e
--                            a vitrine anônima quebra com "permission denied for function".
--
-- O que legitima cada uma: helper chamado DENTRO de policy RLS (is_hub_admin,
-- current_company_ids, member_has_scope, current_user_role, current_owner_company_ids),
-- ou leitura de catálogo/preço que a vitrine anônima faz antes de qualquer login.
select set_eq(
  $$ select p.proname::text
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef
        and has_function_privilege('anon', p.oid, 'execute') $$,
  array[
    -- helpers usados dentro de policies RLS (fechar quebra o SELECT anônimo)
    'is_hub_admin',
    'current_company_ids',
    'current_owner_company_ids',
    'current_user_role',
    'member_has_scope',
    -- catálogo e disponibilidade da vitrine pública
    'availability_batch',
    'check_availability',
    'get_pricing_data',
    'get_unit_fares',
    'locations_high_demand_today',
    'popular_locations',
    'popular_parking_types',
    'simulate_price',
    -- cupom e desconto avaliados antes do login, no checkout
    'coupon_evaluate',
    'discount_evaluate',
    'validate_coupon',
    'validate_coupon_public',
    -- restante da superfície pública
    'external_checkout_url',    -- URL de saída do white-label, nada sensível
    'get_booking_hold_max_minutes',
    'get_current_legal_document',
    'match_knowledge'           -- busca semântica da base de conhecimento
  ],
  'as SECURITY DEFINER alcançáveis por anon são exatamente estas 21'
);

-- ── nenhuma rotina de cron é chamável pela anon key ──────────────────────────
-- Elas mutam estado (expiram reserva, completam booking, podam log) e quem as dispara
-- é o pg_cron ou uma Edge com service_role. Chamada anônima seria mutação sem dono.
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'cron\_%'
      and has_function_privilege('anon', p.oid, 'execute')),
  0,
  'nenhuma função cron_* é executável por anon'
);

select * from finish();
rollback;
