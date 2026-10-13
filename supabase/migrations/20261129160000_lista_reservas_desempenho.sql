-- Desempenho da lista única de reservas (13/10/2026). Medido no banco vivo como admin: 30 dias da
-- rede levavam ~500 ms a cada troca de página, 90 dias 1,1 s, busca sem período 1 s. O custo era
-- todo do lado do site (o Hub tem dezenas de reservas; o site, 133 mil):
--
--   1. a linha do site da página era procurada dentro do recorte inteiro (CTE sem índice), 50 vezes;
--      agora vai direto pela chave primária;
--   2. o recorte carregava `w.*`, com os jsonb da ficha; agora só as colunas que a lista usa;
--   3. o filtro de data estava dentro de um CASE e o índice não valia;
--   4. o resumo era recalculado a cada página; agora é opcional (`p_with_summary`) e o front o pede
--      uma vez por recorte;
--   5. busca por nome, e-mail, telefone, pedido e placa ganha índice trigram (pg_trgm), e a função
--      monta o plano a cada chamada para o índice valer.
--
-- Mesma regra e mesmo formato de resposta; só muda o custo. Spec: reservas-unificadas-hub-wl.md § 3.1.

-- Placa normalizada (maiúscula, só letras e números), a mesma conta da busca.
create or replace function public.wl_plate_key(p_plate text)
returns text
language sql
immutable
parallel safe
set search_path to 'public', 'pg_temp'
as $$ select replace(upper(coalesce(p_plate, '')), '-', '') $$;

create index if not exists wl_booking_order_number_trgm on public.wl_booking using gin (wl_order_number extensions.gin_trgm_ops);
create index if not exists wl_booking_customer_name_trgm on public.wl_booking using gin (customer_name extensions.gin_trgm_ops);
create index if not exists wl_booking_customer_email_trgm on public.wl_booking using gin (customer_email extensions.gin_trgm_ops);
create index if not exists wl_booking_customer_phone_trgm on public.wl_booking using gin (customer_phone extensions.gin_trgm_ops);
create index if not exists wl_booking_plate_trgm on public.wl_booking using gin (public.wl_plate_key(license_plate) extensions.gin_trgm_ops);

-- Busca no site sem a RLS no caminho: com ela, o `ilike` (operador não leakproof) só pode rodar
-- depois do filtro de acesso, e o índice trigram não vale (1,5 s; sem a RLS, 0,2 ms). A função
-- recorta ela mesma pelas empresas que quem chama enxerga (`wl_visible_company_ids`, que lê
-- `auth.uid()`) e devolve só ids; a lista aplica a RLS de novo em cima deles.
create or replace function public.wl_booking_search_ids(p_busca text, p_placa text)
returns uuid[]
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_companies uuid[] := public.wl_visible_company_ids();
  v_ids uuid[];
begin
  if auth.uid() is null then
    raise exception 'Autenticação necessária.' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_busca, '')), '') is null or cardinality(v_companies) = 0 then
    return '{}'::uuid[];
  end if;
  -- Tudo como literal: com parâmetro, o planner preferia o índice por empresa e filtrava tudo.
  execute format(
    'select coalesce(array_agg(w.id), ''{}''::uuid[]) from public.wl_booking w
      where (w.wl_order_number ilike %1$L or w.customer_name ilike %1$L
             or w.customer_email ilike %1$L or w.customer_phone ilike %1$L%2$s)
        and w.company_id = any (%3$L::uuid[])',
    '%' || p_busca || '%',
    case when nullif(p_placa, '') is not null
         then format(' or public.wl_plate_key(w.license_plate) like %L', '%' || p_placa || '%')
         else '' end,
    v_companies)
    into v_ids;
  return v_ids;
end $function$;

revoke all on function public.wl_booking_search_ids(text, text) from public, anon;
grant execute on function public.wl_booking_search_ids(text, text) to authenticated;

drop function if exists public.bookings_list_page(text, text[], uuid[], uuid[], text, timestamptz, timestamptz, text, text, text[], boolean, integer, integer);

