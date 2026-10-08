-- Reservas do site white-label, fase 4 (lado do Hub): o parceiro opera a reserva do site pelo Hub.
-- Spec: docs/specs/reservas-wl-no-hub.md (§ 10). Rotas do legado: agenciafera/movepark-backoffice#615
-- (POST backend/order/attendance e POST backend/order/license-plate).
--
-- Quem chama o legado é a Edge `wl-booking-action`, porque o token de backend do legado não pode ir
-- ao navegador. Esta migration dá a ela três peças:
--
--   1. `wl_booking_action_context` (chamada com o JWT do usuário): diz se ELE pode fazer a ação
--      naquela reserva e devolve o que a Edge precisa para chamar o legado. A permissão usa os
--      escopos que já existem para as reservas do Hub: check-in e no-show exigem `bookings:checkin`,
--      troca de placa exige `bookings:write` (ADR-005: a mesma permissão é o mesmo escopo). O
--      Financeiro, que vê as reservas do site, não opera.
--   2. `wl_booking_apply_action` (service_role): reflete o resultado na linha local na hora, sem
--      esperar a próxima leitura do legado (que confirma depois).
--   3. `wl_booking_action_log`: toda chamada ao legado deixa rastro, com quem pediu, o que mandou e
--      o que voltou. Mesma regra do rastro do gateway: nada que mexe em pedido de outro sistema
--      fica só no console.
--
-- Nasce DESLIGADA: `app_setting.wl_booking_import.actions_enabled = false`. As rotas só existem
-- depois do merge do #615, e com a chave desligada os botões nem aparecem.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Chave
-- ─────────────────────────────────────────────────────────────────────────────
update public.app_setting
   set value = (coalesce(nullif(value, '')::jsonb, '{}'::jsonb) || '{"actions_enabled": false}'::jsonb)::text
 where key = 'wl_booking_import'
   and not (coalesce(nullif(value, '')::jsonb, '{}'::jsonb) ? 'actions_enabled');

create or replace function public.wl_booking_actions_enabled()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce((public.wl_booking_import_policy()->>'actions_enabled')::boolean, false);
$$;

revoke all on function public.wl_booking_actions_enabled() from public, anon;
grant execute on function public.wl_booking_actions_enabled() to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Log
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.wl_booking_action_log (
  id             uuid primary key default gen_random_uuid(),
  wl_booking_id  uuid not null references public.wl_booking(id) on delete cascade,
  company_id     uuid not null references public.company(id) on delete cascade,
  action         text not null check (action in ('attendance', 'license_plate')),
  request        jsonb not null default '{}'::jsonb,
  requested_by   uuid references public.profiles(id) on delete set null,
  http_status    integer,
  result         text not null check (result in ('ok', 'refused', 'error')),
  result_code    text,
  message        text,
  created_at     timestamptz not null default now()
);

comment on table public.wl_booking_action_log is
  'Toda ação do Hub sobre uma reserva do site white-label (comparecimento, troca de placa), com quem pediu, o que foi mandado e o que o legado respondeu. Gravado pela Edge wl-booking-action.';

create index if not exists wl_booking_action_log_booking_idx on public.wl_booking_action_log (wl_booking_id, created_at desc);

