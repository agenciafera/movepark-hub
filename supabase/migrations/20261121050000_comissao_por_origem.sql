-- Comissão por origem da venda (E0.3.12, 18/09/2026). Spec: docs/specs/comissao-por-origem.md.
--
-- A comissão, quem paga a taxa do gateway e quem arca com chargeback passam a depender da ORIGEM
-- da venda (utm_source cadastrado para a empresa, ou site white-label dela), por regras que a
-- Movepark cadastra. O "afiliado" é o próprio estacionamento: ele recebe pelo split de sempre.
-- Sem regra que case vale o padrão do Hub, que é o comportamento de hoje, então esta migration não
-- muda nada até alguém cadastrar a primeira regra. O pacote é congelado na reserva.

-- ── 1. Padrões do Hub ─────────────────────────────────────────────────────────────────────────
insert into public.app_setting (key, value) values
  ('commission_default_fee_payer', 'movepark'),
  ('commission_default_chargeback_bearer', 'each'),
  ('commission_attribution_window_days', '7'),
  ('commission_partner_share_alert_pct', '60')
on conflict (key) do nothing;

-- ── 2. Regras ─────────────────────────────────────────────────────────────────────────────────
create table if not exists public.commission_rule (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid references public.company(id) on delete cascade,  -- nulo = global
  name               text not null check (length(trim(name)) > 0),
  utm_sources        text[] not null default '{}',
  match_white_label  boolean not null default false,
  take_rate_bps      integer not null check (take_rate_bps between 0 and 10000),
  gateway_fee_payer  text not null check (gateway_fee_payer in ('movepark', 'partner')),
  chargeback_bearer  text not null check (chargeback_bearer in ('each', 'partner', 'movepark')),
  priority           integer not null default 0,
  is_active          boolean not null default true,
  valid_from         timestamptz,
  valid_until        timestamptz,
  created_by         uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  -- White-label é sempre de UMA empresa: regra global não casa por white-label.
  constraint commission_rule_wl_precisa_de_empresa check (not match_white_label or company_id is not null),
  -- Regra que não reconhece origem nenhuma nunca casaria.
  constraint commission_rule_reconhece_algo check (match_white_label or cardinality(utm_sources) > 0),
  constraint commission_rule_vigencia check (valid_until is null or valid_from is null or valid_until > valid_from)
);
comment on table public.commission_rule is
  'Regras de comissão por origem da venda (E0.3.12). company_id nulo = global. Só hub_admin lê e escreve.';
create index if not exists commission_rule_company_idx on public.commission_rule (company_id) where deleted_at is null;
create index if not exists commission_rule_utm_idx on public.commission_rule using gin (utm_sources);

drop trigger if exists commission_rule_set_updated_at on public.commission_rule;
create trigger commission_rule_set_updated_at before update on public.commission_rule
  for each row execute function public.set_updated_at();

-- Normaliza os UTMs (minúsculas, sem espaço, sem vazio, sem repetido) e recusa o mesmo utm_source
-- ativo em duas regras do mesmo dono (mesma empresa, ou as duas globais): a resolução ficaria
-- dependendo de prioridade sem ninguém ter decidido isso.
create or replace function public.commission_rule_normalize() returns trigger
  language plpgsql set search_path = public, pg_temp as $$
declare v_dup text;
begin
  new.utm_sources := coalesce((
    select array_agg(distinct u order by u)
      from (select nullif(lower(trim(x)), '') as u from unnest(coalesce(new.utm_sources, '{}')) x) s
     where u is not null), '{}');
  if new.deleted_at is null and new.is_active and cardinality(new.utm_sources) > 0 then
    select u into v_dup
      from public.commission_rule r, unnest(r.utm_sources) u
     where r.id <> new.id and r.deleted_at is null and r.is_active
       and r.company_id is not distinct from new.company_id
       and u = any(new.utm_sources)
     limit 1;
    if v_dup is not null then
      raise exception 'O utm_source "%" já está em outra regra ativa deste dono.', v_dup using errcode = '23505';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists commission_rule_normalize on public.commission_rule;
create trigger commission_rule_normalize before insert or update on public.commission_rule
  for each row execute function public.commission_rule_normalize();

alter table public.commission_rule enable row level security;
drop policy if exists commission_rule_admin_all on public.commission_rule;
create policy commission_rule_admin_all on public.commission_rule
  for all to authenticated using (public.is_hub_admin()) with check (public.is_hub_admin());
revoke all on table public.commission_rule from anon;

-- ── 3. Pacote congelado na reserva ────────────────────────────────────────────────────────────
alter table public.booking
  add column if not exists commission_rule_id uuid references public.commission_rule(id) on delete set null,
  add column if not exists commission_channel text,
  add column if not exists commission_take_rate_bps integer check (commission_take_rate_bps between 0 and 10000),
  add column if not exists commission_fee_payer text check (commission_fee_payer in ('movepark', 'partner')),
  add column if not exists commission_chargeback_bearer text check (commission_chargeback_bearer in ('each', 'partner', 'movepark')),
  add column if not exists commission_locked boolean not null default false,
  add column if not exists attribution jsonb;