create function public.bookings_list_page(
  p_source text default 'all',
  p_statuses text[] default null,
  p_location_ids uuid[] default null,
  p_company_ids uuid[] default null,
  p_date_field text default 'check_in_at',
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_search text default null,
  p_payment text default null,
  p_channel_origins text[] default null,
  p_partner_view boolean default false,
  p_limit integer default 50,
  p_offset integer default 0,
  p_with_summary boolean default true
)
returns jsonb
language plpgsql
stable
security invoker
set search_path to 'public', 'pg_temp'
-- Plano por chamada: com o plano genérico que o PL/pgSQL passa a reusar depois de algumas
-- execuções, `v_busca is null or ...` não sabe se há busca e o índice trigram não vale (busca de
-- placa ia de 0,2 ms para 1,4 s).
set plan_cache_mode to 'force_custom_plan'
as $function$
declare
  v_busca text := nullif(btrim(regexp_replace(coalesce(p_search, ''), '[%_\\]', ' ', 'g')), '');
  v_placa text := nullif(regexp_replace(upper(coalesce(p_search, '')), '[^A-Z0-9]', '', 'g'), '');
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_hub boolean := coalesce(p_source, 'all') in ('all', 'hub');
  -- Forma de pagamento e canal são dados do Hub; com eles ligados, o site sai da lista.
  v_wl boolean := coalesce(p_source, 'all') in ('all', 'wl') and p_payment is null and p_channel_origins is null;
  -- Empresas com site visíveis para quem chama, uma vez (a RLS repete a regra; aqui é para o
  -- planner usar o índice por empresa em vez de varrer a tabela).
  v_wl_companies uuid[] := public.wl_visible_company_ids();
  -- Pedidos do site que batem com a busca, achados antes pelo índice trigram (ver abaixo).
  v_wl_ids uuid[];
  v_result jsonb;
