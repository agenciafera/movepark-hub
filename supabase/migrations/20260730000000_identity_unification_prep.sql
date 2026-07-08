-- E0.10 · Identidade unificada — PREP (ADR-006). NÃO dropa profiles.phone (isso é a migration
-- seguinte, depois do código parar de ler a coluna). Ver docs/specs/customer/identity-unification.md.
--
-- Faz, nesta ordem: (1) backfill dos telefones órfãos não-verificados → preferences (a UI oferece
-- verificar; sem promoção silenciosa); (2) para os triggers de escreverem profiles.phone;
-- (3) atualiza a RPC do E0.9 pra não tocar profiles.phone; (4) cria a infra de merge
-- (merge_accounts + account_merge_log) e a RPC de leitura get_my_identities.

------------------------------------------------------------------------------------------------
-- (1) Backfill: telefone que só existe no profiles.phone (não bate com auth.users.phone) é
-- NÃO-VERIFICADO. Não promovemos pro auth.users (regra de segurança) — guardamos como dica pra
-- a UI oferecer verificação. Compara por dígitos (auth.users.phone às vezes vem sem o '+').
------------------------------------------------------------------------------------------------
update public.profiles p
set preferences = jsonb_set(
      coalesce(p.preferences, '{}'::jsonb),
      '{unverified_phone_hint}',
      to_jsonb(p.phone)
    )
from auth.users u
where u.id = p.id
  and p.phone is not null
  and (
    u.phone is null
    or regexp_replace(u.phone, '\D', '', 'g') <> regexp_replace(p.phone, '\D', '', 'g')
  );

------------------------------------------------------------------------------------------------
-- (2) Triggers de auth.users → profiles deixam de escrever `phone` (ADR-006). Mantêm full_name,
-- tax_id, avatar_url. Os TRIGGERS em auth.users são geridos pelo Supabase Cloud; aqui só trocamos
-- o corpo das FUNÇÕES (CREATE OR REPLACE), que os triggers existentes já chamam.
------------------------------------------------------------------------------------------------
create or replace function public.handle_new_auth_user() returns trigger
  language plpgsql security definer set search_path to 'public'
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  oauth_name text := coalesce(
    nullif(meta->>'full_name',''), nullif(meta->>'name',''), nullif(meta->>'display_name','')
  );
begin
  insert into public.profiles (id, full_name, tax_id, avatar_url)
  values (new.id, oauth_name, nullif(meta->>'tax_id',''), nullif(meta->>'avatar_url',''))
  on conflict (id) do update set
    full_name  = coalesce(excluded.full_name,  profiles.full_name),
    tax_id     = coalesce(excluded.tax_id,     profiles.tax_id),
    avatar_url = coalesce(excluded.avatar_url, profiles.avatar_url);
  return new;
end;
$$;

create or replace function public.handle_auth_user_updated() returns trigger
  language plpgsql security definer set search_path to 'public'
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  oauth_name text := coalesce(
    nullif(meta->>'full_name',''), nullif(meta->>'name',''), nullif(meta->>'display_name','')
  );
  oauth_avatar text := nullif(meta->>'avatar_url','');
begin
  -- ADR-006: NÃO sincroniza mais phone pro profiles (a credencial mora no auth.users).
  if oauth_name is not null or oauth_avatar is not null then
    update public.profiles set
      full_name  = coalesce(profiles.full_name, oauth_name),
      avatar_url = coalesce(profiles.avatar_url, oauth_avatar)
    where id = new.id;
  end if;
  return new;
end;
$$;

------------------------------------------------------------------------------------------------
-- (3) E0.9: anonymize_own_account deixa de setar profiles.phone (a coluna vai ser dropada).
------------------------------------------------------------------------------------------------
create or replace function public.anonymize_own_account()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Não autenticado.' using errcode = '42501';
  end if;

  if exists (select 1 from public.profile_company where profile_id = v_uid) then
    raise exception 'Conta vinculada a uma empresa. Saia ou transfira a titularidade antes de excluir.'
      using errcode = 'P0001';
  end if;

  update public.profiles
  set full_name  = '(Conta excluída)',
      tax_id     = null,
      birth_date = null,
      avatar_url = null,
      preferences = '{}'::jsonb,
      deleted_at = coalesce(deleted_at, now()),
      updated_at = now()
  where id = v_uid;

  update public.booking
  set customer_name  = null,
      customer_email = null,
      customer_phone = null,
      notes          = null,
      voucher_url    = null,
      updated_at     = now()
  where profile_id = v_uid;

  delete from public.vehicle        where profile_id = v_uid;
  delete from public.address        where profile_id = v_uid;
  delete from public.payment_method where profile_id = v_uid;
  delete from public.profile_saved  where profile_id = v_uid;
end;
$$;

