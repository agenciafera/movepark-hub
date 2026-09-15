-- Revoga de novo o EXECUTE das funções-trigger, agora as criadas DEPOIS de 20260807000002.
--
-- Aquela migration varreu o schema uma vez, e o problema volta sozinho: função nova no `public`
-- nasce com EXECUTE para PUBLIC (e daí para anon/authenticated) por default do Postgres. Em
-- 15/09/2026 o inventário `anon_privileged_rpcs` apontou `marketing_guard_system_segment`, criada em
-- `20261029093000_marketing_rfm_growth.sql`, executável por anon e authenticated.
--
-- Revogar é seguro: trigger dispara com o contexto do dono da tabela, e o EXECUTE só governa chamada
-- DIRETA, que não deve existir para função-trigger.
--
-- O laço é o mesmo da 20260807000002, de propósito: é idempotente e pega qualquer outra que tenha
-- entrado no meio. Enquanto o guarda do inventário roda no CI, a reincidência aparece no dia.

do $$
declare r record;
begin
  for r in
    select 'public.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_type t on t.oid = p.prorettype
    where n.nspname = 'public' and t.typname = 'trigger'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;
