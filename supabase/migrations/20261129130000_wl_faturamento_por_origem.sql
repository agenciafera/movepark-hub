-- Reservas unificadas, fase 5 (09/10/2026): faturamento separado por origem, Hub e white-label.
-- Spec: docs/specs/reservas-unificadas-hub-wl.md § 6, D4, D4b e D6.
--
--   1. `company.wl_take_rate_bps`: comissão da Movepark sobre o que o site white-label vende (D4b),
--      separada do `take_rate_bps` do Hub. Nula = ainda não combinada, e aí a comissão do site não
--      é calculada (não se inventa zero). Fica fora do grant do `authenticated`, como a do Hub: o
--      parceiro não a vê; o hub_admin lê por `manager_company_restricted` e grava por
--      `set_company_wl_take_rate`.
--   2. `set_company_take_rate` devolvia a linha inteira de `company` (`returning *`), com o segredo
--      do WPS, contornando o privilégio por coluna de 20261129090500. Passa a devolver só o que
--      gravou.
--   3. `wl_revenue`: o faturamento do site no recorte (total, por dia e por empresa), lido pelos
--      dashboards, Relatórios, Faturamento e Atribuição. Base (§ 6): `paid_total_price` do pedido
--      pago, a mesma do relatório do legado; "pagas" conta também o reembolsado (o dinheiro entrou),
--      e o valor só o pago não devolvido, igual ao Hub em `bookings_list_page`. A comissão é
--      calculada na leitura (`paid × wl_take_rate_bps`) e só sai para o hub_admin.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Comissão do white-label
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.company
  add column if not exists wl_take_rate_bps integer
    check (wl_take_rate_bps is null or (wl_take_rate_bps between 0 and 10000));

comment on column public.company.wl_take_rate_bps is
  'Comissão da Movepark sobre o valor pago no site white-label da empresa, em basis points (D4b). Nula = não combinada. Só hub_admin lê (manager_company_restricted) e grava (set_company_wl_take_rate).';

-- O grant por coluna de 20261129090500 não inclui a coluna nova: o parceiro não a lê.

