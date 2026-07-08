-- E0.10 · Identidade unificada — infra de anexar/merge (OTP custom + helpers). Aditiva.
-- A prova-de-posse de um identificador em colisão é NOSSA (o OTP do GoTrue é amarrado ao login).
-- Ver docs/specs/customer/identity-unification.md.

-- OTP efêmero pra provar posse de um telefone/e-mail ao anexar/mesclar. Só service_role acessa.
create table if not exists public.identifier_otp (
  id          uuid primary key default gen_random_uuid(),
  channel     text not null check (channel in ('phone','email')),
  identifier  text not null,               -- normalizado (E.164 / lowercase)
  code_hash   text not null,               -- sha256(code) — nunca o código cru
  requested_by uuid,                        -- auth.uid() que pediu (auditoria/anti-abuso)
  expires_at  timestamptz not null,
  attempts    int not null default 0,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists identifier_otp_lookup on public.identifier_otp (channel, identifier, created_at desc);
alter table public.identifier_otp enable row level security;
-- Sem policies → apenas service_role (a Edge) lê/escreve.

-- Resolve o dono de um identificador (pra decidir anexar vs mesclar). Telefone compara por dígitos
-- (auth.users.phone às vezes vem sem '+'); e-mail por lower(). service_role only.
create or replace function public.find_user_by_identifier(p_channel text, p_identifier text)
returns uuid language plpgsql security definer set search_path to 'public' stable as $$
declare v_id uuid;
begin
  if p_channel = 'phone' then
    select u.id into v_id from auth.users u
      where nullif(regexp_replace(coalesce(u.phone,''), '\D', '', 'g'), '')
          = nullif(regexp_replace(coalesce(p_identifier,''), '\D', '', 'g'), '')
      limit 1;
  elsif p_channel = 'email' then
    select u.id into v_id from auth.users u where lower(u.email) = lower(p_identifier) limit 1;
  end if;
  return v_id;
end; $$;
revoke all on function public.find_user_by_identifier(text, text) from public, anon, authenticated;
grant execute on function public.find_user_by_identifier(text, text) to service_role;

-- Uma conta "tem histórico" (→ exige confirmação "conectar contas", Q-006) se tem qualquer dado com valor.
create or replace function public.account_has_history(p_uid uuid)
returns boolean language sql security definer set search_path to 'public' stable as $$
  select exists(select 1 from public.booking       where profile_id = p_uid)
      or exists(select 1 from public.vehicle       where profile_id = p_uid)
      or exists(select 1 from public.address       where profile_id = p_uid)
      or exists(select 1 from public.review        where profile_id = p_uid)
      or exists(select 1 from public.profile_saved where profile_id = p_uid);
$$;
revoke all on function public.account_has_history(uuid) from public, anon;
grant execute on function public.account_has_history(uuid) to authenticated, service_role;

-- Resumo do que seria unificado (mostrado na tela "conectar contas"). service_role only.
create or replace function public.merge_preview(p_loser uuid)
returns jsonb language sql security definer set search_path to 'public' stable as $$
  select jsonb_build_object(
    'bookings', (select count(*) from public.booking       where profile_id = p_loser),
    'vehicles', (select count(*) from public.vehicle       where profile_id = p_loser),
    'saved',    (select count(*) from public.profile_saved where profile_id = p_loser),
    'reviews',  (select count(*) from public.review        where profile_id = p_loser)
  );
$$;
revoke all on function public.merge_preview(uuid) from public, anon, authenticated;
grant execute on function public.merge_preview(uuid) to service_role;
