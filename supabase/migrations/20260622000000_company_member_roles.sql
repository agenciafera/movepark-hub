-- E1.6: sub-papéis DENTRO da empresa (dono vs. operacional).
-- Não altera o enum user_role da plataforma (customer/company_operator/hub_admin).
-- Adiciona company_role em profile_company, helpers de escopo por papel e RPCs
-- SECURITY DEFINER para gerir membros (owner-only, com guarda de "último dono").
-- Default 'owner' no backfill preserva o acesso total dos vínculos existentes.

-- 1) enum + coluna ----------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'company_role') then
    create type public.company_role as enum ('owner', 'operator');
  end if;
end $$;

alter table public.profile_company
  add column if not exists role public.company_role not null default 'owner';

-- 2) helpers de papel (SECURITY DEFINER p/ não recursar no RLS) --------------
create or replace function public.is_company_owner(p_company_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.is_hub_admin() or exists (
    select 1 from public.profile_company
    where profile_id = auth.uid() and company_id = p_company_id and role = 'owner'
  );
$$;

create or replace function public.current_owner_company_ids()
returns setof uuid language sql stable security definer set search_path to 'public' as $$
  select company_id from public.profile_company
  where profile_id = auth.uid() and role = 'owner';
$$;

-- 3) RPCs de gestão de membros (existentes) ---------------------------------
-- Listar membros da empresa (qualquer membro vê o roster; hub_admin também).
create or replace function public.company_list_members(p_company_id uuid)
returns table (profile_id uuid, full_name text, email text, role public.company_role, created_at timestamptz)
language plpgsql stable security definer set search_path to 'public' as $fn$
begin
  if not public.is_hub_admin()
     and not exists (select 1 from public.profile_company
                     where profile_id = auth.uid() and company_id = p_company_id) then
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

-- Alterar o papel de um membro (owner-only). Não deixa a empresa sem dono.
create or replace function public.company_set_member_role(
  p_company_id uuid, p_profile_id uuid, p_role public.company_role
) returns void language plpgsql security definer set search_path to 'public' as $fn$
declare v_owner_count integer;
begin
  if not public.is_company_owner(p_company_id) then
    raise exception 'Apenas o dono pode gerir usuários da empresa.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profile_company
                 where company_id = p_company_id and profile_id = p_profile_id) then
    raise exception 'Usuário não pertence a esta empresa.' using errcode = 'P0001';
  end if;
  if p_role = 'operator' then
    select count(*) into v_owner_count from public.profile_company
      where company_id = p_company_id and role = 'owner';
    if v_owner_count <= 1 and exists (select 1 from public.profile_company
        where company_id = p_company_id and profile_id = p_profile_id and role = 'owner') then
      raise exception 'A empresa precisa de ao menos um dono.' using errcode = 'P0001';
    end if;
  end if;
  update public.profile_company set role = p_role
    where company_id = p_company_id and profile_id = p_profile_id;
end; $fn$;

-- Desvincular um membro da empresa (owner-only). Não remove o último dono.
create or replace function public.company_remove_member(
  p_company_id uuid, p_profile_id uuid
) returns void language plpgsql security definer set search_path to 'public' as $fn$
declare v_owner_count integer; v_is_owner boolean;
begin
  if not public.is_company_owner(p_company_id) then
    raise exception 'Apenas o dono pode gerir usuários da empresa.' using errcode = '42501';
  end if;
  select (role = 'owner') into v_is_owner from public.profile_company
    where company_id = p_company_id and profile_id = p_profile_id;
  if v_is_owner is null then
    raise exception 'Usuário não pertence a esta empresa.' using errcode = 'P0001';
  end if;
  if v_is_owner then
    select count(*) into v_owner_count from public.profile_company
      where company_id = p_company_id and role = 'owner';
    if v_owner_count <= 1 then
      raise exception 'A empresa precisa de ao menos um dono.' using errcode = 'P0001';
    end if;
  end if;
  delete from public.profile_company
    where company_id = p_company_id and profile_id = p_profile_id;
end; $fn$;

-- 4) grants -----------------------------------------------------------------
revoke all on function public.company_list_members(uuid) from public;
grant all on function public.company_list_members(uuid) to authenticated, service_role;
revoke all on function public.company_set_member_role(uuid, uuid, public.company_role) from public;
grant all on function public.company_set_member_role(uuid, uuid, public.company_role) to authenticated, service_role;
revoke all on function public.company_remove_member(uuid, uuid) from public;
grant all on function public.company_remove_member(uuid, uuid) to authenticated, service_role;
grant all on function public.is_company_owner(uuid) to authenticated, service_role;
grant all on function public.current_owner_company_ids() to authenticated, service_role;
