-- Janela de atribuição por regra (22/09/2026). Spec: docs/specs/comissao-por-origem.md
--
-- A janela ("clicou no link, a venda conta por X dias") é característica do canal, não do Hub: um
-- link de Instagram merece dias, um link de WhatsApp para cliente já decidido merece horas. A regra
-- ganha o próprio prazo; vazio herda `app_setting.commission_attribution_window_days` (7).

alter table public.commission_rule
  add column if not exists attribution_window_days integer
  check (attribution_window_days is null or attribution_window_days between 1 and 90);
comment on column public.commission_rule.attribution_window_days is
  'Dias entre o clique no link e a reserva para a venda contar nesta regra. Nulo herda o global.';

CREATE OR REPLACE FUNCTION public.resolve_commission(p_company_id uuid, p_origin text, p_utm_source text, p_clicked_at timestamp with time zone, p_at timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_utm text := nullif(lower(trim(coalesce(p_utm_source, ''))), '');
  v_days int := coalesce((select nullif(trim(value), '')::int from public.app_setting where key = 'commission_attribution_window_days'), 7);
  -- Sem data do clique (cliente antigo, API) vale a hora da reserva; com data, tem que caber na janela.
  v_clicked timestamptz := coalesce(p_clicked_at, p_at);
  v_rule public.commission_rule%rowtype;
  v_take int;
begin
  if not (public.is_hub_admin() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
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
      'fee_payer', v_rule.gateway_fee_payer, 'chargeback_bearer', v_rule.chargeback_bearer);
  end if;

  select c.take_rate_bps into v_take from public.company c where c.id = p_company_id;
  return jsonb_build_object(
    'rule_id', null, 'channel', 'hub', 'take_rate_bps', coalesce(v_take, 0),
    'fee_payer', coalesce((select nullif(trim(value), '') from public.app_setting where key = 'commission_default_fee_payer'), 'movepark'),
    'chargeback_bearer', coalesce((select nullif(trim(value), '') from public.app_setting where key = 'commission_default_chargeback_bearer'), 'each'));
end $function$

;
CREATE OR REPLACE FUNCTION public.my_commission_channels(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_rules jsonb; v_locations jsonb; v_take int;
begin
  if not public.is_hub_admin() and p_company_id not in (select public.current_company_ids()) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if not public.member_has_scope(p_company_id, 'finance:read') then
    raise exception 'Seu papel não permite ver a comissão (finance:read).' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'name', r.name, 'utm_sources', to_jsonb(r.utm_sources),
           'match_white_label', r.match_white_label, 'take_rate_bps', r.take_rate_bps,
           'valid_until', r.valid_until, 'window_days', r.attribution_window_days)
           order by r.priority desc, r.created_at desc), '[]'::jsonb)
    into v_rules
    from public.commission_rule r
   where r.company_id = p_company_id and r.deleted_at is null and r.is_active
     and (r.valid_from is null or r.valid_from <= now())
     and (r.valid_until is null or r.valid_until > now());

  select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'public_path', public.location_public_path(l))
           order by l.name), '[]'::jsonb)
    into v_locations
    from public.location l
   where l.company_id = p_company_id and l.deleted_at is null
     and public.location_public_path(l) is not null;

  select c.take_rate_bps into v_take from public.company c where c.id = p_company_id;

  return jsonb_build_object(
    'default_take_rate_bps', coalesce(v_take, 0),
    'window_days', coalesce((select nullif(trim(value), '')::int from public.app_setting
                              where key = 'commission_attribution_window_days'), 7),
    'rules', v_rules, 'locations', v_locations);
end $function$

;
