-- Reservas do site white-label no Hub, fase 1: tabela própria e sincronização.
-- Spec: docs/specs/reservas-wl-no-hub.md. Do lado do legado: PR agenciafera/movepark-backoffice#614
-- (GET /api/v3/backend/orders?updated_since=), cujo contrato está em
-- .claude/specs/api-backend-lista-pedidos.md naquele repositório.
--
-- Decisões que esta migration materializa:
--
--   1. Tabela própria, nunca `booking` (mesmo raciocínio do ADR-010). 68 funções leem `booking` e
--      nenhuma filtra origem; 11 triggers disparam cashback, e-mail, WhatsApp, WPS e a própria
--      entrega ao WL. Aqui o estado impossível é impossível por ausência de FK e de trigger:
--      nenhuma tabela de dinheiro, cupom, avaliação ou capacidade aponta para `wl_booking`.
--   2. O dinheiro da venda do site não passa pelo Hub (cai na conta Pagar.me do parceiro). Os
--      valores aqui são informativos e nunca entram em repasse, comissão ou KPI do Hub.
--   3. A capacidade não muda: `external_booked_count` (wl-reconcile) já representa o WL no
--      anti-overbooking. Esta tabela só exibe.
--   4. Dado do cliente é do parceiro (contrato v2, Anexo A). Leitura só por hub_admin nesta fase;
--      nada de marketing da Movepark nem ligação com conta do Hub por coincidência de contato.
--   5. Nasce DESLIGADA (`app_setting.wl_booking_import.enabled = false`): a rota do legado só
--      existe depois do merge do #614. Ligar é mudar a chave, sem deploy.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tabela
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.wl_booking (
  id                       uuid primary key default gen_random_uuid(),
  company_id               uuid not null references public.company(id) on delete cascade,
  location_id              uuid references public.location(id) on delete set null,
  location_parking_type_id uuid references public.location_parking_type(id) on delete set null,
  wl_order_id              bigint not null,
  wl_order_number          text not null,
  wl_status                text,
  status                   text not null check (status in (
                             'pending', 'confirmed', 'cancelled', 'expired',
                             'refund_requested', 'refunded', 'unknown')),
  origin                   text,
  external_id              text,
  category_slug            text,
  product_slug             text,
  check_in_at              timestamptz,
  check_out_at             timestamptz,
  license_plate            text,
  passenger_count          integer,
  has_pcd                  boolean not null default false,
  total_cents              integer,
  paid_total_cents         integer,
  attendance_status        text,
  attendance_marked_at     timestamptz,
  is_duplicate             boolean not null default false,
  customer_name            text,
  customer_email           text,
  customer_phone           text,
  utm                      jsonb not null default '{}'::jsonb,
  wl_created_at            timestamptz,
  wl_updated_at            timestamptz,
  synced_at                timestamptz not null default now(),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (company_id, wl_order_id)
);

comment on table public.wl_booking is
  'Reservas feitas no site white-label do parceiro, importadas do legado (GET backend/orders). Contadas à parte: o dinheiro não passa pelo Hub, não entram em capacidade, repasse, comissão nem KPI do Hub, e nada aponta para cá. Dado do cliente é do parceiro (contrato v2, Anexo A). Ver reservas-wl-no-hub.md.';
comment on column public.wl_booking.total_cents is 'Informativo: valor do pedido no site do parceiro. Nunca entra em conta da Movepark.';
comment on column public.wl_booking.check_in_at is 'initial_date do legado (hora local de São Paulo, sem fuso) convertida para timestamptz.';

create index if not exists wl_booking_company_checkin_idx on public.wl_booking (company_id, check_in_at);
create index if not exists wl_booking_lpt_checkin_idx on public.wl_booking (location_parking_type_id, check_in_at);

drop trigger if exists wl_booking_set_updated_at on public.wl_booking;
create trigger wl_booking_set_updated_at before update on public.wl_booking
  for each row execute function public.set_updated_at();

alter table public.wl_booking enable row level security;
revoke all on table public.wl_booking from anon;
grant select on table public.wl_booking to authenticated;
drop policy if exists wl_booking_admin_select on public.wl_booking;
create policy wl_booking_admin_select on public.wl_booking for select to authenticated
  using (public.is_hub_admin());

