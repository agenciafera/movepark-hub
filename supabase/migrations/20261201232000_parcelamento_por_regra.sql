-- Parcelamento no cartão por regra de repasse e por empresa (09/11/2026).
--
-- A plataforma parcela em até 12x com 3x sem juros (`app_setting.card_installment_policy`). Há
-- estacionamento que não aceita o 3x sem juros: ou não parcela, ou parcela com os juros pagos pelo
-- cliente. E isso pode variar pela origem da venda. Decisões do Kallef em 09/11:
--   1. O parcelamento entra no PACOTE da comissão por origem (E0.3.12): a regra pode definir, e a
--      empresa tem um padrão próprio para a venda que não casa com regra nenhuma. A regra vence a
--      empresa, a empresa vence a plataforma.
--   2. Dois números, ambos opcionais: máximo de parcelas e até quantas sem juros. Nulos = herda.
--      Máximo 1 = só à vista. Sem juros até 1 = juros desde a 2ª, pagos pelo cliente. A taxa de
--      juros segue a da plataforma.
--   3. Congela na reserva com o resto do pacote (decisão 6 do E0.3.12): mudar a regra depois não
--      muda o que o cliente viu no checkout de uma reserva já criada.
--
-- O par vem sempre junto (os dois nulos ou os dois preenchidos) e "sem juros até" nunca passa do
-- máximo, por constraint nas três tabelas. O `is not null` explícito é de propósito: sem ele,
-- "6 parcelas e sem juros nulo" vira `null` no CHECK, e CHECK nulo passa. A cobrança (`create-card-charge`) aplica o par sobre a
-- política da plataforma e continua server-authoritative.

-- ── 1. Colunas ───────────────────────────────────────────────────────────────

alter table public.commission_rule
  add column if not exists installments_max smallint,
  add column if not exists installments_interest_free smallint;
alter table public.commission_rule
  add constraint commission_rule_installments_check check (
    (installments_max is null and installments_interest_free is null)
    or (installments_max is not null and installments_interest_free is not null
        and installments_max between 1 and 24
        and installments_interest_free between 1 and installments_max));

alter table public.company
  add column if not exists installments_max smallint,
  add column if not exists installments_interest_free smallint;
alter table public.company
  add constraint company_installments_check check (
    (installments_max is null and installments_interest_free is null)
    or (installments_max is not null and installments_interest_free is not null
        and installments_max between 1 and 24
        and installments_interest_free between 1 and installments_max));
-- A condição de parcelamento aparece no checkout: não é segredo comercial como a comissão.
-- Escrita só pela RPC abaixo (a policy `company_admin_write` já limita a hub_admin).
grant select (installments_max, installments_interest_free) on public.company to authenticated;

alter table public.booking
  add column if not exists commission_installments_max smallint,
  add column if not exists commission_installments_interest_free smallint;
alter table public.booking
  add constraint booking_commission_installments_check check (
    (commission_installments_max is null and commission_installments_interest_free is null)
    or (commission_installments_max is not null and commission_installments_interest_free is not null
        and commission_installments_max between 1 and 24
        and commission_installments_interest_free between 1 and commission_installments_max));

comment on column public.commission_rule.installments_max is
  'Máximo de parcelas no cartão nesta origem. Nulo (com installments_interest_free) = herda a empresa.';
comment on column public.commission_rule.installments_interest_free is
  'Parcelas sem juros (1 = juros desde a 2ª, pagos pelo cliente). Nulo = herda a empresa.';
comment on column public.company.installments_max is
  'Máximo de parcelas no cartão nas vendas desta empresa sem regra. Nulo = política da plataforma.';
comment on column public.company.installments_interest_free is
  'Parcelas sem juros nas vendas desta empresa sem regra. Nulo = política da plataforma.';
comment on column public.booking.commission_installments_max is
  'Parcelamento congelado na reserva (regra > empresa). Nulo = política da plataforma na hora da cobrança.';

-- ── 2. Resolução: o parcelamento entra no pacote ─────────────────────────────

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
  select c.take_rate_bps, c.installments_max, c.installments_interest_free into v_co
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
                                         else v_co.installments_interest_free end);
  end if;

  return jsonb_build_object(
    'rule_id', null, 'channel', 'hub', 'take_rate_bps', coalesce(v_co.take_rate_bps, 0),
    'fee_payer', coalesce((select nullif(trim(value), '') from public.app_setting where key = 'commission_default_fee_payer'), 'movepark'),
    'chargeback_bearer', coalesce((select nullif(trim(value), '') from public.app_setting where key = 'commission_default_chargeback_bearer'), 'each'),
    'installments_max', v_co.installments_max,
    'installments_interest_free', v_co.installments_interest_free);
