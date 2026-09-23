-- Link de acesso ao Recebimento (23/09/2026). Ver docs/specs/link-de-acesso-recebimento.md
--
-- O Manager gera, por empresa, um link que faz o dono cair LOGADO em /operator/recebimento para
-- preencher o KYC e aceitar o contrato. Não tem prazo em dias: morre sozinho quando a empresa
-- termina (conta de repasse + contrato), ou quando o Manager revoga. Molde do checkout_handoff
-- (prefixo indexado + sha256 do segredo; o segredo nunca fica em repouso), mas sem guardar sessão:
-- quem loga é a Edge, com um magic link gerado na hora do resgate.

create table if not exists public.company_access_link (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.company(id) on delete cascade,
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  email         text not null,
  token_prefix  text not null unique,
  token_hash    text not null,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz,
  last_used_at  timestamptz,
  use_count     integer not null default 0
);

create index if not exists company_access_link_company_active
  on public.company_access_link (company_id) where revoked_at is null;

alter table public.company_access_link enable row level security;
drop policy if exists company_access_link_admin_read on public.company_access_link;
create policy company_access_link_admin_read on public.company_access_link
  for select to authenticated using (public.is_hub_admin());
revoke all on table public.company_access_link from anon;

-- A empresa terminou o Recebimento? Conta de repasse enviada e contrato aceito.
create or replace function public.company_access_link_done(p_company_id uuid)
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from public.company c
    where c.id = p_company_id and c.deleted_at is null and c.contract_accepted_at is not null
      and exists (select 1 from public.company_payout_account a where a.company_id = c.id and a.deleted_at is null)
  );
$$;
revoke all on function public.company_access_link_done(uuid) from public, anon;
grant execute on function public.company_access_link_done(uuid) to authenticated, service_role;

-- Resgate (Edge redeem-company-access-link, service_role): valida o segredo, conta o uso e devolve
-- quem entra. Reutilizável de propósito: o dono pode voltar até terminar.
create or replace function public.company_access_link_redeem(p_prefix text, p_hash text)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  v public.company_access_link%rowtype;
begin
  select l.* into v
    from public.company_access_link l
    join public.company c on c.id = l.company_id and c.deleted_at is null
   where l.token_prefix = p_prefix and l.token_hash = p_hash and l.revoked_at is null;
  if v.id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if public.company_access_link_done(v.company_id) then
    return jsonb_build_object('ok', false, 'reason', 'done');
  end if;
  update public.company_access_link
     set use_count = use_count + 1, last_used_at = now()
   where id = v.id;
  return jsonb_build_object('ok', true, 'company_id', v.company_id, 'profile_id', v.profile_id, 'email', v.email);
end;
$$;
revoke all on function public.company_access_link_redeem(text, text) from public, anon, authenticated;
grant execute on function public.company_access_link_redeem(text, text) to service_role;

-- Revogação pelo Manager (hub_admin). Gerar outro link também revoga o anterior (na Edge).
create or replace function public.company_access_link_revoke(p_id uuid)
returns void
language plpgsql security definer set search_path to 'public'
as $$
begin
  if not (public.is_hub_admin() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'Só a equipe Movepark revoga link de acesso.' using errcode = '42501';
  end if;
  update public.company_access_link set revoked_at = now() where id = p_id and revoked_at is null;
end;
$$;
revoke all on function public.company_access_link_revoke(uuid) from public, anon;
grant execute on function public.company_access_link_revoke(uuid) to authenticated, service_role;
