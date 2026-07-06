-- Complemento de 20260725000000: is_company_owner e current_member_scopes ainda tinham
-- EXECUTE via grant a PUBLIC (grantee vazio no ACL), então `revoke ... from anon` era no-op
-- (o privilégio vinha de PUBLIC, não do grant direto ao anon). Aqui removemos o PUBLIC e
-- reafirmamos os grants diretos de authenticated/service_role.
--
-- Não são usados em policies RLS (member_has_scope, que é SECURITY DEFINER, os chama no
-- contexto do definer), logo remover anon/PUBLIC não quebra SELECT anônimo. Ver
-- [[anon-grant-default-privileges]] e ADR-005.

revoke all on function public.is_company_owner(p_company_id uuid) from public, anon;
grant execute on function public.is_company_owner(p_company_id uuid) to authenticated, service_role;

revoke all on function public.current_member_scopes(p_company_id uuid) from public, anon;
grant execute on function public.current_member_scopes(p_company_id uuid) to authenticated, service_role;