alter table public.wl_booking_action_log enable row level security;
revoke all on table public.wl_booking_action_log from anon;
grant select on table public.wl_booking_action_log to authenticated;
drop policy if exists wl_booking_action_log_select on public.wl_booking_action_log;
create policy wl_booking_action_log_select on public.wl_booking_action_log for select to authenticated
  using (public.is_hub_admin() or public.member_has_scope(company_id, 'wl-bookings:read'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Contexto e autorização (JWT do usuário)
-- ─────────────────────────────────────────────────────────────────────────────
-- Devolve { ok, ... } em vez de levantar exceção para as recusas esperadas: a Edge traduz o
-- motivo em mensagem para quem clicou. Exceção fica para chamada sem sessão.
create or replace function public.wl_booking_action_context(p_wl_booking_id uuid, p_action text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_row record;
  v_scope text;
  v_actor text;
begin
  if auth.uid() is null then
    raise exception 'Autenticação necessária.' using errcode = '42501';
  end if;

  v_scope := case p_action
    when 'attendance' then 'bookings:checkin'
    when 'license_plate' then 'bookings:write'
  end;
  if v_scope is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_action');
  end if;

  if not public.wl_booking_actions_enabled() then
    return jsonb_build_object('ok', false, 'reason', 'disabled');
  end if;

  select w.id, w.company_id, w.wl_order_number, w.status, c.wl_domain, c.wl_tenant_key
    into v_row
    from public.wl_booking w
    join public.company c on c.id = w.company_id
   where w.id = p_wl_booking_id;

  if v_row.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if not (public.is_hub_admin() or public.member_has_scope(v_row.company_id, v_scope)) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  select coalesce(nullif(btrim(p.full_name), ''), u.email, 'parceiro')
    into v_actor
    from auth.users u
    left join public.profiles p on p.id = u.id
   where u.id = auth.uid();

  return jsonb_build_object(
    'ok', true,
    'company_id', v_row.company_id,
    'wl_order_number', v_row.wl_order_number,
    'status', v_row.status,
    'wl_domain', v_row.wl_domain,
    'wl_tenant_key', v_row.wl_tenant_key,
    'actor', v_actor,
    'profile_id', auth.uid()
  );
end $function$;

revoke all on function public.wl_booking_action_context(uuid, text) from public, anon;
grant execute on function public.wl_booking_action_context(uuid, text) to authenticated;

-- Quais ações quem chama pode fazer nas reservas do site de uma empresa: a tela mostra os botões
-- por isto, e o servidor confere de novo na hora da ação.
create or replace function public.wl_booking_my_actions(p_company_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select jsonb_build_object(
    'enabled', public.wl_booking_actions_enabled(),
    'attendance', auth.uid() is not null
                  and (public.is_hub_admin() or public.member_has_scope(p_company_id, 'bookings:checkin')),
    'license_plate', auth.uid() is not null
                     and (public.is_hub_admin() or public.member_has_scope(p_company_id, 'bookings:write'))
  );
$function$;

revoke all on function public.wl_booking_my_actions(uuid) from public, anon;
grant execute on function public.wl_booking_my_actions(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Reflexo local e log (service_role)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.wl_booking_record_action(
  p_wl_booking_id uuid,
  p_action text,
  p_request jsonb,
  p_requested_by uuid,
  p_http_status integer,
  p_result text,
  p_result_code text,
  p_message text,
  p_attendance_status text default null,
  p_license_plate text default null
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_company uuid;
begin
  select company_id into v_company from public.wl_booking where id = p_wl_booking_id;
  if v_company is null then
    return;
  end if;

  insert into public.wl_booking_action_log
    (wl_booking_id, company_id, action, request, requested_by, http_status, result, result_code, message)
  values
    (p_wl_booking_id, v_company, p_action, coalesce(p_request, '{}'::jsonb), p_requested_by,
     p_http_status, p_result, p_result_code, left(p_message, 500));

  -- Só o que o legado aceitou vai para a linha local. A próxima leitura incremental confirma.
  if p_result = 'ok' then
    update public.wl_booking
       set attendance_status = coalesce(p_attendance_status, attendance_status),
           attendance_marked_at = case when p_attendance_status is not null then now() else attendance_marked_at end,
           license_plate = coalesce(p_license_plate, license_plate)
     where id = p_wl_booking_id;
  end if;
end $function$;

revoke all on function public.wl_booking_record_action(uuid, text, jsonb, uuid, integer, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.wl_booking_record_action(uuid, text, jsonb, uuid, integer, text, text, text, text, text)
  to service_role;
