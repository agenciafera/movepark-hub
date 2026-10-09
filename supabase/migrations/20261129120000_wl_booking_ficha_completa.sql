-- Reservas unificadas, fase 4 (09/10/2026): a ficha completa da reserva do site white-label.
-- Spec: docs/specs/reservas-unificadas-hub-wl.md § 5 e D5. Legado: agenciafera/movepark-backoffice#620,
-- que faz `GET backend/orders` devolver forma de pagamento, itens, veículo, voucher, afiliado,
-- atribuição completa, duplicata, id do gateway, trocas de placa e histórico.
--
--   1. Colunas novas em `wl_booking` (forma de pagamento, veículo, itens, voucher, afiliado,
--      duplicata, transação) e a tabela filha `wl_booking_event` (histórico e trocas de placa do
--      site), copiadas, não lidas em tempo real (D5: quando o backoffice antigo desligar, o
--      histórico já tem que estar aqui).
--   2. `wl_booking_apply_page` grava tudo isso. Campo que a linha NÃO traz (legado antes do #620)
--      não apaga o que já está copiado, então a migration pode ir antes do deploy do legado.
--   3. `wl_booking_detail` devolve a ficha e os eventos do site; o id do gateway só para hub_admin.
--   4. `bookings_list_page` leva a forma de pagamento do site para a lista.
--
-- Releitura: depois do deploy do legado, o cursor de cada empresa volta para a janela
-- (`cursor_updated_since = '1970-01-01 00:00:00'`, ver § 4.5 da spec), e a importação relê tudo.

alter table public.wl_booking
  add column if not exists payment_method_code text,
  add column if not exists payment_method_name text,
  add column if not exists vehicle jsonb not null default '{}'::jsonb,
  add column if not exists items jsonb not null default '[]'::jsonb,
  add column if not exists voucher_url text,
  add column if not exists is_affiliated boolean not null default false,
  add column if not exists duplicate_of_wl_order_id bigint,
  add column if not exists gateway_transaction_id text;

comment on column public.wl_booking.items is 'Itens do pedido no site (vaga e adicionais): [{product_slug, product_name, is_spot, quantity, unit_price}], preço em reais. Informativo.';
comment on column public.wl_booking.gateway_transaction_id is 'transaction_id do pedido no gateway do site. Só a equipe Movepark vê (wl_booking_detail).';

create table if not exists public.wl_booking_event (
  id             uuid primary key default gen_random_uuid(),
  wl_booking_id  uuid not null references public.wl_booking(id) on delete cascade,
  company_id     uuid not null references public.company(id) on delete cascade,
  kind           text not null check (kind in ('history', 'plate_change')),
  wl_event_id    bigint not null,
  occurred_at    timestamptz,
  actor          text,
  note           text,
  data           jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  unique (wl_booking_id, kind, wl_event_id)
);

comment on table public.wl_booking_event is
  'Histórico (system_revisions) e trocas de placa (movepark_general_order_plate_changes) de cada pedido do site white-label, copiados pela importação. A lista do pedido é trocada inteira a cada leitura. Só leitura no Hub.';

create index if not exists wl_booking_event_booking_idx on public.wl_booking_event (wl_booking_id, occurred_at);

alter table public.wl_booking_event enable row level security;
revoke all on table public.wl_booking_event from anon;
grant select on table public.wl_booking_event to authenticated;
drop policy if exists wl_booking_event_select on public.wl_booking_event;
create policy wl_booking_event_select on public.wl_booking_event for select to authenticated
  using (company_id = any ((select public.wl_visible_company_ids())::uuid[]));

create or replace function public.wl_booking_apply_page(
  p_company_id uuid,
  p_rows jsonb,
  p_next_updated_since text,
  p_next_after_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_row jsonb;
  v_lookback integer;
  v_corte timestamptz;
  v_check_in timestamptz;
  v_check_out timestamptz;
  v_updated timestamptz;
  v_lpt uuid;
  v_loc uuid;
  v_gravadas integer := 0;
  v_puladas integer := 0;
  v_id uuid;
  v_ev jsonb;
begin
  v_lookback := coalesce((public.wl_booking_import_policy()->>'lookback_months')::integer, 12);
  v_corte := now() - make_interval(months => v_lookback);

  for v_row in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_check_in  := (nullif(v_row->>'initial_date', '')::timestamp) at time zone 'America/Sao_Paulo';
    v_check_out := (nullif(v_row->>'final_date', '')::timestamp) at time zone 'America/Sao_Paulo';
    v_updated   := (nullif(coalesce(v_row->>'updated_at', v_row->>'created_at'), '')::timestamp)
                     at time zone 'America/Sao_Paulo';

    if v_check_out is not null and v_check_out < v_corte then
      v_puladas := v_puladas + 1;
      continue;
    end if;

    if nullif(v_row->>'external_id', '') is not null
       and exists (
         select 1 from public.booking b
          where b.id::text = split_part(v_row->>'external_id', '#', 1)
       ) then
      v_puladas := v_puladas + 1;
      continue;
    end if;

    -- De/Para: (unidade, tipo de vaga) do legado para a vaga do Hub, dentro da empresa.
    select lpt.id, lpt.location_id into v_lpt, v_loc
      from public.location_parking_type lpt
      join public.location l on l.id = lpt.location_id
     where l.company_id = p_company_id
       and lpt.wl_category_slug = v_row->'category'->>'slug'
       and lpt.wl_product_slug = v_row->>'product_slug'
     order by lpt.is_active desc
     limit 1;

    insert into public.wl_booking as w (
      company_id, location_id, location_parking_type_id, wl_order_id, wl_order_number,
      wl_status, status, origin, external_id, category_slug, product_slug,
      check_in_at, check_out_at, license_plate, passenger_count, has_pcd,
      total_cents, paid_total_cents, attendance_status, attendance_marked_at, is_duplicate,
      customer_name, customer_email, customer_phone, utm, wl_created_at, wl_updated_at, synced_at,
      payment_method_code, payment_method_name, vehicle, items, voucher_url, is_affiliated,
      duplicate_of_wl_order_id, gateway_transaction_id
    ) values (
      p_company_id, v_loc, v_lpt, (v_row->>'id')::bigint, v_row->>'order_number',
      v_row->'status'->>'code', public.wl_booking_status(v_row->'status'->>'code'),
      v_row->>'origin', nullif(v_row->>'external_id', ''),
      v_row->'category'->>'slug', v_row->>'product_slug',
      v_check_in, v_check_out, v_row->>'license_plate',
      nullif(v_row->>'passenger_count', '')::integer,
      coalesce((v_row->>'has_pcd')::boolean, false),
      round(nullif(v_row->>'total_price', '')::numeric * 100)::integer,
      round(nullif(v_row->>'paid_total_price', '')::numeric * 100)::integer,
      v_row->>'attendance_status',
      (nullif(v_row->>'attendance_marked_at', '')::timestamp) at time zone 'America/Sao_Paulo',
      coalesce((v_row->>'is_duplicate')::boolean, false),
      nullif(btrim(concat_ws(' ', v_row->'customer'->>'name', v_row->'customer'->>'last_name')), ''),
      nullif(lower(btrim(v_row->'customer'->>'email')), ''),
      nullif(btrim(v_row->'customer'->>'phone'), ''),
      coalesce(v_row->'utm', '{}'::jsonb),
      (nullif(v_row->>'created_at', '')::timestamp) at time zone 'America/Sao_Paulo',
      v_updated, now(),
      v_row->'payment_method'->>'code', v_row->'payment_method'->>'name',
      case when jsonb_typeof(v_row->'vehicle') = 'object' then v_row->'vehicle' else '{}'::jsonb end,
      case when jsonb_typeof(v_row->'items') = 'array' then v_row->'items' else '[]'::jsonb end,
      nullif(v_row->>'voucher_url', ''),
      coalesce((v_row->>'is_affiliated')::boolean, false),
      nullif(v_row->>'duplicate_of', '')::bigint,
      nullif(v_row->>'transaction_id', '')
    )
    on conflict (company_id, wl_order_id) do update set
      location_id = excluded.location_id,
      location_parking_type_id = excluded.location_parking_type_id,
      wl_order_number = excluded.wl_order_number,
      wl_status = excluded.wl_status,
      status = excluded.status,
      origin = excluded.origin,
      external_id = excluded.external_id,
      category_slug = excluded.category_slug,
      product_slug = excluded.product_slug,
      check_in_at = excluded.check_in_at,
      check_out_at = excluded.check_out_at,
      license_plate = excluded.license_plate,
      passenger_count = excluded.passenger_count,
      has_pcd = excluded.has_pcd,
      total_cents = excluded.total_cents,
      paid_total_cents = excluded.paid_total_cents,
      attendance_status = excluded.attendance_status,
      attendance_marked_at = excluded.attendance_marked_at,
      is_duplicate = excluded.is_duplicate,
      customer_name = excluded.customer_name,
      customer_email = excluded.customer_email,
      customer_phone = excluded.customer_phone,
      utm = excluded.utm,
      wl_created_at = excluded.wl_created_at,
      wl_updated_at = excluded.wl_updated_at,
      payment_method_code = case when v_row ? 'payment_method' then excluded.payment_method_code else w.payment_method_code end,
      payment_method_name = case when v_row ? 'payment_method' then excluded.payment_method_name else w.payment_method_name end,
      vehicle = case when v_row ? 'vehicle' then excluded.vehicle else w.vehicle end,
      items = case when v_row ? 'items' then excluded.items else w.items end,
      voucher_url = case when v_row ? 'voucher_url' then excluded.voucher_url else w.voucher_url end,
      is_affiliated = case when v_row ? 'is_affiliated' then excluded.is_affiliated else w.is_affiliated end,
      duplicate_of_wl_order_id = case when v_row ? 'duplicate_of' then excluded.duplicate_of_wl_order_id else w.duplicate_of_wl_order_id end,
      gateway_transaction_id = case when v_row ? 'transaction_id' then excluded.gateway_transaction_id else w.gateway_transaction_id end,
      synced_at = now()
    where w.wl_updated_at is null
       or excluded.wl_updated_at is null
       or excluded.wl_updated_at >= w.wl_updated_at
    returning w.id into v_id;

    -- Histórico e trocas de placa do site (D5): a linha traz a lista inteira do pedido, então a
    -- cópia é trocada por ela. Sem a chave (legado antigo) ou sem gravar (linha mais velha que a
    -- cópia), nada muda.
    if v_id is not null and v_row ? 'history' then
      delete from public.wl_booking_event where wl_booking_id = v_id and kind = 'history';
      for v_ev in select * from jsonb_array_elements(coalesce(v_row->'history', '[]'::jsonb)) loop
        insert into public.wl_booking_event (wl_booking_id, company_id, kind, wl_event_id, occurred_at, actor, note, data)
        values (v_id, p_company_id, 'history', (v_ev->>'id')::bigint,
                (nullif(v_ev->>'created_at', '')::timestamp) at time zone 'America/Sao_Paulo',
                nullif(v_ev->>'user', ''), nullif(v_ev->>'note', ''),
                jsonb_build_object('field', v_ev->>'field'))
        on conflict (wl_booking_id, kind, wl_event_id) do nothing;
      end loop;
    end if;
    if v_id is not null and v_row ? 'plate_changes' then
      delete from public.wl_booking_event where wl_booking_id = v_id and kind = 'plate_change';
      for v_ev in select * from jsonb_array_elements(coalesce(v_row->'plate_changes', '[]'::jsonb)) loop
        insert into public.wl_booking_event (wl_booking_id, company_id, kind, wl_event_id, occurred_at, actor, note, data)
        values (v_id, p_company_id, 'plate_change', (v_ev->>'id')::bigint,
                (nullif(v_ev->>'created_at', '')::timestamp) at time zone 'America/Sao_Paulo',
                nullif(v_ev->>'changed_by', ''), nullif(v_ev->>'reason', ''),
                v_ev - 'id' - 'created_at' - 'changed_by' - 'reason')
        on conflict (wl_booking_id, kind, wl_event_id) do nothing;
      end loop;
    end if;

    v_gravadas := v_gravadas + 1;
  end loop;

  insert into public.wl_booking_sync_state as s
    (company_id, cursor_updated_since, cursor_after_id, last_ok_at, imported_total, updated_at)
  values (p_company_id, p_next_updated_since, p_next_after_id, now(), v_gravadas, now())
  on conflict (company_id) do update set
    cursor_updated_since = excluded.cursor_updated_since,
    cursor_after_id = excluded.cursor_after_id,
    last_ok_at = now(),
    imported_total = s.imported_total + v_gravadas,
    updated_at = now();

  return jsonb_build_object('written', v_gravadas, 'skipped', v_puladas);
end $function$;

revoke all on function public.wl_booking_apply_page(uuid, jsonb, text, bigint) from public, anon, authenticated;
grant execute on function public.wl_booking_apply_page(uuid, jsonb, text, bigint) to service_role;

create or replace function public.wl_booking_detail(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_admin boolean := public.is_hub_admin();
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Autenticação necessária.' using errcode = '42501';
  end if;

  select jsonb_build_object(
           'id', w.id, 'company_id', w.company_id, 'company_name', c.name,
           'wl_order_id', w.wl_order_id, 'wl_order_number', w.wl_order_number,
           'status', public.wl_booking_hub_status(w.status, w.attendance_status, w.check_out_at),
           'site_status', w.status, 'wl_status', w.wl_status, 'origin', w.origin,
           'attendance_status', w.attendance_status, 'attendance_marked_at', w.attendance_marked_at,
           'customer_name', w.customer_name, 'customer_email', w.customer_email,
           'customer_phone', w.customer_phone, 'license_plate', w.license_plate,
           'check_in_at', w.check_in_at, 'check_out_at', w.check_out_at,
           'passenger_count', w.passenger_count, 'has_pcd', w.has_pcd, 'is_duplicate', w.is_duplicate,
           'total_cents', w.total_cents, 'paid_total_cents', w.paid_total_cents,
           'location_id', w.location_id, 'location_name', l.name,
           'location_parking_type_id', w.location_parking_type_id, 'parking_type_name', pt.name,
           'category_slug', w.category_slug, 'product_slug', w.product_slug,
           'utm', w.utm, 'wl_created_at', w.wl_created_at, 'wl_updated_at', w.wl_updated_at,
           'synced_at', w.synced_at,
           'payment_method_code', w.payment_method_code, 'payment_method_name', w.payment_method_name,
           'vehicle', w.vehicle, 'items', w.items, 'voucher_url', w.voucher_url,
           'is_affiliated', w.is_affiliated, 'duplicate_of_wl_order_id', w.duplicate_of_wl_order_id,
           'duplicate_of_id', (select d.id from public.wl_booking d
                                where d.company_id = w.company_id and d.wl_order_id = w.duplicate_of_wl_order_id),
           'duplicate_of_order_number', (select d.wl_order_number from public.wl_booking d
                                          where d.company_id = w.company_id and d.wl_order_id = w.duplicate_of_wl_order_id),
           -- Id da transação no gateway: só a equipe Movepark (spec § 4.2).
           'gateway_transaction_id', case when v_admin then w.gateway_transaction_id end,
           'site_events', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', e.id, 'kind', e.kind, 'occurred_at', e.occurred_at, 'actor', e.actor,
                      'note', e.note, 'data', e.data)
                    order by e.occurred_at, e.wl_event_id)
               from public.wl_booking_event e
              where e.wl_booking_id = w.id), '[]'::jsonb),
           'actions', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', a.id, 'action', a.action, 'request', a.request, 'result', a.result,
                      'result_code', a.result_code, 'message', a.message, 'created_at', a.created_at,
                      'by_name', case
                                   when a.requested_by is null then null
                                   when v_admin or a.requested_by = auth.uid() then coalesce(p.full_name, 'Sem nome')
                                   when p.role = 'hub_admin' then 'Equipe Movepark'
                                   else coalesce(p.full_name, 'Sem nome')
                                 end)
                    order by a.created_at desc)
               from public.wl_booking_action_log a
               left join public.profiles p on p.id = a.requested_by
              where a.wl_booking_id = w.id), '[]'::jsonb))
    into v_result
    from public.wl_booking w
    join public.company c on c.id = w.company_id
    left join public.location l on l.id = w.location_id
    left join public.location_parking_type lpt on lpt.id = w.location_parking_type_id
    left join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
    left join public.parking_type pt on pt.id = cpt.parking_type_id
   where w.id = p_id
     and w.company_id = any (public.wl_visible_company_ids());

  return v_result;
end $function$;

revoke all on function public.wl_booking_detail(uuid) from public, anon;
grant execute on function public.wl_booking_detail(uuid) to authenticated;

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
