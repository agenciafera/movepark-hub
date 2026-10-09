-- Reservas unificadas, fases 1 e 2: quem tem white-label e a lista única (09/10/2026).
-- Spec: docs/specs/reservas-unificadas-hub-wl.md (§ 2, § 3, D2).
--
-- Fase 1. A regra de "tem white-label" passa a ser uma só, `company_has_wl`: a empresa tem
-- `wl_domain` preenchido. Quem não tem não vê nada do white-label, nem na tela nem no servidor:
-- a leitura de `wl_booking` por membro exige a regra além do escopo `wl-bookings:read` (que todo
-- papel de toda empresa tem e, sozinho, não distinguia nada).
--
-- Fase 2. `bookings_list_page` junta `booking` e `wl_booking` numa página só, ordenada pela data
-- da compra, com os mesmos filtros da lista de hoje. As tabelas continuam separadas (68 funções e
-- 11 triggers leem `booking`); a união é só de leitura. A função roda com a permissão de quem
-- chama (SECURITY INVOKER), então a RLS de cada tabela decide o que entra: a do Hub como sempre, a
-- do site pela policy nova. Para a reserva do Hub ela devolve só o id, e a tela monta a linha com
-- a mesma consulta de hoje (dinheiro, pagamento, proteção de voo); a do site vem pronta.

-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 1: quem tem white-label
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.company_has_wl(p_company_id uuid)
returns boolean
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from public.company c
     where c.id = p_company_id
       and nullif(btrim(coalesce(c.wl_domain, '')), '') is not null
  );
$$;

revoke all on function public.company_has_wl(uuid) from public, anon;
grant execute on function public.company_has_wl(uuid) to authenticated, service_role;

-- Empresas cujas reservas do site quem chama pode ver: hub_admin vê todas as que têm white-label;
-- membro vê as dele com o escopo. Calculado UMA vez por consulta (a policy chama dentro de um
-- subselect): checar o escopo linha a linha, com 133 mil linhas, estourava o tempo da consulta.
create or replace function public.wl_visible_company_ids()
returns uuid[]
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(array_agg(c.id), '{}'::uuid[])
    from public.company c
   where nullif(btrim(coalesce(c.wl_domain, '')), '') is not null
     and (public.is_hub_admin() or public.member_has_scope(c.id, 'wl-bookings:read'));
$$;

revoke all on function public.wl_visible_company_ids() from public, anon;
grant execute on function public.wl_visible_company_ids() to authenticated, service_role;

-- Uma policy só no lugar das duas (admin e membro): o OR de policies avaliava as duas por linha.
drop policy if exists wl_booking_admin_select on public.wl_booking;
drop policy if exists wl_booking_member_select on public.wl_booking;
create policy wl_booking_select on public.wl_booking for select to authenticated
  using (company_id = any ((select public.wl_visible_company_ids())::uuid[]));

-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 2: status do site no vocabulário do Hub (D2)
-- ─────────────────────────────────────────────────────────────────────────────
-- Pago com comparecimento é "Em uso" enquanto a estadia não acabou e "Concluída" depois; no-show é
-- "Não compareceu"; reembolso (pedido ou feito) é "Cancelada"; o resto é igual. O status cru do site
-- continua em `wl_status` para o detalhe.
create or replace function public.wl_booking_hub_status(
  p_status text,
  p_attendance text,
  p_check_out_at timestamptz
)
returns text
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select case
    when p_status = 'confirmed' and p_attendance = 'no_show' then 'no_show'
    when p_status = 'confirmed' and p_attendance = 'compareceu'
      then case when p_check_out_at is not null and p_check_out_at > now() then 'checked_in' else 'completed' end
    when p_status = 'confirmed' then 'confirmed'
    when p_status in ('cancelled', 'refunded', 'refund_requested') then 'cancelled'
    when p_status = 'expired' then 'expired'
    else 'pending'
  end;
$$;

revoke all on function public.wl_booking_hub_status(text, text, timestamptz) from public, anon;
grant execute on function public.wl_booking_hub_status(text, text, timestamptz) to authenticated, service_role;

create index if not exists wl_booking_company_created_idx
  on public.wl_booking (company_id, wl_created_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 2: a lista
-- ─────────────────────────────────────────────────────────────────────────────
-- Filtros (todos opcionais), os mesmos da lista de hoje:
--   p_source          'all' | 'hub' | 'wl'
--   p_statuses        status no vocabulário do Hub
--   p_location_ids    unidades (o site sem De/Para entra pela empresa da unidade)
--   p_company_ids     empresas
--   p_date_field      'check_in_at' (Operator) | 'created_at' (Manager)
--   p_search          código/número, nome, e-mail, telefone; no site também a placa
--   p_payment         'pix' | 'card' | 'none'      → só Hub (o site ainda não traz a forma de pagamento)
--   p_channel_origins valores de `booking.origin` → só Hub
--   p_partner_view    visão do estacionamento: só reserva que virou venda
create or replace function public.bookings_list_page(
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
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security invoker
set search_path to 'public', 'pg_temp'
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
  v_result jsonb;
begin
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
  wl as (
    select w.*,
           public.wl_booking_hub_status(w.status, w.attendance_status, w.check_out_at) as hub_status,
           coalesce(w.wl_created_at, w.synced_at) as sort_at
      from public.wl_booking w
     where v_wl
       and w.company_id = any (v_wl_companies)
       and (p_location_ids is null
            or w.location_id = any (p_location_ids)
            or (w.location_id is null
                and w.company_id in (select l.company_id from public.location l where l.id = any (p_location_ids))))
       and (p_company_ids is null or w.company_id = any (p_company_ids))
       and (p_from is null or (case when p_date_field = 'created_at' then coalesce(w.wl_created_at, w.synced_at) else w.check_in_at end) >= p_from)
       and (p_to is null or (case when p_date_field = 'created_at' then coalesce(w.wl_created_at, w.synced_at) else w.check_in_at end) <= p_to)
       and (v_busca is null
            or w.wl_order_number ilike '%' || v_busca || '%'
            or w.customer_name ilike '%' || v_busca || '%'
            or w.customer_email ilike '%' || v_busca || '%'
            or w.customer_phone ilike '%' || v_busca || '%'
            or (v_placa is not null and replace(upper(coalesce(w.license_plate, '')), '-', '') like '%' || v_placa || '%'))
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
                   'origin', w.origin, 'status', w.hub_status, 'wl_status', w.wl_status,
                   'site_status', w.status, 'attendance_marked_at', w.attendance_marked_at,
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
                 from wl_f w
                 join public.company c on c.id = w.company_id
                 left join public.location l on l.id = w.location_id
                 left join public.location_parking_type lpt on lpt.id = w.location_parking_type_id
                 left join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
                 left join public.parking_type pt on pt.id = cpt.parking_type_id
                where w.id = pg.id))
        end
        order by pg.sort_at desc nulls last, pg.id desc)
      from pagina pg), '[]'::jsonb),
    -- Números do recorte inteiro (não só da página), separados por origem.
    'summary', jsonb_build_object(
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
    )
  ) into v_result;

  return v_result;
end $function$;

revoke all on function public.bookings_list_page(text, text[], uuid[], uuid[], text, timestamptz, timestamptz, text, text, text[], boolean, integer, integer)
  from public, anon;
grant execute on function public.bookings_list_page(text, text[], uuid[], uuid[], text, timestamptz, timestamptz, text, text, text[], boolean, integer, integer)
  to authenticated;
