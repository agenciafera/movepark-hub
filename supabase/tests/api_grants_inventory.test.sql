-- pgTAP: inventário de grants da Public API. Ver public-api.md §12 e ADR-005.
--
-- Por que inventário e não uma asserção por função: o `anon_privileged_rpcs.test.sql`
-- lista função por função, e uma `api_*` nova simplesmente não aparece lá. Aqui as
-- asserções varrem o conjunto inteiro, então a função criada amanhã já nasce coberta.
--
-- O risco que isto fecha é o default do Postgres: função nova no schema `public`
-- nasce executável por PUBLIC, e no Supabase `anon` e `authenticated` herdam isso.
-- Esquecer o `revoke` numa migration é silencioso, e o efeito é a Public API inteira
-- alcançável sem chave, direto do navegador com a anon key (que é pública por design).

begin;
select plan(5);

-- Piso de sanidade: sem ele, uma renomeação em massa faria as asserções abaixo
-- passarem sobre um conjunto vazio, e o arquivo viraria decoração.
select cmp_ok(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'api\_%'),
  '>=', 30,
  'o catálogo tem pelo menos 30 funções api_* (guarda contra teste vácuo)'
);

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'api\_%'
      and has_function_privilege('anon', p.oid, 'EXECUTE')),
  0,
  'nenhuma api_* é executável por anon'
);

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'api\_%'
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  0,
  'nenhuma api_* é executável por authenticated'
);

-- Uma api_* sem SECURITY DEFINER roda com os direitos de quem chamou. Como o gateway
-- chama por service_role, nada quebraria de imediato: o teste é o que denuncia.
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'api\_%' and not p.prosecdef),
  0,
  'toda api_* é SECURITY DEFINER'
);

-- O outro lado da moeda: revogar demais também quebra, e sem erro visível no front
-- (a falha aparece só na chamada da chave de API).
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'api\_%'
      and not has_function_privilege('service_role', p.oid, 'EXECUTE')),
  0,
  'toda api_* continua executável por service_role (quem o gateway usa)'
);

select * from finish();
rollback;
