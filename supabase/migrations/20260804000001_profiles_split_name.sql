-- Quebra profiles.full_name em first_name / last_name (comunicar pelo primeiro nome sem quebrar
-- leitura). full_name PERMANECE, agora como coluna GERADA (first_name || ' ' || last_name), pra que
-- os ~30 pontos que leem full_name (bookings, reviews, voucher, dashboards, iniciais, edges de
-- pagamento) sigam funcionando sem toque. Só a ESCRITA muda: forms + os 4 SECURITY DEFINER abaixo.
--
-- OAuth aqui não traz given_name/family_name (só full_name/name), então backfill e triggers fatiam a
-- string (1º token = nome; resto = sobrenome), com fallback pra given_name/family_name se aparecerem.
-- Ver docs/specs/customer/identity-unification.md e ADR-006 no CLAUDE.md.

------------------------------------------------------------------------------------------------
-- (0) Helper imutável: fatia um nome completo em (first_name, last_name). Usado no backfill e nos
-- triggers; testável isoladamente no pgTAP. Nome só (1 token) → last_name null. Vazio → ambos null.
------------------------------------------------------------------------------------------------
create or replace function public.split_person_name(p_full text)
returns table (first_name text, last_name text)
language sql
immutable
set search_path = ''
as $$
  select
    nullif((regexp_split_to_array(btrim(coalesce(p_full, '')), '\s+'))[1], '')                       as first_name,
    nullif(array_to_string((regexp_split_to_array(btrim(coalesce(p_full, '')), '\s+'))[2:], ' '), '') as last_name;
$$;

------------------------------------------------------------------------------------------------
-- (1) Colunas novas + backfill dos nomes existentes.
------------------------------------------------------------------------------------------------
alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name  text;

update public.profiles
set first_name = nullif((regexp_split_to_array(btrim(full_name), '\s+'))[1], ''),
    last_name  = nullif(array_to_string((regexp_split_to_array(btrim(full_name), '\s+'))[2:], ' '), '')
where full_name is not null;

------------------------------------------------------------------------------------------------
-- (2) full_name vira coluna GERADA. Postgres não converte in-place, então dropa e recria. Sem view
-- dependente (verificado); as funções SECURITY DEFINER re-parseiam o corpo, não travam o drop.
------------------------------------------------------------------------------------------------
alter table public.profiles drop column full_name;

alter table public.profiles
  add column full_name text
  generated always as (
    nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '')
  ) stored;

comment on column public.profiles.full_name is
  'Gerada: first_name + last_name. Não escrever direto; edite first_name/last_name.';

------------------------------------------------------------------------------------------------
-- (3) Triggers auth.users → profiles: populam first_name/last_name (não mais full_name, que é
-- gerada). Preferem given_name/family_name do OAuth; senão fatiam o nome do provedor.
------------------------------------------------------------------------------------------------
create or replace function public.handle_new_auth_user() returns trigger
  language plpgsql security definer set search_path to 'public'
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  oauth_name text := coalesce(
    nullif(meta->>'full_name',''), nullif(meta->>'name',''), nullif(meta->>'display_name','')
  );
  v_split record;
  v_first text;
  v_last  text;
begin
  select * into v_split from public.split_person_name(oauth_name);
  v_first := coalesce(nullif(meta->>'given_name',''),  v_split.first_name);
  v_last  := coalesce(nullif(meta->>'family_name',''), v_split.last_name);

  insert into public.profiles (id, first_name, last_name, tax_id, avatar_url)
  values (new.id, v_first, v_last, nullif(meta->>'tax_id',''), nullif(meta->>'avatar_url',''))
  on conflict (id) do update set
    first_name = coalesce(excluded.first_name, profiles.first_name),
    last_name  = coalesce(excluded.last_name,  profiles.last_name),
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
  v_split record;
  v_first text;
  v_last  text;
begin
  -- ADR-006: NÃO sincroniza phone pro profiles (a credencial mora no auth.users). Nome/avatar só
  -- preenchem o que está nulo (o que o usuário editou vence).
  if oauth_name is not null or oauth_avatar is not null then
    select * into v_split from public.split_person_name(oauth_name);
    v_first := coalesce(nullif(meta->>'given_name',''),  v_split.first_name);
    v_last  := coalesce(nullif(meta->>'family_name',''), v_split.last_name);

    update public.profiles set
      first_name = coalesce(profiles.first_name, v_first),
      last_name  = coalesce(profiles.last_name,  v_last),
      avatar_url = coalesce(profiles.avatar_url, oauth_avatar)
    where id = new.id;
  end if;
  return new;
end;
$$;

------------------------------------------------------------------------------------------------
-- (4) E0.9: anonimização zera first_name/last_name (full_name gerada acompanha).
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
  set first_name = '(Conta excluída)',
      last_name  = null,
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
-- (5) merge_accounts: precedência agora em first_name/last_name (não-nulo do sobrevivente vence).
-- Recriada por inteiro (assinatura idêntica) pra manter o resto do corpo intacto.
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
    first_name = coalesce(s.first_name, l.first_name),
    last_name  = coalesce(s.last_name,  l.last_name),
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
