-- Comissão por origem: a regra também reconhece o SITE de onde o cliente veio (18/11/2026).
-- Spec: docs/specs/comissao-por-origem.md, seção "Site de origem (18/11/2026)".
--
-- Até aqui a regra só reconhecia `utm_source`. A Pare Seguro manda o cliente do site dela com
-- `utm_source=pareseguro`, mas nem todo link leva UTM, e o anúncio da própria Pare Seguro repassa
-- `utm_source=google` no link: essa venda caía na comissão do Hub mesmo vindo de pareseguro.com.
-- A regra ganha uma lista de domínios. Quem chega de `pareseguro.com` (ou `www.pareseguro.com`)
-- casa a regra, com ou sem UTM, dentro da mesma janela de atribuição.
--
-- De onde sai o domínio: do endereço da página que trouxe o cliente, que o navegador manda no
-- cabeçalho Referer da navegação e expõe como `document.referrer` (com a política padrão é só a
-- origem, `https://pareseguro.com/`). O cabeçalho Origin da chamada que cria a reserva não serve:
-- ela parte do próprio site da Movepark. O front guarda essa chegada (src/lib/utm.ts) e a Edge
-- `create-booking` a manda como prova, igual ao UTM.
--
-- Duas provas, uma ordem:
--   1. `attribution.referrals`: chegadas SEM UTM vindas de outro site, a mais nova primeiro. Só
--      valem se o domínio estiver cadastrado numa regra; senão são ignoradas, e por isso uma visita
--      vinda da busca do Google não apaga o clique no link do parceiro.
--   2. O último clique com UTM (`utm_source`, `clicked_at`, `referrer`): casa pelo UTM ou pelo
--      domínio de onde veio esse clique.
-- O clique com UTM limpa as chegadas guardadas antes dele, então a ordem é o último clique.

-- ── 1. Coluna ───────────────────────────────────────────────────────────────
alter table public.commission_rule
  add column if not exists referrer_domains text[] not null default '{}';

comment on column public.commission_rule.referrer_domains is
  'Domínios de onde o cliente vem (Referer da navegação). Normalizados sem esquema, caminho, porta e www. Casa o domínio e os subdomínios dele.';

alter table public.commission_rule drop constraint if exists commission_rule_reconhece_algo;
alter table public.commission_rule add constraint commission_rule_reconhece_algo
  check (match_white_label or cardinality(utm_sources) > 0 or cardinality(referrer_domains) > 0);

-- ── 2. Domínio normalizado ──────────────────────────────────────────────────
-- "https://WWW.PareSeguro.com:443/reserva?x=1" vira "pareseguro.com". Serve para o que a Movepark
-- cadastra na regra e para o referrer que o navegador manda, para os dois lados serem comparáveis.
create or replace function public.commission_domain(p text)
returns text
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select nullif(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            split_part(split_part(split_part(
              regexp_replace(lower(trim(coalesce(p, ''))), '^[a-z][a-z0-9+.-]*://', ''),
              '/', 1), '?', 1), '#', 1),
            '^[^@]*@', ''),       -- usuário:senha@
          ':[0-9]*$', ''),        -- porta
        '\.$', ''),               -- ponto final do FQDN
      '^www\.', ''),
    '')
$$;

revoke all on function public.commission_domain(text) from public, anon;
grant execute on function public.commission_domain(text) to authenticated, service_role;

-- ── 3. Normalização e unicidade no cadastro ─────────────────────────────────
create or replace function public.commission_rule_normalize()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare v_dup text; v_bad text;
begin
  new.utm_sources := coalesce((
    select array_agg(distinct u order by u)
      from (select nullif(lower(trim(x)), '') as u from unnest(coalesce(new.utm_sources, '{}')) x) s
     where u is not null), '{}');

  select x into v_bad
    from unnest(coalesce(new.referrer_domains, '{}')) x
   where nullif(trim(x), '') is not null
     and coalesce(public.commission_domain(x), '') !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
   limit 1;
  if v_bad is not null then
    raise exception 'O site "%" não é um domínio válido. Use só o endereço, como pareseguro.com.', v_bad
      using errcode = '22023';
  end if;
  new.referrer_domains := coalesce((
    select array_agg(distinct d order by d)
      from (select public.commission_domain(x) as d from unnest(coalesce(new.referrer_domains, '{}')) x) s
     where d is not null), '{}');

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

  if new.deleted_at is null and new.is_active and cardinality(new.referrer_domains) > 0 then
    select d into v_dup
      from public.commission_rule r, unnest(r.referrer_domains) d
     where r.id <> new.id and r.deleted_at is null and r.is_active
       and r.company_id is not distinct from new.company_id
       and d = any(new.referrer_domains)
     limit 1;
    if v_dup is not null then
      raise exception 'O site "%" já está em outra regra ativa deste dono.', v_dup using errcode = '23505';
    end if;
  end if;
  return new;
