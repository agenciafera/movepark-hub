-- Terceira categoria de escopo: plataforma (86ajmx4yc, extensão do ADR-005).
--
-- O ADR-005 tinha duas categorias implícitas: escopo de empresa (entra em company_role_scope, e o
-- Dono recebe todos) e escopo de chave de parceiro (assignable_to_api_key). O `checkout:link`
-- não cabe em nenhuma das duas: é da tool MCP create_checkout_link, verificado por chave `mp_` e
-- concedido só ao bot interno da Movepark. Um Dono de estacionamento não gera link de checkout.
--
-- Isso quebrava a invariante "owner recebe todos os escopos do catálogo" (have 29, want 30), e
-- assignable_to_api_key não serve de discriminador: o checkout:link É atribuído a uma chave de API
-- (a do bot), então a flag dele é true com razão.
--
-- A flag nova nomeia a categoria: escopo de plataforma é da Movepark, não de empresa nem de
-- parceiro. A invariante do Dono passa a valer sobre o catálogo de EMPRESA (is_platform_scope
-- false), e um CHECK impede que escopo de plataforma seja seedado num papel de empresa por engano.

alter table public.api_scope
  add column if not exists is_platform_scope boolean not null default false;

comment on column public.api_scope.is_platform_scope is
  'Escopo interno da plataforma Movepark (ex.: o bot que gera link de checkout). Não é permissão de '
  'empresa: não entra em company_role_scope e não conta na invariante "o Dono recebe todos". '
  'Ortogonal a assignable_to_api_key, que diz se uma chave de API pode carregá-lo.';

update public.api_scope set is_platform_scope = true where scope = 'checkout:link';

-- Guard: escopo de plataforma não pode ser concedido a papel de empresa. Sem isto, a categoria vira
-- convenção e o próximo seed a viola em silêncio.
create or replace function public.assert_company_scope_not_platform()
returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.api_scope s
             where s.scope = new.scope and s.is_platform_scope) then
    raise exception 'escopo de plataforma (%) não pode ser concedido a papel de empresa', new.scope
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Só o trigger a usa. Postgres já recusa chamada direta a função de trigger, então isto é higiene
-- contra o default privilege do Supabase (que concede EXECUTE a anon/authenticated), não uma
-- correção de exposição.
revoke all on function public.assert_company_scope_not_platform() from public, anon, authenticated;

drop trigger if exists company_role_scope_no_platform on public.company_role_scope;
create trigger company_role_scope_no_platform
  before insert or update on public.company_role_scope
  for each row execute function public.assert_company_scope_not_platform();
