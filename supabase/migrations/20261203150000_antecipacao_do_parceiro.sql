-- Antecipação do cartão do parceiro (E0.3.14, 13/11/2026). Spec: docs/specs/antecipacao-do-parceiro.md
--
-- A Pagar.me antecipa por recebedor e desconta a taxa do recebedor antecipado; o split não tem
-- campo para isso. Decisões do Kallef: quem paga é configurável (empresa e regra de origem),
-- Movepark por padrão, congelado na reserva; a Movepark paga mandando a estimativa a mais no split,
-- e toda taxa dela que cair no estacionamento vira crédito. As condições comerciais NÃO entram aqui
-- (repo público): a taxa de antecipação é gravada direto em app_setting, fora de migration.

-- ── 1. Configuração ──────────────────────────────────────────────────────────
insert into public.app_setting(key, value) values
  ('commission_default_anticipation_payer', 'movepark'),
  ('card_anticipation_margin_days', '4'),
  ('card_anticipation_rate_monthly_bps', '')
on conflict (key) do nothing;

alter table public.company add column if not exists anticipation_fee_payer text
  check (anticipation_fee_payer in ('movepark', 'partner'));
grant select (anticipation_fee_payer) on public.company to authenticated;
comment on column public.company.anticipation_fee_payer is
  'Quem paga a antecipação da parte do parceiro nas vendas sem regra (E0.3.14). Nulo = commission_default_anticipation_payer.';

alter table public.commission_rule add column if not exists anticipation_fee_payer text
  check (anticipation_fee_payer in ('movepark', 'partner'));
comment on column public.commission_rule.anticipation_fee_payer is
  'Quem paga a antecipação nesta origem (E0.3.14). Nulo = herda a empresa.';

alter table public.booking add column if not exists commission_anticipation_payer text
  check (commission_anticipation_payer in ('movepark', 'partner'));
comment on column public.booking.commission_anticipation_payer is
  'Pagador da antecipação congelado na reserva (regra > empresa > padrão). Nulo = movepark.';

alter table public.payment
  add column if not exists anticipation_comp_cents integer,
  add column if not exists anticipation_credit_cents integer not null default 0,
  add column if not exists anticipation_fee_partner_cents integer,
  add column if not exists anticipation_fee_movepark_cents integer,
  add column if not exists anticipation_reread_at timestamptz;
comment on column public.payment.anticipation_comp_cents is
  'Quanto a perna da Movepark cedeu ao parceiro na cobrança para cobrir a antecipação (E0.3.14).';
comment on column public.payment.anticipation_credit_cents is
  'Taxa de antecipação da Movepark que caiu no parceiro e vira crédito: o que não coube no split mais a falta medida na releitura.';
comment on column public.payment.anticipation_reread_at is
  'Releitura única dos recebíveis depois da antecipação (~D+31), feita pelo reconcile-gateway-fees.';

create index if not exists payment_anticipation_reread_idx on public.payment (paid_at)
  where provider = 'pagarme' and method = 'card' and status = 'paid' and anticipation_reread_at is null;

-- ── 2. Antecipação pontual ("Antecipar agora") ───────────────────────────────
create table if not exists public.payout_anticipation (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id),
  provider text not null default 'pagarme',
  external_id text,
  requested_cents bigint not null check (requested_cents > 0),
  amount_cents bigint,
  anticipation_fee_cents bigint,
  fee_cents bigint,
  timeframe text not null default 'start' check (timeframe in ('start', 'end')),
  status text not null check (status in ('pending', 'pre_approved', 'approved', 'refused', 'canceled')),
  fee_borne_by text not null check (fee_borne_by in ('movepark', 'partner')),
  payment_date timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
comment on table public.payout_anticipation is
  'Antecipação pontual do recebedor de um parceiro (E0.3.14). fee_borne_by congela quem paga no pedido.';
create unique index if not exists payout_anticipation_external_uq
  on public.payout_anticipation (provider, external_id) where external_id is not null;
create index if not exists payout_anticipation_company_idx on public.payout_anticipation (company_id, created_at desc);
drop trigger if exists set_updated_at on public.payout_anticipation;
create trigger set_updated_at before update on public.payout_anticipation
  for each row execute function public.set_updated_at();
alter table public.payout_anticipation enable row level security;
drop policy if exists payout_anticipation_admin_all on public.payout_anticipation;
create policy payout_anticipation_admin_all on public.payout_anticipation
  for all to authenticated using (public.is_hub_admin()) with check (public.is_hub_admin());