begin
  if v_wl and v_busca is not null then
    v_wl_ids := public.wl_booking_search_ids(v_busca, v_placa);
  end if;

  with
  hub as (
    select b.id, b.created_at as sort_at, b.status::text as status, b.total_amount,
           lp.status as pay_status, lp.method as pay_method, lp.refunded_at as pay_refunded_at
      from public.booking b
      join public.location l on l.id = b.location_id
      left join lateral (
        select p.status::text as status, p.method::text as method, p.refunded_at
          from public.payment p where p.booking_id = b.id
         order by p.created_at desc limit 1
      ) lp on true
     where v_hub
       and (p_statuses is null or b.status::text = any (p_statuses))
       and (p_location_ids is null or b.location_id = any (p_location_ids))
       and (p_company_ids is null or l.company_id = any (p_company_ids))
       and (p_from is null or (case when p_date_field = 'created_at' then b.created_at else b.check_in_at end) >= p_from)
       and (p_to is null or (case when p_date_field = 'created_at' then b.created_at else b.check_in_at end) <= p_to)
       and (v_busca is null
            or b.code ilike '%' || v_busca || '%'
            or b.customer_name ilike '%' || v_busca || '%'
            or b.customer_email ilike '%' || v_busca || '%'
            or b.customer_phone ilike '%' || v_busca || '%')
       and (p_channel_origins is null or b.origin = any (p_channel_origins))
       and (p_payment is null
            or (p_payment in ('pix', 'card') and exists (
                  select 1 from public.payment p where p.booking_id = b.id and p.method::text = p_payment))
            or (p_payment = 'none' and not exists (select 1 from public.payment p where p.booking_id = b.id)))
       -- Mesma regra de `partnerSeesBooking`: o estacionamento só vê reserva que virou venda.
       and (not p_partner_view
            or b.status::text in ('confirmed', 'checked_in', 'completed', 'no_show')
            or (b.status::text = 'cancelled' and exists (
                  select 1 from public.payment p where p.booking_id = b.id and p.status::text in ('paid', 'refunded'))))
  ),
  -- Só as colunas que a lista usa: `w.*` arrastava os jsonb da ficha (itens, campanha, veículo)
  -- pelas 11 mil linhas de um mês. A linha da página é montada depois, pela chave.
  wl as (
    -- O status no vocabulário do Hub vai escrito aqui, igual a `wl_booking_hub_status`: a função
    -- tem SET search_path, não é embutida pelo planner e custava 1,2 s nas 133 mil linhas.
    select w.id, w.status, w.paid_total_cents,
           case
             when w.status = 'confirmed' and w.attendance_status = 'no_show' then 'no_show'
             when w.status = 'confirmed' and w.attendance_status = 'compareceu'
               then case when w.check_out_at is not null and w.check_out_at > now() then 'checked_in' else 'completed' end
             when w.status = 'confirmed' then 'confirmed'
             when w.status in ('cancelled', 'refunded', 'refund_requested') then 'cancelled'
             when w.status = 'expired' then 'expired'
             else 'pending'
           end as hub_status,
           w.wl_created_at as sort_at
      from public.wl_booking w
     where v_wl
       and w.company_id = any (v_wl_companies)
       and (p_location_ids is null
            or w.location_id = any (p_location_ids)
            or (w.location_id is null
                and w.company_id in (select l.company_id from public.location l where l.id = any (p_location_ids))))
       and (p_company_ids is null or w.company_id = any (p_company_ids))
       -- Data direto na coluna, para os índices (company_id, wl_created_at) e (company_id,
       -- check_in_at) valerem; dentro de um CASE o Postgres varria a tabela.
       and (p_from is null
            or (p_date_field = 'created_at' and w.wl_created_at >= p_from)
            or (p_date_field <> 'created_at' and w.check_in_at >= p_from))
       and (p_to is null
            or (p_date_field = 'created_at' and w.wl_created_at <= p_to)
            or (p_date_field <> 'created_at' and w.check_in_at <= p_to))
       and (v_wl_ids is null or w.id = any (v_wl_ids))
       -- Visão do estacionamento: só pedido pago (pendente, expirado e o cancelado antes de pagar
       -- não são venda; o reembolso é, porque o dinheiro entrou).
       and (not p_partner_view or w.status in ('confirmed', 'refund_requested', 'refunded'))
  ),
  wl_f as (
    select * from wl where p_statuses is null or hub_status = any (p_statuses)
  ),
  u as (
    select 'hub'::text as source, h.id, h.sort_at from hub h
    union all
    select 'wl'::text, w.id, w.sort_at from wl_f w
  ),
  pagina as (
    select * from u order by sort_at desc nulls last, id desc limit v_limit offset v_offset
  )
  select jsonb_build_object(
    'total', (select count(*) from u),
    'items', coalesce((
      select jsonb_agg(
        case when pg.source = 'hub' then jsonb_build_object('source', 'hub', 'id', pg.id)
        else jsonb_build_object(
          'source', 'wl', 'id', pg.id,
          'wl', (select jsonb_build_object(
                   'id', w.id, 'company_id', w.company_id, 'company_name', c.name,
                   'wl_order_number', w.wl_order_number, 'wl_created_at', w.wl_created_at,
                   'origin', w.origin, 'status', public.wl_booking_hub_status(w.status, w.attendance_status, w.check_out_at), 'wl_status', w.wl_status,
                   'site_status', w.status, 'payment_method_name', w.payment_method_name, 'attendance_marked_at', w.attendance_marked_at,
                   'location_parking_type_id', w.location_parking_type_id,
                   'attendance_status', w.attendance_status,
                   'customer_name', w.customer_name, 'customer_email', w.customer_email,
                   'customer_phone', w.customer_phone, 'license_plate', w.license_plate,
                   'check_in_at', w.check_in_at, 'check_out_at', w.check_out_at,
                   'passenger_count', w.passenger_count, 'has_pcd', w.has_pcd,
                   'total_cents', w.total_cents, 'paid_total_cents', w.paid_total_cents,
                   'location_id', w.location_id, 'location_name', l.name,
                   'parking_type_name', pt.name, 'category_slug', w.category_slug,
                   'product_slug', w.product_slug, 'synced_at', w.synced_at)
                 from public.wl_booking w
                 join public.company c on c.id = w.company_id
                 left join public.location l on l.id = w.location_id
                 left join public.location_parking_type lpt on lpt.id = w.location_parking_type_id
                 left join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
                 left join public.parking_type pt on pt.id = cpt.parking_type_id
                where w.id = pg.id))
        end
        order by pg.sort_at desc nulls last, pg.id desc)
      from pagina pg), '[]'::jsonb),
    -- Números do recorte inteiro (não só da página), separados por origem. Só quando pedido: o
    -- resumo não muda de uma página para outra, e o front o pede uma vez por recorte.
    'summary', case when not p_with_summary then null else jsonb_build_object(
      'hub', (select jsonb_build_object(
                'total', count(*),
                'paid', count(*) filter (where pay_status in ('paid', 'refunded')),
                'pix', count(*) filter (where pay_status in ('paid', 'refunded') and pay_method = 'pix'),
                'card', count(*) filter (where pay_status in ('paid', 'refunded') and pay_method = 'card'),
                'paid_amount', coalesce(sum(total_amount) filter (where pay_status = 'paid' and pay_refunded_at is null), 0),
                'awaiting', count(*) filter (where coalesce(pay_status, '') not in ('paid', 'refunded') and status = 'pending'),
                'lost', count(*) filter (where coalesce(pay_status, '') not in ('paid', 'refunded')
                                          and (status = 'expired' or pay_status = 'failed')))
              from hub),
      'wl', (select jsonb_build_object(
               'total', count(*),
               'paid', count(*) filter (where status in ('confirmed', 'refund_requested', 'refunded')),
               'paid_amount', coalesce(sum(paid_total_cents) filter (where status = 'confirmed'), 0) / 100.0)
             from wl_f)
    ) end
  ) into v_result;

  return v_result;
end $function$;

comment on function public.bookings_list_page(text, text[], uuid[], uuid[], text, timestamptz, timestamptz, text, text, text[], boolean, integer, integer, boolean) is
  'Lista única de reservas (Hub + site white-label), paginada. p_with_summary=false pula o resumo, que não muda entre páginas.';

revoke all on function public.bookings_list_page(text, text[], uuid[], uuid[], text, timestamptz, timestamptz, text, text, text[], boolean, integer, integer, boolean)
  from public, anon;
grant execute on function public.bookings_list_page(text, text[], uuid[], uuid[], text, timestamptz, timestamptz, text, text, text[], boolean, integer, integer, boolean)
  to authenticated;
