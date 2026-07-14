-- E0.6 · Scan de segurança #2 — regressão de grant em função api_* (Broken Access Control / IDOR).
--
-- Contexto: 20260715000001 já revogou EXECUTE de anon+authenticated de TODAS as api_* (são
-- SECURITY DEFINER que confiam no company_id vindo do gateway, SEM checar auth.uid()). Mas o
-- baseline tem `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO anon` (e authenticated),
-- então TODA função recriada reganha o grant direto. `api_create_booking` foi recriada em
-- 20260717000000 (fare_tiers, novo parâmetro fare_tier) DEPOIS daquela varredura, reabrindo o
-- EXECUTE para `authenticated`; a varredura de 20260725000000 revogou só de `anon`, deixando
-- `authenticated` de propósito (racional válido para operator_*/helpers com guarda auth.uid(),
-- MAS errado para api_create_booking, que não tem guarda de identidade).
--
-- Impacto (antes deste fix): qualquer usuário logado (o login do consumidor é passwordless) podia
-- chamar /rest/v1/rpc/api_create_booking com um company_id + location_parking_type_id arbitrários
-- (ambos descobríveis no catálogo público) e criar reservas na capacidade de QUALQUER empresa,
-- sem chave de API, sem escopo bookings:write, burlando o gateway. Vetor de exaustão de
-- capacidade e reservas-lixo cross-tenant.
--
-- Fix: re-varre e revoga EXECUTE de anon+authenticated em todas as api_* (o gateway/MCP usa
-- service_role — nada perde função). A regressão futura é coberta pelo pgTAP
-- anon_privileged_rpcs.test.sql (agora também assere `authenticated`).
do $$
declare r record;
begin
  for r in
    select 'public.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'api\_%'
  loop
    execute format('revoke execute on function %s from anon, authenticated', r.sig);
  end loop;
end $$;
