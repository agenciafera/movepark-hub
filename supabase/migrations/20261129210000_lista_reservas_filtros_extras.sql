-- Lista única de reservas: mais quatro filtros, nas duas origens (14/10/2026).
-- Spec: reservas-unificadas-hub-wl.md § 4.1 e § 10.
--
--   1. Adicional (`p_add_on`): 'any' (qualquer um), 'none' (nenhum) ou o nome do adicional. No Hub,
--      `booking_item` do tipo add_on; no site, item do pedido que não é a vaga (`is_spot = false`).
--   2. Afiliado (`p_affiliated`): só o site tem. O Hub não tem afiliado, então "sim" tira o Hub e
--      "não" mantém todas as reservas dele.
--   3. Fonte da campanha (`p_utm_source`), sem diferença de caixa: `booking.utm_source` no Hub e
--      `utm->>'utm_source'` no site.
--   4. Troca de placa (`p_plate_changed`): `booking_modification` vehicle_change no Hub,
--      `wl_booking_event` plate_change no site.
--   5. `bookings_filter_options`: as opções dos selects (adicionais e fontes de campanha) dentro do
--      que quem chama enxerga, no último ano.

create index if not exists wl_booking_items_gin on public.wl_booking using gin (items jsonb_path_ops);
create index if not exists wl_booking_event_plate_change_idx on public.wl_booking_event (wl_booking_id)
  where kind = 'plate_change';

drop function if exists public.bookings_list_page(text, text[], uuid[], uuid[], text, timestamptz, timestamptz, text, text, text[], boolean, integer, integer, boolean, text, boolean);

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
  p_with_summary boolean default true,
  p_attendance text default null,
  p_pcd boolean default null,
  p_add_on text default null,
  p_affiliated boolean default null,
  p_utm_source text default null,
  p_plate_changed boolean default null
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
  -- Canal é dado só do Hub: com ele ligado o site sai. A forma de pagamento vale para os dois
  -- desde 13/10/2026 (no site, pelo código da forma de pagamento do pedido).
  v_wl boolean := coalesce(p_source, 'all') in ('all', 'wl') and p_channel_origins is null;
  -- Empresas com site visíveis para quem chama, uma vez (a RLS repete a regra; aqui é para o
  -- planner usar o índice por empresa em vez de varrer a tabela).
  v_wl_companies uuid[] := public.wl_visible_company_ids();
  -- Pedidos do site que batem com a busca, achados antes pelo índice trigram (ver abaixo).
  v_wl_ids uuid[];
  v_result jsonb;
  -- Fonte da campanha comparada sem caixa: o site grava "Google" e "google".
  v_utm text := nullif(lower(btrim(coalesce(p_utm_source, ''))), '');
  v_add_on text := nullif(btrim(coalesce(p_add_on, '')), '');
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
            or b.customer_phone ilike '%' || v_busca || '%'
            -- Placa atual, placa anterior (troca registrada) e modelo do veículo (13/10/2026).
            or exists (select 1 from public.vehicle v where v.id = b.vehicle_id
                        and (public.wl_plate_key(v.license_plate) like '%' || v_placa || '%'
                             or v.model ilike '%' || v_busca || '%'))
            or exists (select 1 from public.booking_modification m
                        where m.booking_id = b.id and m.type = 'vehicle_change'
                          and public.wl_plate_key(m.changes->'from'->>'license_plate') like '%' || v_placa || '%'))
       and (p_channel_origins is null or b.origin = any (p_channel_origins))
       and (p_payment is null
            or (p_payment in ('pix', 'card') and exists (
                  select 1 from public.payment p where p.booking_id = b.id and p.method::text = p_payment))
            or (p_payment = 'none' and not exists (select 1 from public.payment p where p.booking_id = b.id)))
       -- Comparecimento no vocabulário do site: compareceu = carro entrou; no_show; pendente = paga
       -- e ainda sem entrada.
       and (p_attendance is null
            or (p_attendance = 'compareceu' and b.checked_in_at is not null)
            or (p_attendance = 'no_show' and b.status::text = 'no_show')
            or (p_attendance = 'pendente' and b.status::text = 'confirmed' and b.checked_in_at is null))
       and (p_pcd is null or coalesce(b.has_pcd, false) = p_pcd)
       -- Adicional: 'any' = qualquer um, 'none' = nenhum, senão o nome do serviço (14/10/2026).
       and (v_add_on is null
            or (v_add_on = 'any' and exists (
                  select 1 from public.booking_item i where i.booking_id = b.id and i.item_type = 'add_on'))
            or (v_add_on = 'none' and not exists (
                  select 1 from public.booking_item i where i.booking_id = b.id and i.item_type = 'add_on'))
            or (v_add_on not in ('any', 'none') and exists (
                  select 1 from public.booking_item i join public.add_on_service s on s.id = i.add_on_service_id
                   where i.booking_id = b.id and i.item_type = 'add_on' and s.name = v_add_on)))
       -- O Hub não tem programa de afiliado: "afiliado = sim" deixa só o site.
       and (p_affiliated is null or p_affiliated = false)
       and (v_utm is null or lower(b.utm_source) = v_utm)
       and (p_plate_changed is null
            or p_plate_changed = exists (
                 select 1 from public.booking_modification m
                  where m.booking_id = b.id and m.type = 'vehicle_change'))
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
       and (p_payment is null
            or (p_payment = 'pix' and w.payment_method_code ilike '%pix%')
            or (p_payment = 'card' and w.payment_method_code ilike '%creditcard%')
            or (p_payment = 'none' and w.payment_method_code is null))
       and (p_attendance is null
            or (p_attendance = 'pendente' and coalesce(w.attendance_status, 'pendente') = 'pendente'
                and w.status = 'confirmed')
            or (p_attendance <> 'pendente' and w.attendance_status = p_attendance))
       and (p_pcd is null or w.has_pcd = p_pcd)
       -- Adicional: item do pedido que não é a vaga (`is_spot = false`).
       and (v_add_on is null
            or (v_add_on = 'any' and w.items @> '[{"is_spot": false}]'::jsonb)
            or (v_add_on = 'none' and not coalesce(w.items @> '[{"is_spot": false}]'::jsonb, false))
            or (v_add_on not in ('any', 'none')
                and w.items @> jsonb_build_array(jsonb_build_object('is_spot', false, 'product_name', v_add_on))))
       and (p_affiliated is null or coalesce(w.is_affiliated, false) = p_affiliated)
       and (v_utm is null or lower(w.utm->>'utm_source') = v_utm)
       and (p_plate_changed is null
            or p_plate_changed = exists (
                 select 1 from public.wl_booking_event e
                  where e.wl_booking_id = w.id and e.kind = 'plate_change'))
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

