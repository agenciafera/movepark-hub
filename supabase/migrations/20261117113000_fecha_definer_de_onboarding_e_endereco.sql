-- Fecha para `anon` 14 funções SECURITY DEFINER que o repo deixava abertas.
--
-- Achado em 15/09/2026, no primeiro CI com o job `db` vivo: no stack construído do baseline, estas
-- funções ficam executáveis por `anon`, e em produção não ficam. Alguém revogou lá, à mão, e o repo
-- nunca soube. Ou seja: **qualquer ambiente novo nasce com elas abertas**, e entre elas há mutação
-- (`onboarding_submit`, `onboarding_update_company`, `manager_location_address_apply`). Definer
-- ignora RLS, e a anon key vai embutida no bundle do front.
--
-- É o mesmo default do Postgres que o `definer_grants_inventory` existe para pegar: função nova no
-- schema `public` nasce com EXECUTE para PUBLIC, e um `grant ... to authenticated` no fim da
-- migration não desfaz isso.
--
-- O estado abaixo é cópia do que produção tem hoje (medido antes de escrever): todas fechadas para
-- `anon`; `authenticated` mantém só as 9 que o painel do parceiro e o do Manager chamam de verdade.
-- Em produção esta migration é no-op.

-- 1. Piso: ninguém anônimo chama nenhuma delas.
revoke execute on function public.onboarding_update_company(uuid, text, text, text, text) from public, anon;
revoke execute on function public.onboarding_bump_step(uuid, integer) from public, anon, authenticated;
revoke execute on function public.onboarding_set_parking_types(uuid, uuid, jsonb) from public, anon;
revoke execute on function public.onboarding_set_addons(uuid, uuid, jsonb) from public, anon;
revoke execute on function public.onboarding_set_pricing(uuid, uuid, text, jsonb) from public, anon;
revoke execute on function public.onboarding_submit(uuid) from public, anon;
revoke execute on function public.onboarding_assert_editable(uuid) from public, anon, authenticated;
revoke execute on function public.manager_location_address_apply(uuid, text, numeric, numeric, text, text, boolean, text) from public, anon;
revoke execute on function public.manager_location_address_audit(boolean) from public, anon;
revoke execute on function public.manager_location_address_dismiss(uuid, text) from public, anon;
revoke execute on function public.manager_location_address_scan() from public, anon;
revoke execute on function public.generate_unique_company_slug(text) from public, anon, authenticated;
revoke execute on function public.generate_unique_location_slug(uuid, text) from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- 2. Reafirma quem de fato chama: o operador no wizard e o hub_admin no painel de endereços.
--    (O gate de quem pode o quê continua DENTRO de cada função, por escopo; isto é só o EXECUTE.)
grant execute on function public.onboarding_update_company(uuid, text, text, text, text) to authenticated;
grant execute on function public.onboarding_set_parking_types(uuid, uuid, jsonb) to authenticated;
grant execute on function public.onboarding_set_addons(uuid, uuid, jsonb) to authenticated;
grant execute on function public.onboarding_set_pricing(uuid, uuid, text, jsonb) to authenticated;
grant execute on function public.onboarding_submit(uuid) to authenticated;
grant execute on function public.manager_location_address_apply(uuid, text, numeric, numeric, text, text, boolean, text) to authenticated;
grant execute on function public.manager_location_address_audit(boolean) to authenticated;
grant execute on function public.manager_location_address_dismiss(uuid, text) to authenticated;
grant execute on function public.manager_location_address_scan() to authenticated;
