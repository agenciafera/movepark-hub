-- Fecha o único `function_search_path_mutable` do projeto.
--
-- `assert_company_scope_not_platform` é o guard que impede escopo de plataforma
-- de entrar em papel de empresa. Ela já qualifica `public.api_scope`, então não
-- havia bypass por schema plantado; o que faltava era o `set search_path`, e o
-- advisor do Supabase reclamava dela desde ago/2026.
--
-- Só o corpo é reescrito: o trigger `company_role_scope_no_platform` continua
-- apontando para a mesma função, e o revoke nominal segue valendo.

create or replace function public.assert_company_scope_not_platform()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if exists (select 1 from public.api_scope s
             where s.scope = new.scope and s.is_platform_scope) then
    raise exception 'escopo de plataforma (%) não pode ser concedido a papel de empresa', new.scope
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.assert_company_scope_not_platform() from public, anon, authenticated;
