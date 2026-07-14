-- E0.6 · Hardening: funções-trigger não devem ter EXECUTE para anon/authenticated.
--
-- Causa-raiz (mesma de 20260725/20260807000000): o baseline concede EXECUTE default a
-- anon/authenticated em TODA função nova. Isso é intencional para RPCs client-facing (o front
-- chama simulate_price/operator_* com a anon key / JWT), MAS funções-trigger (returns trigger)
-- nunca são chamadas diretamente por RPC — só disparam por gatilho, com o contexto do dono da
-- tabela, independente do grant de EXECUTE. Deixá-las com grant a anon/authenticated é só
-- superfície morta (chamá-las via PostgREST erra em "record NEW não atribuído", mas não deveriam
-- nem estar expostas). Revogar é 100% seguro: NÃO afeta o disparo do trigger.
--
-- Escopo: SÓ funções `returns trigger` em public. Não toca RPCs client-facing (essas mantêm o
-- grant que o front precisa). Regressão coberta no pgTAP anon_privileged_rpcs.test.sql.
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
    execute format('revoke execute on function %s from anon, authenticated', r.sig);
  end loop;
end $$;
