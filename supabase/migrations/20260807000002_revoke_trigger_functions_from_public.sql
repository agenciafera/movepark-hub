-- E0.6 · Hardening (continuação de 20260807000001): revoga também o grant PUBLIC das
-- funções-trigger. A 001 revogou anon/authenticated, mas 5 triggers ainda tinham o grant
-- default do Postgres para PUBLIC (=X/postgres), então anon/authenticated continuavam com
-- EXECUTE por herança de PUBLIC. Revogar de PUBLIC é seguro: trigger dispara com o contexto do
-- dono da tabela, o grant de EXECUTE só governa chamada DIRETA (que não deve existir para trigger).
-- Reafirma anon/authenticated por idempotência. Escopo: só `returns trigger`.
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
