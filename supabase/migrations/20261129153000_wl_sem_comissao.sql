-- Reservas unificadas (09/10/2026): a venda do site white-label NÃO tem comissão no Hub.
-- Decisão do Kallef, revendo a D4b da spec: a parte da Movepark sobre o site já está no split da
-- Pagar.me do próprio site (recebedor "fera" em cada tenant), o estacionamento conhece esses
-- valores, e não precisa ser calculada nem mostrada a ninguém. Comissão no Hub é só da venda pelo
-- Hub. Spec: docs/specs/reservas-unificadas-hub-wl.md (D4b revista).
--
-- Desfaz o que 20261129130000 criou para isso (nenhuma empresa tinha taxa gravada):
--   1. some `set_company_wl_take_rate` e a coluna `company.wl_take_rate_bps`;
--   2. `manager_company_restricted` volta sem a coluna;
--   3. `wl_revenue` deixa de calcular comissão. Sem coluna restrita para ler, vira SECURITY
--      INVOKER: a RLS de `wl_booking` (`wl_visible_company_ids`) faz o recorte.

drop function if exists public.set_company_wl_take_rate(uuid, integer);

drop function if exists public.manager_company_restricted(uuid[]);
create function public.manager_company_restricted(p_company_ids uuid[])
returns table (
  id uuid,
  take_rate_bps integer,
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
    select c.id, c.take_rate_bps::integer, c.wl_tenant_key,
           nullif(btrim(coalesce(c.wps_webhook_secret, '')), '') is not null,
           c.contract_accepted_ip::text
      from public.company c
     where c.id = any (coalesce(p_company_ids, '{}'::uuid[]));
end $function$;

revoke all on function public.manager_company_restricted(uuid[]) from public, anon;
grant execute on function public.manager_company_restricted(uuid[]) to authenticated;

alter table public.company drop column if exists wl_take_rate_bps;

drop function if exists public.wl_revenue(timestamptz, timestamptz, uuid[], uuid[], text);
create function public.wl_revenue(
  p_from timestamptz,
  p_to timestamptz,
  p_location_ids uuid[] default null,
  p_company_ids uuid[] default null,
  p_date_field text default 'check_in_at'
)
returns jsonb
language plpgsql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_companies uuid[] := public.wl_visible_company_ids();
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Autenticação necessária.' using errcode = '42501';
  end if;
  if p_date_field not in ('check_in_at', 'created_at') then
    raise exception 'Campo de data inválido.' using errcode = '22023';
  end if;

  -- Predicado de data direto na coluna (não num CASE) e empresa explícita, para o índice
  -- (company_id, check_in_at) / (company_id, wl_created_at) valer: só com a RLS, 30 dias da rede
  -- levavam 400 ms. A RLS de `wl_booking` continua valendo por baixo.
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
      'paid_amount', coalesce((select sum(paid_amount) from por_empresa), 0)
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
               'created', pe.created, 'paid', pe.paid, 'paid_amount', pe.paid_amount)
             order by pe.paid_amount desc, c.name)
        from por_empresa pe join public.company c on c.id = pe.company_id), '[]'::jsonb)
  ) into v_result;

  return v_result;
end $function$;

comment on function public.wl_revenue(timestamptz, timestamptz, uuid[], uuid[], text) is
  'Faturamento do site white-label no recorte: total, por dia e por empresa. Base: paid_total_price do pedido pago. Sem comissão: a venda do site não tem comissão no Hub (D4b revista em 09/10/2026).';

revoke all on function public.wl_revenue(timestamptz, timestamptz, uuid[], uuid[], text) from public, anon;
grant execute on function public.wl_revenue(timestamptz, timestamptz, uuid[], uuid[], text) to authenticated;