revoke all on public.payout_anticipation from anon;

-- ── 3. Resolução, congelamento, correção e guarda: o pagador entra no pacote ──

create or replace function public.resolve_commission(
  p_company_id uuid,
  p_origin text,
  p_utm_source text,
  p_clicked_at timestamp with time zone,
  p_at timestamp with time zone default now()
)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_utm text := nullif(lower(trim(coalesce(p_utm_source, ''))), '');
  v_days int := coalesce((select nullif(trim(value), '')::int from public.app_setting where key = 'commission_attribution_window_days'), 7);
  -- Sem data do clique (cliente antigo, API) vale a hora da reserva; com data, tem que caber na janela.
  v_clicked timestamptz := coalesce(p_clicked_at, p_at);
  v_rule public.commission_rule%rowtype;
  v_co record;
begin
  if not (public.is_hub_admin() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  select c.take_rate_bps, c.installments_max, c.installments_interest_free, c.anticipation_fee_payer into v_co
    from public.company c where c.id = p_company_id;

  select r.* into v_rule
    from public.commission_rule r
   where r.deleted_at is null and r.is_active
     and (r.valid_from is null or r.valid_from <= p_at)
     and (r.valid_until is null or r.valid_until > p_at)
     and (r.company_id = p_company_id or r.company_id is null)
     and (
       -- UTM cadastrado, com o clique dentro da janela DA REGRA (ou da global, quando ela não tem).
       (v_utm is not null and v_utm = any(r.utm_sources)
         and v_clicked <= p_at + interval '5 minutes'
         and v_clicked >= p_at - make_interval(days => coalesce(r.attribution_window_days, v_days)))
       or (r.match_white_label and r.company_id = p_company_id and p_origin = 'white_label')
     )
   order by (r.company_id is not null) desc, r.priority desc, r.created_at desc
   limit 1;

  if v_rule.id is not null then
    return jsonb_build_object(
      'rule_id', v_rule.id, 'channel', v_rule.name, 'take_rate_bps', v_rule.take_rate_bps,
      'fee_payer', v_rule.gateway_fee_payer, 'chargeback_bearer', v_rule.chargeback_bearer,
      -- Parcelamento: o da regra; sem ele, o da empresa; sem os dois, nulo (plataforma).
      'installments_max', coalesce(v_rule.installments_max, v_co.installments_max),
      'installments_interest_free', case when v_rule.installments_max is not null
                                         then v_rule.installments_interest_free
                                         else v_co.installments_interest_free end,
      -- Antecipação (E0.3.14): a da regra; sem ela, a da empresa; sem as duas, o padrão do Hub.
      'anticipation_payer', coalesce(v_rule.anticipation_fee_payer, v_co.anticipation_fee_payer, coalesce((select nullif(trim(value), '') from public.app_setting where key = 'commission_default_anticipation_payer'), 'movepark')));
  end if;

  return jsonb_build_object(
    'rule_id', null, 'channel', 'hub', 'take_rate_bps', coalesce(v_co.take_rate_bps, 0),
    'fee_payer', coalesce((select nullif(trim(value), '') from public.app_setting where key = 'commission_default_fee_payer'), 'movepark'),
    'chargeback_bearer', coalesce((select nullif(trim(value), '') from public.app_setting where key = 'commission_default_chargeback_bearer'), 'each'),
    'installments_max', v_co.installments_max,
    'installments_interest_free', v_co.installments_interest_free,
    'anticipation_payer', coalesce(v_co.anticipation_fee_payer, coalesce((select nullif(trim(value), '') from public.app_setting where key = 'commission_default_anticipation_payer'), 'movepark')));
end $function$;

create or replace function public.booking_apply_commission(p_booking_id uuid, p_attribution jsonb default null::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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
         b.commission_fee_payer, b.commission_chargeback_bearer,
         b.commission_installments_max, b.commission_installments_interest_free,
         b.commission_anticipation_payer, l.company_id
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
      'chargeback_bearer', v_b.commission_chargeback_bearer,
      'installments_max', v_b.commission_installments_max,
      'installments_interest_free', v_b.commission_installments_interest_free,
      'anticipation_payer', v_b.commission_anticipation_payer, 'changed', false);
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
         commission_installments_max = nullif(v_pkg ->> 'installments_max', '')::smallint,
         commission_installments_interest_free = nullif(v_pkg ->> 'installments_interest_free', '')::smallint,
         commission_anticipation_payer = v_pkg ->> 'anticipation_payer',
         attribution = coalesce(v_attr, attribution)
   where id = p_booking_id;
  return v_pkg || jsonb_build_object('changed', true);
end $function$;

create or replace function public.admin_set_booking_commission(p_booking_id uuid, p_rule_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_b record; v_rule public.commission_rule%rowtype; v_from jsonb; v_to jsonb; v_co record;
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
    'chargeback_bearer', v_b.commission_chargeback_bearer,
    'installments_max', v_b.commission_installments_max,
    'installments_interest_free', v_b.commission_installments_interest_free,
    'anticipation_payer', v_b.commission_anticipation_payer);

  select c.take_rate_bps, c.installments_max, c.installments_interest_free, c.anticipation_fee_payer into v_co
    from public.company c where c.id = v_b.v_company_id;

  if p_rule_id is null then
    v_to := jsonb_build_object('rule_id', null, 'channel', 'hub', 'take_rate_bps', coalesce(v_co.take_rate_bps, 0),
      'fee_payer', coalesce((select nullif(trim(value), '') from public.app_setting where key = 'commission_default_fee_payer'), 'movepark'),
      'chargeback_bearer', coalesce((select nullif(trim(value), '') from public.app_setting where key = 'commission_default_chargeback_bearer'), 'each'),
      'installments_max', v_co.installments_max,
      'installments_interest_free', v_co.installments_interest_free,
      'anticipation_payer', coalesce(v_co.anticipation_fee_payer, coalesce((select nullif(trim(value), '') from public.app_setting where key = 'commission_default_anticipation_payer'), 'movepark')));
  else
    select * into v_rule from public.commission_rule r
     where r.id = p_rule_id and r.deleted_at is null and (r.company_id is null or r.company_id = v_b.v_company_id);
    if v_rule.id is null then
      raise exception 'Regra não encontrada para a empresa desta reserva.' using errcode = 'P0002';
    end if;
    v_to := jsonb_build_object('rule_id', v_rule.id, 'channel', v_rule.name, 'take_rate_bps', v_rule.take_rate_bps,
      'fee_payer', v_rule.gateway_fee_payer, 'chargeback_bearer', v_rule.chargeback_bearer,
      'installments_max', coalesce(v_rule.installments_max, v_co.installments_max),
      'installments_interest_free', case when v_rule.installments_max is not null
                                         then v_rule.installments_interest_free
                                         else v_co.installments_interest_free end,
      'anticipation_payer', coalesce(v_rule.anticipation_fee_payer, v_co.anticipation_fee_payer, coalesce((select nullif(trim(value), '') from public.app_setting where key = 'commission_default_anticipation_payer'), 'movepark')));
  end if;

  update public.booking
     set commission_rule_id = nullif(v_to ->> 'rule_id', '')::uuid,
         commission_channel = v_to ->> 'channel',
         commission_take_rate_bps = (v_to ->> 'take_rate_bps')::int,
         commission_fee_payer = v_to ->> 'fee_payer',
         commission_chargeback_bearer = v_to ->> 'chargeback_bearer',
         commission_installments_max = nullif(v_to ->> 'installments_max', '')::smallint,
         commission_installments_interest_free = nullif(v_to ->> 'installments_interest_free', '')::smallint,
         commission_anticipation_payer = v_to ->> 'anticipation_payer',
         commission_locked = true
   where id = p_booking_id;
  insert into public.booking_commission_override (booking_id, from_package, to_package, reason, changed_by)
    values (p_booking_id, v_from, v_to, trim(p_reason), auth.uid());
  return v_to;
end $function$;

create or replace function public.booking_guard_commission()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if (new.commission_rule_id, new.commission_channel, new.commission_take_rate_bps, new.commission_fee_payer,
      new.commission_chargeback_bearer, new.commission_locked, new.attribution,
      new.origin, new.utm_source, new.utm_medium, new.utm_campaign,
      new.commission_installments_max, new.commission_installments_interest_free,
      new.commission_anticipation_payer)
     is distinct from
     (old.commission_rule_id, old.commission_channel, old.commission_take_rate_bps, old.commission_fee_payer,
      old.commission_chargeback_bearer, old.commission_locked, old.attribution,
      old.origin, old.utm_source, old.utm_medium, old.utm_campaign,
      old.commission_installments_max, old.commission_installments_interest_free,
      old.commission_anticipation_payer) then
    raise exception 'A origem e a comissão da reserva não são editáveis por aqui.' using errcode = '42501';
  end if;
  return new;
end $function$;

-- ── 4. Padrão da empresa: só hub_admin grava ─────────────────────────────────
create or replace function public.set_company_anticipation(p_company_id uuid, p_fee_payer text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_row record;
begin
  if not public.is_hub_admin() then
    raise exception 'Só a Movepark define quem paga a antecipação.' using errcode = '42501';
  end if;
  if p_fee_payer is not null and p_fee_payer not in ('movepark', 'partner') then
    raise exception 'Quem paga a antecipação é movepark ou partner.' using errcode = '22023';
  end if;
  update public.company set anticipation_fee_payer = p_fee_payer
   where id = p_company_id and deleted_at is null
  returning id, anticipation_fee_payer into v_row;
  if v_row.id is null then
    raise exception 'Empresa não encontrada.' using errcode = 'P0002';
  end if;
  return jsonb_build_object('id', v_row.id, 'anticipation_fee_payer', v_row.anticipation_fee_payer);
end $function$;
revoke all on function public.set_company_anticipation(uuid, text) from public, anon, authenticated;
grant execute on function public.set_company_anticipation(uuid, text) to authenticated, service_role;

-- ── 5. Crédito generalizado: toda taxa de antecipação da Movepark que caiu no parceiro ──
create or replace function public.payout_fee_credit_cents(p_company_id uuid, p_provider text default 'pagarme') returns bigint
  language sql stable security definer set search_path = public, pg_temp as $$
  with gerada as (
    select (
      coalesce((select sum(w.fee_cents) from public.payout_withdrawal w
                 where w.company_id = p_company_id and w.provider = p_provider and w.deleted_at is null
                   and w.fee_borne_by = 'movepark' and w.status in ('created', 'processing', 'paid')), 0)
      -- E0.3.14: antecipação pontual paga pela Movepark e aprovada pelo gateway.
    + coalesce((select sum(a.anticipation_fee_cents) from public.payout_anticipation a
                 where a.company_id = p_company_id and a.provider = p_provider and a.deleted_at is null
                   and a.fee_borne_by = 'movepark' and a.status = 'approved'), 0)
      -- E0.3.14: compensação que não coube no split e falta medida na releitura.
    + coalesce((select sum(p.anticipation_credit_cents) from public.payment p
                 join public.booking b on b.id = p.booking_id
                 join public.location l on l.id = b.location_id
                 where p.provider = p_provider and l.company_id = p_company_id
                   and p.status in ('paid', 'refunded')), 0)
    )::bigint as cents
  ),
  devolvida as (
    select coalesce(sum(p.fee_credit_returned_cents), 0)::bigint as cents
      from public.payment p
      join public.booking b on b.id = p.booking_id
      join public.location l on l.id = b.location_id
     where p.provider = p_provider and l.company_id = p_company_id and p.split_sent_to_gateway is true
       and (p.status in ('paid', 'authorized', 'refunded')
            or (p.status = 'pending' and coalesce(p.expires_at, p.created_at + interval '1 hour') > now()))
  ),
  reservada as (
    select coalesce(sum(amount_cents), 0)::bigint as cents
      from public.payout_fee_credit_reservation
     where company_id = p_company_id and provider = p_provider and consumed_by_payment_id is null and expires_at > now()
  )
  select greatest(0, gerada.cents - devolvida.cents - reservada.cents) from gerada, devolvida, reservada;
$$;
revoke all on function public.payout_fee_credit_cents(uuid, text) from public, anon;
grant execute on function public.payout_fee_credit_cents(uuid, text) to authenticated, service_role;

-- ── 6. Chave interna da Edge recipient-anticipation (cron de status e gates) ──
select vault.create_secret(
  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  'recipient_anticipation_key',
  'Chave interna da Edge recipient-anticipation (cron envia no header; Edge lê via RPC).'
) where not exists (select 1 from vault.secrets where name = 'recipient_anticipation_key');

create or replace function public.recipient_anticipation_expected_key()
returns text language sql security definer set search_path to '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'recipient_anticipation_key' limit 1;
$$;
revoke all on function public.recipient_anticipation_expected_key() from public, anon, authenticated;
grant execute on function public.recipient_anticipation_expected_key() to service_role;