comment on column public.booking.commission_channel is
  'Canal congelado na criação: hub, ou o nome da regra que casou. Nulo = reserva anterior ao E0.3.12 (lida como hub).';
comment on column public.booking.attribution is
  'Prova da origem: utm_source, utm_medium, utm_campaign, clicked_at, landing_url, referrer, origin.';
comment on column public.booking.commission_locked is
  'Pacote corrigido à mão por hub_admin: booking_apply_commission não recalcula.';

create table if not exists public.booking_commission_override (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.booking(id) on delete cascade,
  from_package jsonb,
  to_package   jsonb not null,
  reason      text not null check (length(trim(reason)) > 0),
  changed_by  uuid,
  created_at  timestamptz not null default now()
);
alter table public.booking_commission_override enable row level security;
drop policy if exists booking_commission_override_admin on public.booking_commission_override;
create policy booking_commission_override_admin on public.booking_commission_override
  for select to authenticated using (public.is_hub_admin());
revoke all on table public.booking_commission_override from anon;

-- ── 4. Resolução ──────────────────────────────────────────────────────────────────────────────
create or replace function public.resolve_commission(
  p_company_id uuid,
  p_origin text,
  p_utm_source text,
  p_clicked_at timestamptz,
  p_at timestamptz default now()
) returns jsonb
  language plpgsql stable security definer
  set search_path = public, pg_temp
as $$
declare
  v_utm text := nullif(lower(trim(coalesce(p_utm_source, ''))), '');
  v_days int := coalesce((select nullif(trim(value), '')::int from public.app_setting where key = 'commission_attribution_window_days'), 7);
  -- Sem data do clique (cliente antigo, API) vale a hora da reserva; com data, tem que caber na janela.
  v_clicked timestamptz := coalesce(p_clicked_at, p_at);
  v_utm_ok boolean;
  v_rule public.commission_rule%rowtype;
  v_take int;