drop function if exists public.manager_company_restricted(uuid[]);
create function public.manager_company_restricted(p_company_ids uuid[])
returns table (
  id uuid,
  take_rate_bps integer,
  wl_take_rate_bps integer,
  wl_tenant_key text,
  has_wps_webhook_secret boolean,
  contract_accepted_ip text
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if not public.is_hub_admin() then
    raise exception 'Apenas a equipe Movepark lê esses dados da empresa.' using errcode = '42501';
  end if;

  -- O segredo do WPS nunca sai: só se ele existe (o formulário trata como só gravação).
  return query
    select c.id, c.take_rate_bps::integer, c.wl_take_rate_bps, c.wl_tenant_key,
           nullif(btrim(coalesce(c.wps_webhook_secret, '')), '') is not null,
           c.contract_accepted_ip::text
      from public.company c
     where c.id = any (coalesce(p_company_ids, '{}'::uuid[]));
end $function$;

revoke all on function public.manager_company_restricted(uuid[]) from public, anon;
grant execute on function public.manager_company_restricted(uuid[]) to authenticated;

create or replace function public.set_company_wl_take_rate(p_company_id uuid, p_wl_take_rate_bps integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id uuid;
begin
  if not public.is_hub_admin() then
    raise exception 'Apenas administradores da Movepark podem alterar comissões.' using errcode = '42501';
  end if;
  if p_wl_take_rate_bps is not null and (p_wl_take_rate_bps < 0 or p_wl_take_rate_bps > 10000) then
    raise exception 'Comissão inválida: informe um valor entre 0%% e 100%%.' using errcode = 'P0001';
  end if;

  update public.company
     set wl_take_rate_bps = p_wl_take_rate_bps
   where id = p_company_id and deleted_at is null
     and nullif(btrim(coalesce(wl_domain, '')), '') is not null
  returning id into v_id;

  if v_id is null then
    raise exception 'Empresa não encontrada ou sem white-label.' using errcode = 'P0001';
  end if;

  return jsonb_build_object('id', v_id, 'wl_take_rate_bps', p_wl_take_rate_bps);
end $function$;

comment on function public.set_company_wl_take_rate(uuid, integer) is
  'Define a comissão da Movepark sobre o site white-label (wl_take_rate_bps, 0..10000 ou nula). Só hub_admin, só empresa com white-label.';

revoke all on function public.set_company_wl_take_rate(uuid, integer) from public, anon;
grant execute on function public.set_company_wl_take_rate(uuid, integer) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. set_company_take_rate sem devolver a linha inteira
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.set_company_take_rate(uuid, integer);
create function public.set_company_take_rate(p_company_id uuid, p_take_rate_bps integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id uuid;
begin
  if not public.is_hub_admin() then
    raise exception 'Apenas administradores da Movepark podem alterar comissões.' using errcode = '42501';
  end if;
  if p_take_rate_bps is null or p_take_rate_bps < 0 or p_take_rate_bps > 10000 then
    raise exception 'Comissão inválida: informe um valor entre 0%% e 100%%.' using errcode = 'P0001';
  end if;

  update public.company
     set take_rate_bps = p_take_rate_bps
   where id = p_company_id and deleted_at is null
  returning id into v_id;

  if v_id is null then
    raise exception 'Empresa não encontrada.' using errcode = 'P0001';
  end if;

  -- Só o que gravou: a linha inteira levava o segredo do WPS junto.
  return jsonb_build_object('id', v_id, 'take_rate_bps', p_take_rate_bps);
end $function$;

comment on function public.set_company_take_rate(uuid, integer) is
  'Define a comissão da Movepark (take_rate_bps, 0..10000) de uma empresa. Só hub_admin. Devolve só id e taxa.';

revoke all on function public.set_company_take_rate(uuid, integer) from public, anon;
grant execute on function public.set_company_take_rate(uuid, integer) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Faturamento do site no recorte
-- ─────────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER porque lê `wl_take_rate_bps`, que o parceiro não pode ler; o recorte é o da
-- lista (`wl_visible_company_ids`: empresa com white-label em que quem chama é hub_admin ou tem
-- `wl-bookings:read`). Para quem não tem white-label tudo sai zerado.
create or replace function public.wl_revenue(
  p_from timestamptz,
  p_to timestamptz,
  p_location_ids uuid[] default null,
  p_company_ids uuid[] default null,
  p_date_field text default 'check_in_at'
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_admin boolean := public.is_hub_admin();
  v_companies uuid[];
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Autenticação necessária.' using errcode = '42501';
  end if;
  if p_date_field not in ('check_in_at', 'created_at') then
    raise exception 'Campo de data inválido.' using errcode = '22023';
  end if;

  v_companies := public.wl_visible_company_ids();

  -- Predicado de data direto na coluna (não num CASE), para o índice (company_id, check_in_at) /
  -- (company_id, wl_created_at) valer: com o CASE, 30 dias da rede levavam 2 s; assim, dezenas de ms.
  with rec as (
    select w.company_id, w.status, w.paid_total_cents,
           case when p_date_field = 'created_at' then w.wl_created_at else w.check_in_at end as at
      from public.wl_booking w
     where w.company_id = any (v_companies)
       and (p_company_ids is null or w.company_id = any (p_company_ids))
       and ((p_date_field = 'check_in_at' and w.check_in_at >= p_from and w.check_in_at < p_to)
            or (p_date_field = 'created_at' and w.wl_created_at >= p_from and w.wl_created_at < p_to))
       and (p_location_ids is null
            or w.location_id = any (p_location_ids)
            or (w.location_id is null
                and w.company_id in (select l.company_id from public.location l where l.id = any (p_location_ids))))
  ),
  por_empresa as (
    select r.company_id,
           count(*) as created,
           count(*) filter (where r.status in ('confirmed', 'refund_requested', 'refunded')) as paid,
           coalesce(sum(r.paid_total_cents) filter (where r.status = 'confirmed'), 0) / 100.0 as paid_amount
      from rec r
     group by r.company_id
  )
  select jsonb_build_object(
    'total', jsonb_build_object(
      'created', coalesce((select sum(created) from por_empresa), 0),
      'paid', coalesce((select sum(paid) from por_empresa), 0),
      'paid_amount', coalesce((select sum(paid_amount) from por_empresa), 0),
      'commission', case when v_admin then (
        select round(sum(pe.paid_amount * c.wl_take_rate_bps / 10000.0), 2)
          from por_empresa pe join public.company c on c.id = pe.company_id
         where c.wl_take_rate_bps is not null) end
    ),
    'by_day', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'paid', d.paid, 'paid_amount', d.paid_amount) order by d.day)
        from (
          select (r.at at time zone 'America/Sao_Paulo')::date as day,
                 count(*) filter (where r.status in ('confirmed', 'refund_requested', 'refunded')) as paid,
                 coalesce(sum(r.paid_total_cents) filter (where r.status = 'confirmed'), 0) / 100.0 as paid_amount
            from rec r
           group by 1
        ) d), '[]'::jsonb),
    'by_company', coalesce((
      select jsonb_agg(jsonb_build_object(
               'company_id', pe.company_id, 'company_name', c.name,
               'created', pe.created, 'paid', pe.paid, 'paid_amount', pe.paid_amount,
               'wl_take_rate_bps', case when v_admin then c.wl_take_rate_bps end,
               'commission', case when v_admin and c.wl_take_rate_bps is not null
                                  then round(pe.paid_amount * c.wl_take_rate_bps / 10000.0, 2) end)
             order by pe.paid_amount desc, c.name)
        from por_empresa pe join public.company c on c.id = pe.company_id), '[]'::jsonb)
  ) into v_result;

  return v_result;
end $function$;

comment on function public.wl_revenue(timestamptz, timestamptz, uuid[], uuid[], text) is
  'Faturamento do site white-label no recorte (fase 5 das reservas unificadas): total, por dia e por empresa. Base: paid_total_price do pedido pago. Comissão (wl_take_rate_bps) só para hub_admin.';

revoke all on function public.wl_revenue(timestamptz, timestamptz, uuid[], uuid[], text) from public, anon;
grant execute on function public.wl_revenue(timestamptz, timestamptz, uuid[], uuid[], text) to authenticated;
