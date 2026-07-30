-- Meta de receita da empresa (Dashboard Operador v2).
--
-- O card de receita do painel do parceiro mostra o realizado contra uma meta. A
-- meta é um valor que o parceiro define, não algo derivável do histórico, então
-- vira coluna própria. Nula quer dizer "sem meta": o card mostra só o realizado
-- em vez de inventar um alvo.
--
-- ADR-005: escrita nova ganha escopo próprio. `finance:write` é de empresa e não
-- vai pra chave de API (é config de painel, não de integração).

alter table public.company
  add column if not exists monthly_revenue_goal_cents integer;

comment on column public.company.monthly_revenue_goal_cents is
  'Meta de receita do período no painel do parceiro, em centavos. Nula = sem meta definida.';

insert into public.api_scope (scope, module, description, assignable_to_api_key) values
  ('finance:write', 'finance', 'Definir a meta de receita da empresa', false)
on conflict (scope) do update set
  module = excluded.module,
  description = excluded.description,
  assignable_to_api_key = excluded.assignable_to_api_key;

-- Dono, Gerente e Financeiro definem a meta. Operação não (não vê dinheiro).
-- A linha do Dono é obrigatória: `member_has_scope` (o gate real, usado nas RPCs)
-- lê o pacote do papel em `company_role_scope`, e não dá o catálogo inteiro ao dono
-- como o `current_member_scopes` faz. Sem ela, o próprio dono seria barrado e a
-- invariante "o Dono tem todo escopo de empresa" quebraria.
insert into public.company_role_scope (role, scope) values
  ('owner', 'finance:write'),
  ('manager', 'finance:write'),
  ('finance', 'finance:write')
on conflict do nothing;

/**
 * Define a meta de receita da empresa. `p_goal_cents` nulo ou <= 0 limpa a meta.
 * Gate no servidor (a UI só espelha): quem não tem `finance:write` é barrado.
 */
create or replace function public.operator_set_revenue_goal(
  p_company_id uuid,
  p_goal_cents integer
) returns void
language plpgsql
volatile
security definer
set search_path to 'public'
as $function$
begin
  if not public.member_has_scope(p_company_id, 'finance:write') then
    raise exception 'Sem permissão para definir a meta de receita.' using errcode = '42501';
  end if;

  update public.company
     set monthly_revenue_goal_cents =
           case when coalesce(p_goal_cents, 0) > 0 then p_goal_cents else null end,
         updated_at = now()
   where id = p_company_id
     and deleted_at is null;

  if not found then
    raise exception 'Empresa não encontrada.' using errcode = 'P0002';
  end if;
end;
$function$;

comment on function public.operator_set_revenue_goal(uuid, integer) is
  'Define (ou limpa, com valor nulo/zero) a meta de receita da empresa. Exige finance:write.';

revoke all on function public.operator_set_revenue_goal(uuid, integer) from public, anon;
grant execute on function public.operator_set_revenue_goal(uuid, integer) to authenticated, service_role;
