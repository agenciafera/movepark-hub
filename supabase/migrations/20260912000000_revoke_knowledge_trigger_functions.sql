-- E0.6 · Hardening: revoga EXECUTE de anon/authenticated das funções-trigger da base de
-- conhecimento (E3.3), que entraram em 20260910010000_knowledge_queue.sql sem o revoke.
--
-- Causa-raiz (a mesma de 20260725 / 20260807000000 / 20260807000001 / 20260807000002): no
-- Supabase, função nova no schema public nasce com EXECUTE concedido a anon/authenticated por
-- default privilege. `revoke ... from public` NÃO resolve: o grant é nominal, então a revogação
-- também precisa ser nominal. As RPCs daquela migration (enqueue_knowledge_resync,
-- knowledge_queue_claim, match_knowledge) já vieram com o revoke correto; as três funções-trigger
-- que enfileiram resync ficaram de fora e reabriram a invariante do pgTAP
-- anon_privileged_rpcs.test.sql ("nenhuma função-trigger é executável por anon ou authenticated").
--
-- Revogar é 100% seguro: o trigger dispara com o contexto do dono da tabela, o grant de EXECUTE
-- só governa chamada DIRETA (via PostgREST), que nunca deve existir para função-trigger.
revoke all on function public.faq_enqueue_knowledge() from public, anon, authenticated;
revoke all on function public.location_enqueue_knowledge() from public, anon, authenticated;
revoke all on function public.location_amenity_enqueue_knowledge() from public, anon, authenticated;

-- Varredura de fechamento (molde de 20260807000002): pega qualquer outra função-trigger em public
-- que tenha reganhado o grant default desde a última passada. Idempotente.
do $$
declare r record;
begin
  for r in
    select 'public.' || quote_ident(p.proname) || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_type t on t.oid = p.prorettype
    where n.nspname = 'public' and t.typname = 'trigger'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;
