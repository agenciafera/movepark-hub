-- Escalada de privilégio: `profiles.role` era gravável por quem ele autoriza.
--
-- Qualquer pessoa criava conta no `/login` (passwordless, aberto) e virava `hub_admin` com um
-- `PATCH /rest/v1/profiles?id=eq.<próprio uuid>` mandando `{"role":"hub_admin"}`. A partir daí
-- passava em todo gate `is_hub_admin()` do produto: o `/manager` inteiro, as RLS de escrita de
-- `location` e `company`, cupons, blog e as RPCs `manager_*`.
--
-- Por que a RLS não segurava: policy corta LINHA, não COLUNA. As duas policies de UPDATE de
-- `profiles` dizem "o dono edita a própria linha", e isso é verdade e desejado; o que faltava era
-- alguém dizer QUAIS colunas. Como o baseline dá `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES
-- TO authenticated`, o dono da linha editava a linha inteira, `role` incluída.
--
-- É o mesmo remédio de Q-021 (`20261009000000_prospect_location_public_columns.sql`), onde o
-- telefone do lote mapeado ficou ilegível por grant de coluna depois que a RLS provou que não
-- resolvia: RLS corta por linha, coluna é grant.
--
-- ADR-006 diz que `profiles` não guarda credencial. `role` não é credencial, é autorização, e vale
-- a mesma regra pela mesma razão: **autorização não pode ser escrita por quem ela autoriza.**

set search_path = public, pg_temp;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. A coluna sai do alcance do usuário.
--
-- Postgres cobra privilégio de UPDATE por coluna citada no SET, então tirar `role` da lista faz o
-- `PATCH` com `{"role": ...}` responder 42501 mesmo para o dono da linha, e deixa passar o
-- `PATCH` com nome, documento ou preferências, que é o que a tela da conta manda.
--
-- A lista abaixo é exatamente o que o cliente edita hoje (`src/routes/account/profile.tsx`,
-- `complete-profile.tsx`, `preferences.tsx` e o passo 1 do checkout). Ficam de fora `role` e
-- `deleted_at` (apagar conta é a RPC de anonimização), mais `id`, `created_at` e `updated_at`.
--
-- `anon` perde o UPDATE e não recebe nada de volta: a RLS já o barrava (`id = auth.uid()` é nulo
-- sem sessão), mas o grant default do Supabase deixava a porta destrancada atrás dela.
-- ─────────────────────────────────────────────────────────────────────────────

revoke update on public.profiles from anon, authenticated;

grant update (
  first_name,
  last_name,
  full_name,
  avatar_url,
  birth_date,
  tax_id,
  preferences
) on public.profiles to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. O caminho legítimo que o revoke fecharia junto.
--
-- O Manager troca o papel de um usuário na tela de Usuários, e isso ia direto por PostgREST com o
-- JWT do admin, ou seja, exatamente pelo caminho que acabou de fechar. Passa a ir por RPC, que é
-- onde a regra fica no servidor em vez de ficar na tela.
--
-- As duas Edges que promovem alguém a `company_operator` (`invite-company-member` e
-- `approve-partner`) usam o client de service_role e seguem funcionando sem mudança: elas nunca
-- dependeram do grant de `authenticated`.
--
-- **Ninguém troca o próprio papel**, nem para cima nem para baixo. Trocar para cima é a falha que
-- esta migration fecha, e não faria sentido reabri-la por dentro da RPC. Trocar para baixo é o
-- jeito mais fácil de trancar o painel para todo mundo: o último admin se rebaixa e não sobra
-- quem promova ninguém, e sair desse estado exige acesso direto ao banco. Papel é mudança de duas
-- pessoas.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.admin_set_user_role(
  p_user_id uuid,
  p_role public.user_role
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_hub_admin() then
    raise exception 'Sem permissão para alterar o papel de um usuário.' using errcode = '42501';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'Ninguém altera o próprio papel: peça a outro administrador.'
      using errcode = 'P0001';
  end if;

  update public.profiles
     set role = p_role
   where id = p_user_id
     and deleted_at is null;

  if not found then
    raise exception 'Usuário não encontrado.' using errcode = 'P0001';
  end if;
end;
$$;

comment on function public.admin_set_user_role(uuid, public.user_role) is
  'Único caminho de escrita de profiles.role para o Manager. O grant de coluna tirou a coluna do alcance do usuário, e esta RPC devolve o caminho legítimo, gateado por is_hub_admin() e sem permitir alterar o próprio papel.';

-- `revoke from public, anon` nominalmente: função nova no schema public nasce com EXECUTE para
-- anon por default privilege, e `revoke from public` sozinho não tira esse grant.
revoke all on function public.admin_set_user_role(uuid, public.user_role) from public, anon;
grant execute on function public.admin_set_user_role(uuid, public.user_role)
  to authenticated, service_role;
