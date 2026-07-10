-- Motor de Crescimento · Engrenagem 1 — Clube (níveis) + Indique e Ganhe
--
-- Captura de schema: as tabelas membership / membership_tier / referral /
-- referral_code, suas funções (recompute_membership, get_my_membership,
-- get_my_referrals, get_or_create_referral_code) e os triggers de conclusão de
-- reserva foram construídos direto no banco vivo (via MCP) e nunca versionados.
-- A migration seguinte (20260724000000_movecoins_wallet) depende dessas tabelas
-- (FK referral_id, leitura de membership_tier.cashback_bps, recompute_membership)
-- e, sem esta captura, o banco não reconstrói do zero (CI/pgTAP quebra em
-- "relation public.referral does not exist"). Esta migration reproduz o estado
-- vivo pré-carteira; a carteira MoveCoins e o crédito de indicação entram em
-- 20260724000000_movecoins_wallet, que faz create-or-replace dos triggers.

-- ─────────────────────────────────────────────────────────────────────────────
-- Catálogo de níveis do Clube (calibrável no Manager).
create table if not exists public.membership_tier (
  code           text primary key,
  name           text not null,
  sort_order     integer not null,
  min_bookings   integer not null,
  cashback_bps   integer not null default 0,
  perks          jsonb not null default '[]'::jsonb,
  is_invite_only boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

insert into public.membership_tier (code, name, sort_order, min_bookings, cashback_bps, perks, is_invite_only)
values
  ('ignicao', 'Ignição', 1, 0,      200, '["Cashback 2% (Fase 2)"]'::jsonb,                                          false),
  ('turbo',   'Turbo',   2, 2,      300, '["Cashback 3% (Fase 2)", "Promoções exclusivas"]'::jsonb,                  false),
  ('nitro',   'Nitro',   3, 6,      500, '["Cashback 5% (Fase 2)", "Suporte prioritário", "Upgrade"]'::jsonb,        false),
  ('podio',   'Pódio',   4, 999999, 500, '["Cashback máximo (Fase 2)", "Perks exclusivos"]'::jsonb,                  true)
on conflict (code) do nothing;

-- Nível corrente do cliente. Uma linha por perfil (lazy-init em get_my_membership).
create table if not exists public.membership (
  profile_id         uuid primary key references public.profiles(id) on delete cascade,
  tier_code          text not null default 'ignicao' references public.membership_tier(code),
  completed_bookings integer not null default 0,
  window_bookings    integer not null default 0,
  last_booking_at    timestamptz,
  tier_since         timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists membership_tier_code_idx on public.membership (tier_code);

-- Código de indicação: um por perfil.
create table if not exists public.referral_code (
  code       text primary key,
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Indicação concreta (quem indicou quem). Fecha em 'rewarded' na 1ª reserva.
create table if not exists public.referral (
  id                    uuid primary key default gen_random_uuid(),
  code                  text not null references public.referral_code(code) on delete cascade,
  referrer_profile_id   uuid not null references public.profiles(id) on delete cascade,
  referred_profile_id   uuid references public.profiles(id) on delete set null,
  referred_email        text,
  status                text not null default 'pending'
                          check (status in ('pending', 'qualified', 'rewarded', 'expired', 'void')),
  qualifying_booking_id uuid references public.booking(id) on delete set null,
  referred_coupon_id    uuid references public.coupon(id) on delete set null,
  reward_coupon_id      uuid references public.coupon(id) on delete set null,
  reward_amount         numeric not null default 25,
  qualified_at          timestamptz,
  rewarded_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint referral_no_self check (referred_profile_id is null or referred_profile_id <> referrer_profile_id),
  constraint referral_referrer_profile_id_referred_profile_id_key unique (referrer_profile_id, referred_profile_id)
);

create index if not exists referral_referred_profile_id_idx on public.referral (referred_profile_id);
create index if not exists referral_referrer_profile_id_idx on public.referral (referrer_profile_id);
create index if not exists referral_status_idx              on public.referral (status);

-- ─────────────────────────────────────────────────────────────────────────────
-- Recalcula o nível do perfil a partir das reservas concluídas (12 meses de
-- janela). Preserva níveis is_invite_only já concedidos manualmente.
create or replace function public.recompute_membership(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_total   int;
  v_window  int;
  v_last    timestamptz;
  v_current text;
  v_target  text;
begin
  if p_profile_id is null then
    return;
  end if;

  select count(*), max(check_out_at)
    into v_total, v_last
    from public.booking
   where profile_id = p_profile_id and status = 'completed';

  select count(*)
    into v_window
    from public.booking
   where profile_id = p_profile_id
     and status = 'completed'
     and check_out_at >= now() - interval '12 months';

  select code into v_target
    from public.membership_tier
   where is_invite_only = false
     and min_bookings <= coalesce(v_window, 0)
   order by sort_order desc
   limit 1;
  v_target := coalesce(v_target, 'ignicao');

  select tier_code into v_current from public.membership where profile_id = p_profile_id;
  if v_current is not null
     and exists (select 1 from public.membership_tier t where t.code = v_current and t.is_invite_only) then
    v_target := v_current;
  end if;

  insert into public.membership
    (profile_id, tier_code, completed_bookings, window_bookings, last_booking_at, tier_since)
  values
    (p_profile_id, v_target, coalesce(v_total,0), coalesce(v_window,0), v_last, now())
  on conflict (profile_id) do update
    set completed_bookings = excluded.completed_bookings,
        window_bookings    = excluded.window_bookings,
        last_booking_at    = excluded.last_booking_at,
        tier_code          = excluded.tier_code,
        tier_since         = case when membership.tier_code is distinct from excluded.tier_code
                                  then now() else membership.tier_since end,
        updated_at         = now();
end;
$$;

-- Nível + progresso para o próximo (lazy-init garante a linha).
create or replace function public.get_my_membership()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_cur record;
  v_next record;
begin
  if v_uid is null then raise exception 'não autenticado'; end if;

  if not exists (select 1 from public.membership where profile_id = v_uid) then
    perform public.recompute_membership(v_uid);
  end if;

  select m.tier_code, m.completed_bookings, m.window_bookings, m.tier_since,
         t.name as tier_name, t.cashback_bps, t.perks, t.sort_order
    into v_cur
    from public.membership m
    join public.membership_tier t on t.code = m.tier_code
   where m.profile_id = v_uid;

  select code, name, min_bookings into v_next
    from public.membership_tier
   where is_invite_only = false and sort_order > v_cur.sort_order
   order by sort_order asc limit 1;

  return jsonb_build_object(
    'tier_code', v_cur.tier_code,
    'tier_name', v_cur.tier_name,
    'cashback_bps', v_cur.cashback_bps,
    'perks', v_cur.perks,
    'completed_bookings', v_cur.completed_bookings,
    'window_bookings', v_cur.window_bookings,
    'tier_since', v_cur.tier_since,
    'next_tier', case when v_next.code is null then null else jsonb_build_object(
        'code', v_next.code,
        'name', v_next.name,
        'min_bookings', v_next.min_bookings,
        'bookings_needed', greatest(v_next.min_bookings - v_cur.window_bookings, 0)
    ) end
  );
end;
$$;

-- Retorna (ou cria on-demand) o código de indicação do perfil.
create or replace function public.get_or_create_referral_code(p_profile_id uuid default null::uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_code   text;
  v_target uuid;
begin
  if public.is_hub_admin() then
    v_target := coalesce(p_profile_id, auth.uid());
  else
    v_target := auth.uid();
  end if;
  if v_target is null then
    raise exception 'sem perfil autenticado';
  end if;

  select code into v_code from public.referral_code where profile_id = v_target;
  if v_code is not null then
    return v_code;
  end if;

  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.referral_code where code = v_code);
  end loop;

  insert into public.referral_code (code, profile_id) values (v_code, v_target);
  return v_code;
end;
$$;

-- Código + link + contadores + lista das indicações do próprio usuário.
create or replace function public.get_my_referrals()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_list jsonb;
  v_counts jsonb;
begin
  if v_uid is null then raise exception 'não autenticado'; end if;

  v_code := public.get_or_create_referral_code(v_uid);

  select coalesce(jsonb_agg(jsonb_build_object(
            'id', r.id,
            'status', r.status,
            'referred_email', r.referred_email,
            'reward_amount', r.reward_amount,
            'created_at', r.created_at,
            'qualified_at', r.qualified_at
          ) order by r.created_at desc), '[]'::jsonb)
    into v_list
    from public.referral r
   where r.referrer_profile_id = v_uid;

  select jsonb_build_object(
      'pending',   count(*) filter (where status = 'pending'),
      'qualified', count(*) filter (where status = 'qualified'),
      'rewarded',  count(*) filter (where status = 'rewarded')
    ) into v_counts
    from public.referral where referrer_profile_id = v_uid;

  return jsonb_build_object(
    'code', v_code,
    'link', 'https://hub.movepark.co/r/' || v_code,
    'counts', v_counts,
    'referrals', v_list
  );
end;
$$;

grant execute on function public.get_my_membership() to authenticated;
grant execute on function public.get_my_referrals() to authenticated;
grant execute on function public.get_or_create_referral_code(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Triggers de conclusão de reserva. O corpo definitivo do referral (crédito na
-- carteira) é instalado em 20260724000000_movecoins_wallet via create-or-replace;
-- aqui fica o vínculo do trigger (que a migration da carteira não recria).
create or replace function public.tg_booking_completed_membership()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status = 'completed'
     and (tg_op = 'INSERT' or old.status is distinct from 'completed')
     and new.profile_id is not null then
    perform public.recompute_membership(new.profile_id);
  end if;
  return new;
end;
$$;

-- Placeholder só se a função ainda não existe. No banco vivo ela já tem o corpo
-- definitivo (create-or-replace de 20260724000000_movecoins_wallet, que credita
-- a carteira) e NÃO pode ser rebaixada para o stub; por isso o guard.
do $do$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'tg_booking_completed_referral'
      and p.pronargs = 0
  ) then
    execute $fn$
      create function public.tg_booking_completed_referral()
      returns trigger
      language plpgsql
      security definer
      set search_path to 'public'
      as $body$
      begin
        -- corpo definitivo (qualifica + credita a carteira) instalado em
        -- 20260724000000_movecoins_wallet; placeholder para atar o trigger.
        return new;
      end;
      $body$;
    $fn$;
  end if;
end;
$do$;

drop trigger if exists booking_completed_membership on public.booking;
create trigger booking_completed_membership
  after insert or update of status on public.booking
  for each row execute function public.tg_booking_completed_membership();

drop trigger if exists booking_completed_referral on public.booking;
create trigger booking_completed_referral
  after insert or update of status on public.booking
  for each row execute function public.tg_booking_completed_referral();

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS: leitura própria (catálogo é público), escrita só hub_admin. A inserção da
-- indicação é gateada pela policy (só o dono do código, para si).
alter table public.membership_tier enable row level security;
alter table public.membership      enable row level security;
alter table public.referral_code   enable row level security;
alter table public.referral        enable row level security;

drop policy if exists membership_tier_select on public.membership_tier;
create policy membership_tier_select on public.membership_tier
  for select using (true);
drop policy if exists membership_tier_admin_write on public.membership_tier;
create policy membership_tier_admin_write on public.membership_tier
  for all using (public.is_hub_admin()) with check (public.is_hub_admin());

drop policy if exists membership_select on public.membership;
create policy membership_select on public.membership
  for select using (profile_id = auth.uid() or public.is_hub_admin());
drop policy if exists membership_admin_write on public.membership;
create policy membership_admin_write on public.membership
  for all using (public.is_hub_admin()) with check (public.is_hub_admin());

drop policy if exists referral_code_select on public.referral_code;
create policy referral_code_select on public.referral_code
  for select using (true);
drop policy if exists referral_code_admin_write on public.referral_code;
create policy referral_code_admin_write on public.referral_code
  for all using (public.is_hub_admin()) with check (public.is_hub_admin());

drop policy if exists referral_select on public.referral;
create policy referral_select on public.referral
  for select using (
    referrer_profile_id = auth.uid()
    or referred_profile_id = auth.uid()
    or public.is_hub_admin()
  );
drop policy if exists referral_insert on public.referral;
create policy referral_insert on public.referral
  for insert with check (
    referrer_profile_id = auth.uid()
    and code in (select referral_code.code from public.referral_code where referral_code.profile_id = auth.uid())
  );
drop policy if exists referral_admin_write on public.referral;
create policy referral_admin_write on public.referral
  for all using (public.is_hub_admin()) with check (public.is_hub_admin());