-- Cursor por empresa: o par (updated_since, after_id) que a rota devolve em meta.next_cursor.
create table if not exists public.wl_booking_sync_state (
  company_id           uuid primary key references public.company(id) on delete cascade,
  cursor_updated_since text not null default '1970-01-01 00:00:00',
  cursor_after_id      bigint not null default 0,
  last_ok_at           timestamptz,
  last_error           text,
  last_error_at        timestamptz,
  imported_total       bigint not null default 0,
  updated_at           timestamptz not null default now()
);

alter table public.wl_booking_sync_state enable row level security;
revoke all on table public.wl_booking_sync_state from anon;
grant select on table public.wl_booking_sync_state to authenticated;
drop policy if exists wl_booking_sync_state_admin_select on public.wl_booking_sync_state;
create policy wl_booking_sync_state_admin_select on public.wl_booking_sync_state for select to authenticated
  using (public.is_hub_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Configuração e recorte
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.app_setting (key, value)
values ('wl_booking_import', '{"enabled": false, "lookback_months": 12, "page_limit": 200}')
on conflict (key) do nothing;

create or replace function public.wl_booking_import_policy()
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(
    (select nullif(value, '')::jsonb from public.app_setting where key = 'wl_booking_import'),
    '{}'::jsonb
  );
$$;

create or replace function public.wl_booking_import_enabled()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce((public.wl_booking_import_policy()->>'enabled')::boolean, false);
$$;

revoke all on function public.wl_booking_import_policy() from public, anon, authenticated;
grant execute on function public.wl_booking_import_policy() to service_role;
revoke all on function public.wl_booking_import_enabled() from public, anon, authenticated;
grant execute on function public.wl_booking_import_enabled() to service_role;

-- Empresas cuja venda no site é importada: as que o Hub conhece com site WL (domínio + tenant).
-- Decisão de 08/10/2026: todas as que têm WL no Hub, a Virapark (silent) incluída.
create or replace view public.wl_booking_import_target
with (security_invoker = true) as
select c.id as company_id
  from public.company c
 where nullif(btrim(coalesce(c.wl_domain, '')), '') is not null
   and nullif(btrim(coalesce(c.wl_tenant_key, '')), '') is not null
   and c.deleted_at is null;

revoke all on public.wl_booking_import_target from anon, authenticated;
grant select on public.wl_booking_import_target to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Gravação de uma página
-- ─────────────────────────────────────────────────────────────────────────────
-- O que o legado chama de status vira o vocabulário do Hub. O texto original fica em wl_status.
create or replace function public.wl_booking_status(p_code text)
returns text
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  select case p_code
    when 'new' then 'pending'
    when 'in_progress' then 'pending'
    when 'complete' then 'confirmed'
    when 'canceled' then 'cancelled'
    when 'expired' then 'expired'
    when 'refund-requested' then 'refund_requested'
    when 'refunded' then 'refunded'
    else 'unknown'
  end;
$$;

revoke all on function public.wl_booking_status(text) from public, anon, authenticated;
grant execute on function public.wl_booking_status(text) to service_role;

-- Grava uma página da rota do legado e avança o cursor NA MESMA transação: se a gravação falha,
-- o cursor não anda e a próxima passada relê a mesma página.
--
-- Pula, mas avança o cursor sobre:
--   - pedido cujo external_id é uma reserva do Hub (nunca importar de volta o que é nosso);
--   - pedido que já saiu antes da janela (`lookback_months`, padrão 12).
-- Não regride: linha mais nova no banco que a que chegou é mantida.
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
      customer_name, customer_email, customer_phone, utm, wl_created_at, wl_updated_at, synced_at
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
      v_updated, now()
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
      synced_at = now()
    where w.wl_updated_at is null
       or excluded.wl_updated_at is null
       or excluded.wl_updated_at >= w.wl_updated_at;

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

create or replace function public.wl_booking_sync_fail(p_company_id uuid, p_error text)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  insert into public.wl_booking_sync_state (company_id, last_error, last_error_at, updated_at)
  values (p_company_id, left(coalesce(p_error, 'erro sem mensagem'), 500), now(), now())
  on conflict (company_id) do update
    set last_error = excluded.last_error, last_error_at = now(), updated_at = now();
end $function$;

revoke all on function public.wl_booking_sync_fail(uuid, text) from public, anon, authenticated;
grant execute on function public.wl_booking_sync_fail(uuid, text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Saúde: a importação entra no mesmo alarme
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.wl_integration_health(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_cfg jsonb;
  v_atraso_entrega_min integer;
  v_atraso_reconcile_min integer;
  v_atraso_espelho_h integer;
  v_falhas integer;
  v_atrasadas integer;
  v_reconcile_parada integer;
  v_reconcile_erro integer;
  v_espelho_erro integer;
  v_espelho_divergente integer;
  v_espelho_atrasado integer;
  v_espelho_mais_antigo timestamptz;
  v_import_ligada boolean;
  v_import_parada integer;
  v_motivos text[] := '{}';
begin
  if auth.uid() is not null and not public.is_hub_admin() then
    raise exception 'Apenas a equipe Movepark lê a saúde do white-label.' using errcode = '42501';
  end if;

  v_cfg := coalesce(
    (select nullif(value, '')::jsonb from public.app_setting where key = 'wl_health_policy'),
    '{}'::jsonb
  );
  v_atraso_entrega_min   := coalesce((v_cfg->>'delivery_max_age_minutes')::integer, 60);
  v_atraso_reconcile_min := coalesce((v_cfg->>'reconcile_max_age_minutes')::integer, 120);
  v_atraso_espelho_h     := coalesce((v_cfg->>'mirror_max_age_hours')::integer, 24);

  select count(*) into v_falhas from public.wl_delivery where status = 'failed';

  select count(*) into v_atrasadas
    from public.wl_delivery
   where status = 'pending'
     and created_at < p_now - make_interval(mins => v_atraso_entrega_min);

  select count(*) filter (where s.reconciled_at is null
                             or s.reconciled_at < p_now - make_interval(mins => v_atraso_reconcile_min)),
         count(*) filter (where s.reconcile_error is not null)
    into v_reconcile_parada, v_reconcile_erro
    from public.wl_reconcile_target t
    left join public.wl_sync_state s using (location_parking_type_id);

  select count(*) filter (where pr.mirror_status = 'error'),
         count(*) filter (where pr.mirror_status = 'divergent'),
         count(*) filter (where pr.mirror_verified_at is null
                             or pr.mirror_verified_at < p_now - make_interval(hours => v_atraso_espelho_h)),
         min(pr.mirror_verified_at)
    into v_espelho_erro, v_espelho_divergente, v_espelho_atrasado, v_espelho_mais_antigo
    from public.wl_mirror_target t
    left join public.pricing_rule pr on pr.location_parking_type_id = t.location_parking_type_id;

  if v_falhas > 0 then v_motivos := array_append(v_motivos, 'entrega_falhou'); end if;
  if v_atrasadas > 0 then v_motivos := array_append(v_motivos, 'entrega_atrasada'); end if;
  if v_reconcile_parada > 0 then v_motivos := array_append(v_motivos, 'reconciliacao_parada'); end if;
  if v_espelho_erro > 0 then v_motivos := array_append(v_motivos, 'espelho_com_erro'); end if;
  if v_espelho_divergente > 0 then v_motivos := array_append(v_motivos, 'espelho_divergente'); end if;
  if v_espelho_atrasado > 0 then v_motivos := array_append(v_motivos, 'espelho_atrasado'); end if;

  -- Importação das reservas do site (wl_booking). Só conta quando está ligada: desligada é o
  -- estado de quem ainda não tem a rota no legado, e não é problema.
  v_import_ligada := public.wl_booking_import_enabled();
  if v_import_ligada then
    select count(*) into v_import_parada
      from public.wl_booking_import_target t
      left join public.wl_booking_sync_state s using (company_id)
     where s.last_ok_at is null
        or s.last_ok_at < p_now - make_interval(mins => v_atraso_reconcile_min)
        or (s.last_error_at is not null and s.last_error_at > coalesce(s.last_ok_at, '-infinity'));
    if v_import_parada > 0 then v_motivos := array_append(v_motivos, 'importacao_parada'); end if;
  end if;

  return jsonb_build_object(
    'ok', cardinality(v_motivos) = 0,
    'motivos', to_jsonb(v_motivos),
    'entregas_falhas', v_falhas,
    'entregas_atrasadas', v_atrasadas,
    'reconciliacao_parada', v_reconcile_parada,
    'reconciliacao_com_erro', v_reconcile_erro,
    'espelho_com_erro', v_espelho_erro,
    'espelho_divergente', v_espelho_divergente,
    'espelho_atrasado', v_espelho_atrasado,
    'espelho_mais_antigo', v_espelho_mais_antigo,
    'importacao_ligada', v_import_ligada,
    'importacao_parada', coalesce(v_import_parada, 0),
    'limites', jsonb_build_object(
      'entrega_minutos', v_atraso_entrega_min,
      'reconciliacao_minutos', v_atraso_reconcile_min,
      'espelho_horas', v_atraso_espelho_h
    )
  );
end $function$;

revoke all on function public.wl_integration_health(timestamptz) from public, anon;
grant execute on function public.wl_integration_health(timestamptz) to authenticated, service_role;

create or replace function public.manager_wl_health()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if not public.is_hub_admin() then
    raise exception 'Apenas a equipe Movepark lê a saúde do white-label.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'health', public.wl_integration_health(now()),
    'deliveries', coalesce((
      select jsonb_agg(x order by x.created_at desc)
        from (
          select d.id, d.event_id, d.operation, d.status, d.attempts, d.max_attempts,
                 d.last_status, d.last_error, d.next_attempt_at, d.created_at,
                 d.payload->>'start_date' as start_date, d.payload->>'end_date' as end_date,
                 split_part(split_part(d.event_id, ':', 1), '#', 1) as booking_id,
                 b.code as booking_code,
                 c.name as company_name
            from public.wl_delivery d
            join public.company c on c.id = d.company_id
            left join public.booking b on b.id::text = split_part(split_part(d.event_id, ':', 1), '#', 1)
           where d.status = 'failed'
              or (d.status = 'pending' and d.created_at < now() - interval '10 minutes')
           order by d.created_at desc
           limit 100
        ) x
    ), '[]'::jsonb),
    'recent', (
      select jsonb_build_object(
        'delivered_24h', count(*) filter (where status = 'delivered' and delivered_at > now() - interval '24 hours'),
        'pending', count(*) filter (where status = 'pending'),
        'last_delivered_at', max(delivered_at)
      ) from public.wl_delivery
    ),
    'imports', coalesce((
      select jsonb_agg(x order by x.company_name)
        from (
          select c.name as company_name, t.company_id,
                 s.last_ok_at, s.last_error, s.last_error_at, s.cursor_updated_since,
                 (select count(*) from public.wl_booking b where b.company_id = t.company_id) as bookings,
                 (select count(*) from public.wl_booking b
                   where b.company_id = t.company_id and b.check_out_at >= now()
                     and b.status in ('pending', 'confirmed', 'refund_requested')) as upcoming
            from public.wl_booking_import_target t
            join public.company c on c.id = t.company_id
            left join public.wl_booking_sync_state s using (company_id)
        ) x
    ), '[]'::jsonb),
    'import_enabled', public.wl_booking_import_enabled(),
    'units', coalesce((
      select jsonb_agg(u order by u.company_name, u.location_name, u.parking_type_name)
        from (
          select lpt.id as location_parking_type_id,
                 c.name as company_name, l.name as location_name, pt.name as parking_type_name,
                 l.checkout_mode, c.wl_sync_enabled,
                 lpt.wl_category_slug, lpt.wl_product_slug,
                 (rt.location_parking_type_id is not null) as reconcile_expected,
                 s.reconciled_at, s.reconcile_error, s.reconcile_error_at,
                 pr.mirror_status, pr.mirror_verified_at, pr.mirror_sampled_at, pr.mirror_error
            from public.wl_mirror_target mt
            full join public.wl_reconcile_target rt using (location_parking_type_id)
            join public.location_parking_type lpt on lpt.id = coalesce(mt.location_parking_type_id, rt.location_parking_type_id)
            join public.location l on l.id = lpt.location_id
            join public.company c on c.id = l.company_id
            join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
            join public.parking_type pt on pt.id = cpt.parking_type_id
            left join public.wl_sync_state s on s.location_parking_type_id = lpt.id
            left join public.pricing_rule pr on pr.location_parking_type_id = lpt.id
        ) u
    ), '[]'::jsonb)
  );
end $function$;

revoke all on function public.manager_wl_health() from public, anon;
grant execute on function public.manager_wl_health() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Cron (a Edge sai cedo enquanto a chave estiver desligada)
-- ─────────────────────────────────────────────────────────────────────────────
select cron.unschedule(jobid) from cron.job where jobname = 'wl-bookings-sync';

select cron.schedule('wl-bookings-sync', '7,22,37,52 * * * *', $cron$
  select net.http_post(
    url := 'https://mgaigbezdalbyuqiofcf.supabase.co/functions/v1/wl-bookings-sync',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-wl-deliver-key', (select decrypted_secret from vault.decrypted_secrets where name = 'wl_deliver_key')),
    body := '{}'::jsonb,
    timeout_milliseconds := 180000);
$cron$);