------------------------------------------------------------------------------------------------
-- (4a) Auditoria de merge. loser é deletado (sem FK); guardamos os ids crus + contagens.
------------------------------------------------------------------------------------------------
create table if not exists public.account_merge_log (
  id           uuid primary key default gen_random_uuid(),
  survivor_id  uuid not null,
  loser_id     uuid not null,
  counts       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
alter table public.account_merge_log enable row level security;
-- Só hub_admin lê (é trilha de auditoria); escrita é service_role (a Edge).
drop policy if exists account_merge_log_read on public.account_merge_log;
create policy account_merge_log_read on public.account_merge_log
  for select using (public.is_hub_admin());

------------------------------------------------------------------------------------------------
-- (4b) merge_accounts(survivor, loser): reaponta as FKs do perdedor pro sobrevivente, com dedupe
-- e precedência de campos; grava auditoria. NÃO mexe em auth.users/auth.identities — isso é a
-- Edge (service_role) que orquestra (set credencial + deleteUser). Idempotente/transacional.
-- Exclusiva do service_role (a autorização/prova-de-posse mora na Edge).
------------------------------------------------------------------------------------------------
create or replace function public.merge_accounts(p_survivor uuid, p_loser uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  c_bookings int; c_vehicles int; c_addresses int; c_pm int; c_saved int; c_reviews int;
begin
  if p_survivor is null or p_loser is null or p_survivor = p_loser then
    raise exception 'survivor/loser inválidos' using errcode = '22023';
  end if;

  -- Precedência de campos no perfil sobrevivente: não-nulo do sobrevivente vence; senão herda do perdedor.
  update public.profiles s set
    full_name  = coalesce(s.full_name,  l.full_name),
    tax_id     = coalesce(s.tax_id,     l.tax_id),
    birth_date = coalesce(s.birth_date, l.birth_date),
    avatar_url = coalesce(s.avatar_url, l.avatar_url),
    updated_at = now()
  from public.profiles l
  where s.id = p_survivor and l.id = p_loser;

  -- Índices únicos parciais one_default_per_profile: zera o default do perdedor antes de reapontar
  -- (o default do sobrevivente prevalece).
  update public.vehicle        set is_default = false where profile_id = p_loser and is_default;
  update public.address        set is_default = false where profile_id = p_loser and is_default;
  update public.payment_method set is_default = false where profile_id = p_loser and is_default;

  update public.booking        set profile_id = p_survivor where profile_id = p_loser;
  get diagnostics c_bookings = row_count;
  update public.vehicle        set profile_id = p_survivor where profile_id = p_loser;
  get diagnostics c_vehicles = row_count;
  update public.address        set profile_id = p_survivor where profile_id = p_loser;
  get diagnostics c_addresses = row_count;
  update public.payment_method set profile_id = p_survivor where profile_id = p_loser;
  get diagnostics c_pm = row_count;
  update public.review         set profile_id = p_survivor where profile_id = p_loser;
  get diagnostics c_reviews = row_count;

  -- PK composta → dedupe: insere o que falta no sobrevivente e apaga o do perdedor.
  insert into public.profile_saved (profile_id, location_parking_type_id)
    select p_survivor, location_parking_type_id from public.profile_saved where profile_id = p_loser
    on conflict do nothing;
  delete from public.profile_saved where profile_id = p_loser;
  get diagnostics c_saved = row_count;

  insert into public.profile_company (profile_id, company_id, role)
    select p_survivor, company_id, role from public.profile_company where profile_id = p_loser
    on conflict (profile_id, company_id) do nothing;
  delete from public.profile_company where profile_id = p_loser;

  -- api_key criada pelo perdedor passa pro sobrevivente (RESTRICT impediria deletar o perdedor).
  update public.api_key set created_by = p_survivor where created_by = p_loser;

  insert into public.account_merge_log (survivor_id, loser_id, counts)
  values (p_survivor, p_loser, jsonb_build_object(
    'bookings', c_bookings, 'vehicles', c_vehicles, 'addresses', c_addresses,
    'payment_methods', c_pm, 'saved', c_saved, 'reviews', c_reviews));

  return jsonb_build_object('survivor', p_survivor, 'loser', p_loser,
    'bookings', c_bookings, 'vehicles', c_vehicles, 'addresses', c_addresses,
    'payment_methods', c_pm, 'saved', c_saved, 'reviews', c_reviews);
end;
$$;

revoke all on function public.merge_accounts(uuid, uuid) from public, anon, authenticated;
grant execute on function public.merge_accounts(uuid, uuid) to service_role;

------------------------------------------------------------------------------------------------
-- (4c) get_my_identities(): lê as identidades/credenciais do PRÓPRIO usuário (auth.identities não
-- é exposta por RLS). Usada pela tela "Meus logins".
------------------------------------------------------------------------------------------------
create or replace function public.get_my_identities()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
stable
as $$
declare
  v_uid uuid := auth.uid();
  v_email text; v_phone text; v_email_conf timestamptz; v_phone_conf timestamptz;
  v_providers jsonb;
begin
  if v_uid is null then
    raise exception 'Não autenticado.' using errcode = '42501';
  end if;

  select u.email, u.phone, u.email_confirmed_at, u.phone_confirmed_at
    into v_email, v_phone, v_email_conf, v_phone_conf
  from auth.users u where u.id = v_uid;

  select coalesce(jsonb_agg(jsonb_build_object(
           'provider', i.provider,
           'last_sign_in_at', i.last_sign_in_at
         ) order by i.provider), '[]'::jsonb)
    into v_providers
  from auth.identities i where i.user_id = v_uid;

  return jsonb_build_object(
    'email', v_email,
    'phone', v_phone,
    'email_verified', v_email_conf is not null,
    'phone_verified', v_phone_conf is not null,
    'providers', v_providers
  );
end;
$$;

revoke all on function public.get_my_identities() from public, anon;
grant execute on function public.get_my_identities() to authenticated, service_role;
