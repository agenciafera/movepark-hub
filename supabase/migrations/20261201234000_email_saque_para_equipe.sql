-- E-mail de saque para a equipe com o escopo, não só para o contato da ficha (10/11/2026).
--
-- No primeiro repasse automático (10/11/2026) os dois avisos de cada empresa foram para um único
-- endereço, o da ficha de KYC, embora a Abbapark tenha três usuários. A partir daqui o aviso vai
-- para quem tem `payouts:read` na empresa (ADR-005: Dono, Gerente e Financeiro) mais o contato da
-- ficha. A função é genérica por escopo para servir a outros avisos do mesmo tipo.
--
-- Só service role: devolve e-mail de auth.users (ADR-006, contato vivo de terceiro por definer).

create or replace function public.company_scope_emails(p_company_id uuid, p_scope text)
returns setof text
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select distinct lower(u.email)
    from public.profile_company pc
    join auth.users u on u.id = pc.profile_id
   where pc.company_id = p_company_id
     and u.email is not null and u.email <> ''
     and u.deleted_at is null
     and (u.banned_until is null or u.banned_until < now())
     and (pc.role = 'owner'
          or exists (select 1 from public.company_role_scope s
                      where s.role = pc.role and s.scope = p_scope))
   order by 1;
$$;

revoke all on function public.company_scope_emails(uuid, text) from public, anon, authenticated;
grant execute on function public.company_scope_emails(uuid, text) to service_role;