end $$;

-- ── 4. Resolução ────────────────────────────────────────────────────────────
-- Assinatura nova (p_referrer no fim, com default): a antiga sai para não haver duas funções
-- que aceitem a mesma chamada de 5 argumentos.
drop function if exists public.resolve_commission(uuid, text, text, timestamptz, timestamptz);

create function public.resolve_commission(
  p_company_id uuid,
  p_origin text,
  p_utm_source text,
  p_clicked_at timestamptz,
  p_at timestamptz default now(),
  p_referrer text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_utm text := nullif(lower(trim(coalesce(p_utm_source, ''))), '');
  v_host text := public.commission_domain(p_referrer);
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
       -- UTM cadastrado ou site de origem cadastrado, com o clique dentro da janela DA REGRA
       -- (ou da global, quando ela não tem). O site casa o domínio e os subdomínios dele.
       (
         (   (v_utm is not null and v_utm = any(r.utm_sources))
          or (v_host is not null and exists (
                select 1 from unnest(r.referrer_domains) d
                 where v_host = d or right(v_host, length(d) + 1) = '.' || d)))
         and v_clicked <= p_at + interval '5 minutes'
         and v_clicked >= p_at - make_interval(days => coalesce(r.attribution_window_days, v_days))
       )
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
end $$;

revoke all on function public.resolve_commission(uuid, text, text, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.resolve_commission(uuid, text, text, timestamptz, timestamptz, text) to authenticated, service_role;

-- ── 5. Congelamento na reserva ──────────────────────────────────────────────
create or replace function public.booking_apply_commission(p_booking_id uuid, p_attribution jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_b record;
  v_attr jsonb;
  v_pkg jsonb;
  v_try jsonb;
  v_ref jsonb;
  v_clicked timestamptz;
  v_arrived timestamptz;
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

  -- 1. Chegadas sem UTM vindas de outro site, a mais nova primeiro (a Edge ordena e limita a 5).
  --    Só contam se o site estiver cadastrado numa regra, e só com a hora da chegada: sem ela não
  --    há janela para conferir. A origem vai nula para o white-label não casar por este caminho.
  if jsonb_typeof(v_attr -> 'referrals') = 'array' then
    for v_ref in
      select e from jsonb_array_elements(v_attr -> 'referrals') with ordinality as t(e, i) order by i limit 5
    loop
      continue when jsonb_typeof(v_ref) <> 'object' or nullif(v_ref ->> 'referrer', '') is null;
      begin
        v_arrived := nullif(v_ref ->> 'arrived_at', '')::timestamptz;
      exception when others then
        v_arrived := null;
      end;
      continue when v_arrived is null;
      v_try := public.resolve_commission(v_b.company_id, null, null, v_arrived, v_b.created_at, v_ref ->> 'referrer');
      if v_try ->> 'rule_id' is not null then
        v_pkg := v_try;
        exit;
      end if;
    end loop;
  end if;

  -- 2. O último clique com UTM: casa pelo UTM ou pelo site de onde veio esse clique.
  if v_pkg is null then
    v_pkg := public.resolve_commission(v_b.company_id, v_b.origin, v_attr ->> 'utm_source', v_clicked,
                                       v_b.created_at, v_attr ->> 'referrer');
  end if;

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
end $$;

-- ── 6. O que o parceiro vê ──────────────────────────────────────────────────
create or replace function public.my_commission_channels(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
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
           'referrer_domains', to_jsonb(r.referrer_domains),
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
end $$;

-- ── 7. Pare Seguro: o site deles conta como origem (pedido do Kallef, 18/11/2026) ──
-- No replay do CI a regra não existe e o update não acha linha: não há o que quebrar.
update public.commission_rule
   set referrer_domains = array['pareseguro.com']
 where id = 'eb5878cc-1ab6-46bb-b0de-329208cea5f4' and deleted_at is null;