end $function$;

-- ── 3. Congelamento na reserva ───────────────────────────────────────────────

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
         b.commission_installments_max, b.commission_installments_interest_free, l.company_id
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
      'installments_interest_free', v_b.commission_installments_interest_free, 'changed', false);
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
         attribution = coalesce(v_attr, attribution)
   where id = p_booking_id;
  return v_pkg || jsonb_build_object('changed', true);
end $function$;

-- ── 4. Correção manual do canal leva o parcelamento do canal novo ─────────────

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
    'installments_interest_free', v_b.commission_installments_interest_free);

  select c.take_rate_bps, c.installments_max, c.installments_interest_free into v_co
    from public.company c where c.id = v_b.v_company_id;

  if p_rule_id is null then
    v_to := jsonb_build_object('rule_id', null, 'channel', 'hub', 'take_rate_bps', coalesce(v_co.take_rate_bps, 0),
      'fee_payer', coalesce((select nullif(trim(value), '') from public.app_setting where key = 'commission_default_fee_payer'), 'movepark'),
      'chargeback_bearer', coalesce((select nullif(trim(value), '') from public.app_setting where key = 'commission_default_chargeback_bearer'), 'each'),
      'installments_max', v_co.installments_max,
      'installments_interest_free', v_co.installments_interest_free);
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
                                         else v_co.installments_interest_free end);
  end if;

  update public.booking
     set commission_rule_id = nullif(v_to ->> 'rule_id', '')::uuid,
         commission_channel = v_to ->> 'channel',
         commission_take_rate_bps = (v_to ->> 'take_rate_bps')::int,
         commission_fee_payer = v_to ->> 'fee_payer',
         commission_chargeback_bearer = v_to ->> 'chargeback_bearer',
         commission_installments_max = nullif(v_to ->> 'installments_max', '')::smallint,
         commission_installments_interest_free = nullif(v_to ->> 'installments_interest_free', '')::smallint,
         commission_locked = true
   where id = p_booking_id;
  insert into public.booking_commission_override (booking_id, from_package, to_package, reason, changed_by)
    values (p_booking_id, v_from, v_to, trim(p_reason), auth.uid());
  return v_to;
end $function$;

-- ── 5. A guarda de escrita direta cobre o parcelamento ───────────────────────
-- Sem isto, o dono da reserva (que tem UPDATE na linha pela RLS) dava PATCH em
-- `commission_installments_interest_free = 12` antes de pagar e parcelava sem juros onde o
-- estacionamento não aceita.

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
      new.commission_installments_max, new.commission_installments_interest_free)
     is distinct from
     (old.commission_rule_id, old.commission_channel, old.commission_take_rate_bps, old.commission_fee_payer,
      old.commission_chargeback_bearer, old.commission_locked, old.attribution,
      old.origin, old.utm_source, old.utm_medium, old.utm_campaign,
      old.commission_installments_max, old.commission_installments_interest_free) then
    raise exception 'A origem e a comissão da reserva não são editáveis por aqui.' using errcode = '42501';
  end if;
  return new;
end $function$;

-- ── 6. Padrão da empresa: só hub_admin grava ─────────────────────────────────

create or replace function public.set_company_installments(
  p_company_id uuid,
  p_installments_max integer,
  p_installments_interest_free integer
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_row record;
begin
  if not public.is_hub_admin() then
    raise exception 'Só a Movepark define o parcelamento de um estacionamento.' using errcode = '42501';
  end if;
  if (p_installments_max is null) <> (p_installments_interest_free is null) then
    raise exception 'Informe o máximo de parcelas e até quantas sem juros, ou deixe os dois em branco para herdar.'
      using errcode = '22023';
  end if;
  if p_installments_max is not null and not (
       p_installments_max between 1 and 24
       and p_installments_interest_free between 1 and p_installments_max) then
    raise exception 'O máximo vai de 1 a 24 parcelas, e as sem juros vão de 1 até o máximo.' using errcode = '22023';
  end if;

  update public.company
     set installments_max = p_installments_max,
         installments_interest_free = p_installments_interest_free
   where id = p_company_id and deleted_at is null
  returning id, installments_max, installments_interest_free into v_row;
  if v_row.id is null then
    raise exception 'Empresa não encontrada.' using errcode = 'P0002';
  end if;
  return jsonb_build_object('id', v_row.id, 'installments_max', v_row.installments_max,
    'installments_interest_free', v_row.installments_interest_free);
end $function$;

revoke execute on function public.set_company_installments(uuid, integer, integer) from public, anon;
grant execute on function public.set_company_installments(uuid, integer, integer) to authenticated, service_role;