comment on function public.bookings_list_page(text, text[], uuid[], uuid[], text, timestamptz, timestamptz, text, text, text[], boolean, integer, integer, boolean, text, boolean, text, boolean, text, boolean) is
  'Lista única de reservas (Hub + site white-label), paginada. p_with_summary=false pula o resumo; comparecimento, PCD, adicional, UTM e troca de placa filtram as duas origens; afiliado só existe no site.';

revoke all on function public.bookings_list_page(text, text[], uuid[], uuid[], text, timestamptz, timestamptz, text, text, text[], boolean, integer, integer, boolean, text, boolean, text, boolean, text, boolean) from public, anon;
grant execute on function public.bookings_list_page(text, text[], uuid[], uuid[], text, timestamptz, timestamptz, text, text, text[], boolean, integer, integer, boolean, text, boolean, text, boolean, text, boolean) to authenticated;


-- Opções dos selects de adicional e de fonte da campanha. SECURITY INVOKER: a RLS de `booking` e
-- de `wl_booking` recorta o que quem chama vê; o filtro de empresa explícito é para o índice.
create or replace function public.bookings_filter_options(p_company_ids uuid[] default null)
returns jsonb
language sql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $function$
  with
  wl as (
    select w.items, w.utm
      from public.wl_booking w
     where w.company_id = any (public.wl_visible_company_ids())
       and (p_company_ids is null or w.company_id = any (p_company_ids))
       -- Último ano: adicional e campanha que ninguém usa há um ano só poluem o select.
       and w.wl_created_at >= now() - interval '1 year'
  ),
  hub as (
    select b.id, b.utm_source
      from public.booking b
      join public.location l on l.id = b.location_id
     where b.deleted_at is null
       and (p_company_ids is null or l.company_id = any (p_company_ids))
       and b.created_at >= now() - interval '1 year'
  ),
  add_ons as (
    select btrim(it->>'product_name') as name, count(*) as n
      from wl, jsonb_array_elements(wl.items) it
     where (it->>'is_spot')::boolean is false and nullif(btrim(it->>'product_name'), '') is not null
     group by 1
    union all
    select s.name, count(*)
      from hub h
      join public.booking_item i on i.booking_id = h.id and i.item_type = 'add_on'
      join public.add_on_service s on s.id = i.add_on_service_id
     group by 1
  ),
  fontes as (
    select lower(btrim(wl.utm->>'utm_source')) as source, count(*) as n
      from wl where nullif(btrim(wl.utm->>'utm_source'), '') is not null group by 1
    union all
    select lower(btrim(h.utm_source)), count(*)
      from hub h where nullif(btrim(h.utm_source), '') is not null group by 1
  )
  select jsonb_build_object(
    'add_ons', coalesce((
      select jsonb_agg(x.name order by x.n desc, x.name)
        from (select name, sum(n) as n from add_ons group by name) x), '[]'::jsonb),
    -- As 40 fontes que mais venderam; a cauda é de link único e só polui o select.
    'utm_sources', coalesce((
      select jsonb_agg(x.source order by x.n desc, x.source)
        from (select source, sum(n) as n from fontes group by source order by 2 desc, 1 limit 40) x), '[]'::jsonb)
  );
$function$;

comment on function public.bookings_filter_options(uuid[]) is
  'Opções dos filtros de adicional e de fonte da campanha da lista de reservas, no recorte de quem chama (Hub + site).';

revoke all on function public.bookings_filter_options(uuid[]) from public, anon;
grant execute on function public.bookings_filter_options(uuid[]) to authenticated;

analyze public.wl_booking;
analyze public.wl_booking_event;