begin
  if not (public.is_hub_admin() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  v_utm_ok := v_utm is not null and v_clicked <= p_at + interval '5 minutes'
              and v_clicked >= p_at - make_interval(days => v_days);

  select r.* into v_rule
    from public.commission_rule r
   where r.deleted_at is null and r.is_active
     and (r.valid_from is null or r.valid_from <= p_at)
     and (r.valid_until is null or r.valid_until > p_at)
     and (r.company_id = p_company_id or r.company_id is null)
     and (
       (v_utm_ok and v_utm = any(r.utm_sources))
       or (r.match_white_label and r.company_id = p_company_id and p_origin = 'white_label')
     )
   order by (r.company_id is not null) desc, r.priority desc, r.created_at desc
   limit 1;

  if v_rule.id is not null then
    return jsonb_build_object(
      'rule_id', v_rule.id, 'channel', v_rule.name, 'take_rate_bps', v_rule.take_rate_bps,
      'fee_payer', v_rule.gateway_fee_payer, 'chargeback_bearer', v_rule.chargeback_bearer);
  end if;

  select c.take_rate_bps into v_take from public.company c where c.id = p_company_id;
  return jsonb_build_object(
    'rule_id', null, 'channel', 'hub', 'take_rate_bps', coalesce(v_take, 0),
    'fee_payer', coalesce((select nullif(trim(value), '') from public.app_setting where key = 'commission_default_fee_payer'), 'movepark'),
    'chargeback_bearer', coalesce((select nullif(trim(value), '') from public.app_setting where key = 'commission_default_chargeback_bearer'), 'each'));
end $$;
revoke all on function public.resolve_commission(uuid, text, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.resolve_commission(uuid, text, text, timestamptz, timestamptz) to authenticated, service_role;

-- ── 5. Congelar na reserva ────────────────────────────────────────────────────────────────────
create or replace function public.booking_apply_commission(
  p_booking_id uuid,
  p_attribution jsonb default null
) returns jsonb
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
declare
  v_b record;
  v_attr jsonb;
  v_pkg jsonb;
  v_clicked timestamptz;
begin
  if not (public.is_hub_admin() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  select b.id, b.origin, b.created_at, b.attribution, b.utm_source, b.utm_medium, b.utm_campaign,
         b.commission_locked, b.commission_channel, b.commission_rule_id, b.commission_take_rate_bps,
         b.commission_fee_payer, b.commission_chargeback_bearer, l.company_id
    into v_b
    from public.booking b join public.location l on l.id = b.location_id
   where b.id = p_booking_id
   for update of b;
  if v_b.id is null then
    raise exception 'Reserva não encontrada.' using errcode = 'P0002';
  end if;

  -- Travada à mão, ou já cobrada: o pacote não muda mais (o split já foi ao gateway).
  if v_b.commission_locked or exists (
       select 1 from public.payment p where p.booking_id = p_booking_id and p.status in ('paid', 'refunded')) then
    return jsonb_build_object('rule_id', v_b.commission_rule_id, 'channel', v_b.commission_channel,
      'take_rate_bps', v_b.commission_take_rate_bps, 'fee_payer', v_b.commission_fee_payer,
      'chargeback_bearer', v_b.commission_chargeback_bearer, 'changed', false);
  end if;

  -- A prova: o que veio agora, senão o que já está na reserva, senão os utm_* soltos.
  v_attr := coalesce(nullif(p_attribution, 'null'::jsonb), v_b.attribution,
    case when v_b.utm_source is not null or v_b.utm_medium is not null or v_b.utm_campaign is not null
         then jsonb_build_object('utm_source', v_b.utm_source, 'utm_medium', v_b.utm_medium, 'utm_campaign', v_b.utm_campaign)
    end);
  if v_attr is not null then
    v_attr := v_attr || jsonb_build_object('origin', v_b.origin);
  end if;
  begin
    v_clicked := nullif(v_attr ->> 'clicked_at', '')::timestamptz;
  exception when others then
    v_clicked := null; -- data ilegível vinda do navegador não derruba a reserva
  end;

  v_pkg := public.resolve_commission(v_b.company_id, v_b.origin, v_attr ->> 'utm_source', v_clicked, v_b.created_at);

  update public.booking
     set commission_rule_id = nullif(v_pkg ->> 'rule_id', '')::uuid,
         commission_channel = v_pkg ->> 'channel',
         commission_take_rate_bps = (v_pkg ->> 'take_rate_bps')::int,
         commission_fee_payer = v_pkg ->> 'fee_payer',
         commission_chargeback_bearer = v_pkg ->> 'chargeback_bearer',
         attribution = coalesce(v_attr, attribution)
   where id = p_booking_id;
  return v_pkg || jsonb_build_object('changed', true);
end $$;
revoke all on function public.booking_apply_commission(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.booking_apply_commission(uuid, jsonb) to service_role;

-- ── 6. Correção manual (hub_admin), com histórico ─────────────────────────────────────────────
create or replace function public.admin_set_booking_commission(
  p_booking_id uuid,
  p_rule_id uuid,          -- nulo = volta para o padrão do Hub
  p_reason text
) returns jsonb
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
declare
  v_b record; v_rule public.commission_rule%rowtype; v_from jsonb; v_to jsonb; v_take int;
begin
  if not public.is_hub_admin() then
    raise exception 'Só a Movepark corrige a comissão de uma reserva.' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Informe o motivo da correção.' using errcode = '22023';
  end if;
  select b.*, l.company_id as v_company_id into v_b
    from public.booking b join public.location l on l.id = b.location_id
   where b.id = p_booking_id for update of b;
  if v_b.id is null then raise exception 'Reserva não encontrada.' using errcode = 'P0002'; end if;
  if exists (select 1 from public.payment p where p.booking_id = p_booking_id and p.status in ('paid', 'refunded')) then
    raise exception 'A reserva já foi paga: o split já foi ao gateway. O acerto é financeiro, por fora.' using errcode = '22023';
  end if;

  v_from := jsonb_build_object('rule_id', v_b.commission_rule_id, 'channel', v_b.commission_channel,
    'take_rate_bps', v_b.commission_take_rate_bps, 'fee_payer', v_b.commission_fee_payer,
    'chargeback_bearer', v_b.commission_chargeback_bearer);

  if p_rule_id is null then
    select c.take_rate_bps into v_take from public.company c where c.id = v_b.v_company_id;
    v_to := jsonb_build_object('rule_id', null, 'channel', 'hub', 'take_rate_bps', coalesce(v_take, 0),
      'fee_payer', coalesce((select nullif(trim(value), '') from public.app_setting where key = 'commission_default_fee_payer'), 'movepark'),
      'chargeback_bearer', coalesce((select nullif(trim(value), '') from public.app_setting where key = 'commission_default_chargeback_bearer'), 'each'));
  else
    select * into v_rule from public.commission_rule r
     where r.id = p_rule_id and r.deleted_at is null and (r.company_id is null or r.company_id = v_b.v_company_id);
    if v_rule.id is null then
      raise exception 'Regra não encontrada para a empresa desta reserva.' using errcode = 'P0002';
    end if;
    v_to := jsonb_build_object('rule_id', v_rule.id, 'channel', v_rule.name, 'take_rate_bps', v_rule.take_rate_bps,
      'fee_payer', v_rule.gateway_fee_payer, 'chargeback_bearer', v_rule.chargeback_bearer);
  end if;

  update public.booking
     set commission_rule_id = nullif(v_to ->> 'rule_id', '')::uuid,
         commission_channel = v_to ->> 'channel',
         commission_take_rate_bps = (v_to ->> 'take_rate_bps')::int,
         commission_fee_payer = v_to ->> 'fee_payer',
         commission_chargeback_bearer = v_to ->> 'chargeback_bearer',
         commission_locked = true
   where id = p_booking_id;
  insert into public.booking_commission_override (booking_id, from_package, to_package, reason, changed_by)
    values (p_booking_id, v_from, v_to, trim(p_reason), auth.uid());
  return v_to;
end $$;
revoke all on function public.admin_set_booking_commission(uuid, uuid, text) from public, anon;
grant execute on function public.admin_set_booking_commission(uuid, uuid, text) to authenticated;
