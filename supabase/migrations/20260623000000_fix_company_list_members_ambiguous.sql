-- Fix: `company_list_members` lançava `column reference "profile_id" is ambiguous`
-- (POST 400 na aba de equipe do painel). Causa: a função é `RETURNS TABLE
-- (profile_id uuid, …)`, então `profile_id` também é uma variável de saída; na
-- checagem de acesso `where profile_id = auth.uid()` o nome colidia com a coluna
-- `profile_company.profile_id`. Conserto: qualificar as colunas (alias `pc`) e
-- declarar `#variable_conflict use_column`. Comportamento idêntico, sem o erro.
create or replace function public.company_list_members(p_company_id uuid)
returns table (profile_id uuid, full_name text, email text, role public.company_role, created_at timestamptz)
language plpgsql stable security definer set search_path to 'public' as $fn$
#variable_conflict use_column
begin
  if not public.is_hub_admin()
     and not exists (select 1 from public.profile_company pc
                     where pc.profile_id = auth.uid() and pc.company_id = p_company_id) then
    raise exception 'Sem acesso a esta empresa.' using errcode = '42501';
  end if;
  return query
    select pc.profile_id, p.full_name, u.email::text, pc.role, pc.created_at
    from public.profile_company pc
    join public.profiles p on p.id = pc.profile_id
    left join auth.users u on u.id = pc.profile_id
    where pc.company_id = p_company_id
    order by pc.role, pc.created_at;
end; $fn$;
