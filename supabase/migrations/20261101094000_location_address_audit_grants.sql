-- Auditoria de endereço: fechar as funções internas para anon e authenticated.
-- Spec: docs/specs/auditoria-enderecos.md
--
-- O `revoke all from public` das migrations anteriores não bastou. O Supabase concede EXECUTE
-- por default privilege a `anon`, `authenticated` e `service_role` em toda função nova, e um
-- revoke de PUBLIC não desfaz grant explícito de role. O advisor de segurança pegou:
-- `location_address_audit_record` ficou chamável por `anon` via /rest/v1/rpc, e ela GRAVA. Um
-- anônimo poderia carimbar veredito falso em qualquer unidade, inclusive um "ok" que faria a
-- auditoria parar de reclamar de um endereço errado.
--
-- Quem chama estas quatro é a Edge (service_role) e o cron. As `manager_*` continuam abertas a
-- `authenticated` de propósito: elas são a tela, e o gate é o `is_hub_admin()` de dentro.

revoke execute on function public.location_address_scan() from anon, authenticated;

revoke execute on function public.location_address_audit_record(
  uuid, text, text, text, text, numeric, numeric, text, text, numeric, text
) from anon, authenticated;

revoke execute on function public.location_address_audit_queue(integer) from anon, authenticated;

-- Função de trigger: PostgREST não a expõe de forma útil, mas EXECUTE aqui não tem dono.
revoke execute on function public.location_address_audit_invalidate() from public, anon, authenticated;

-- A política de limiares é leitura de config interna, e app_setting já é privada.
revoke execute on function public.location_address_audit_policy() from anon;
