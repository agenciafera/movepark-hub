-- `fares:write` como ESCOPO DE PLATAFORMA (ADR-005).
--
-- Plano de cancelamento é produto da Movepark. A RPC já exige `is_hub_admin()`
-- (migration 20260903000000), mas o item continuava no menu da empresa e a rota
-- continuava alcançável por quem tem `pricing:write`, que é preço de diária e
-- não tem relação com plano.
--
-- Escopo de plataforma é a categoria certa: pertence à Movepark, não à empresa
-- nem ao parceiro. O trigger `company_role_scope_no_platform` recusa colocá-lo
-- em qualquer papel de empresa, então nenhum dono/gerente/operador ganha isso
-- por engano. No front, `hasScope` devolve true para hub_admin (inclusive
-- impersonando) e false para todo membro de empresa, que é exatamente o
-- comportamento desejado no menu e na rota.
--
-- `assignable_to_api_key = false`: é gate de UI interna, não vai para chave de
-- API de parceiro (e por isso não entra na checagem de escopo órfão do
-- lint:openapi).

insert into public.api_scope (scope, module, description, assignable_to_api_key, is_platform_scope)
values (
  'fares:write',
  'pricing',
  'Editar plano de cancelamento (Básica/Flex/Superflex) por tipo de vaga. Exclusivo da equipe Movepark.',
  false,
  true
)
on conflict (scope) do update
  set module = excluded.module,
      description = excluded.description,
      assignable_to_api_key = excluded.assignable_to_api_key,
      is_platform_scope = excluded.is_platform_scope;
