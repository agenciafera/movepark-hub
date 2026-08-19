-- Auditoria de endereço: tirar `anon` de tudo que a auditoria expõe.
-- Spec: docs/specs/auditoria-enderecos.md
--
-- Continuação da migration anterior, que fechou as quatro funções internas e deixou passar o
-- resto. E a lição de por que passou: no Postgres toda função nasce com EXECUTE para PUBLIC,
-- e `anon` herda dali. Revogar de `anon` por nome não tira nada enquanto o grant de PUBLIC
-- estiver de pé. As quatro internas só fecharam porque as migrations delas tinham
-- `revoke all ... from public`.
--
-- Então aqui é sempre o mesmo par: revoga de PUBLIC e concede de volta a quem precisa.
--
-- As `manager_*` já recusam quem não é hub_admin com 42501, então isto não corrige um furo,
-- reduz superfície: um anônimo não precisa nem chegar à mensagem de erro. As funções de
-- normalização de endereço não são chamadas de fora por ninguém, e as que dependem delas são
-- `security definer`, então rodam como dono e não passam por grant.

revoke execute on function public.location_address_audit_policy() from public;

revoke execute on function public.location_address_door(text) from public;
revoke execute on function public.location_address_key(text) from public;
revoke execute on function public.location_address_number(text) from public;

revoke execute on function public.manager_location_address_audit(boolean) from public;
grant execute on function public.manager_location_address_audit(boolean) to authenticated;

revoke execute on function public.manager_location_address_apply(
  uuid, text, numeric, numeric, text, text, boolean, text
) from public;
grant execute on function public.manager_location_address_apply(
  uuid, text, numeric, numeric, text, text, boolean, text
) to authenticated;

revoke execute on function public.manager_location_address_dismiss(uuid, text) from public;
grant execute on function public.manager_location_address_dismiss(uuid, text) to authenticated;

revoke execute on function public.manager_location_address_scan() from public;
grant execute on function public.manager_location_address_scan() to authenticated;
