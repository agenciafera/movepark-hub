-- Reservas unificadas, fase 6 (09/10/2026): histórico da reserva do Hub com quem fez, como o
-- backoffice do white-label já mostra. Spec: docs/specs/reservas-unificadas-hub-wl.md § 4.2 ("linha
-- do tempo nos dois, com quem fez").
--
--   1. Check-in, check-out e no-show não deixavam rastro de quem marcou: a reserva só guarda
--      `checked_in_at`/`checked_out_at`, e nada ia para `booking_modification`. Um gatilho passa a
--      registrar a mudança de status operacional (tipo novo `status_change`) com o autor
--      (`auth.uid()`; nulo = sistema). Cancelamento e mudança de data continuam registrados pelas
--      Edges/RPCs que já fazem isso, sem duplicar.
--   2. A leitura de `booking_modification` por membro da empresa exigia só o vínculo; passa a exigir
--      `bookings:read`, como `booking_fare_extension` (ADR-005).
--   3. `booking_history(p_booking_id)`: o histórico com o nome de quem fez. SECURITY DEFINER só para
--      ler o nome (a RLS de `profiles` não deixa o parceiro ler o perfil de outra pessoa). Para o
--      parceiro, ação da equipe Movepark aparece como "Equipe Movepark" e a do cliente como
--      "Cliente", sem nome; a equipe vê todos os nomes.

alter type public.booking_modification_type add value if not exists 'status_change';

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Quem marcou check-in, check-out e no-show
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.booking_log_operational_status()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_role text;
begin
  if new.status is not distinct from old.status
     or new.status::text not in ('checked_in', 'completed', 'no_show') then
    return new;
  end if;

  v_role := case
    when v_uid is null then 'system'
    when v_uid = new.profile_id and not public.is_hub_admin() then 'customer'
    else 'staff'
  end;

  -- clock_timestamp: duas marcações na mesma transação (check-in e check-out em sequência) ficam
  -- na ordem em que aconteceram; now() daria o mesmo instante às duas.
  insert into public.booking_modification (booking_id, type, actor_id, actor_role, changes, created_at)
  values (new.id, 'status_change'::public.booking_modification_type, v_uid, v_role,
          jsonb_build_object('status', jsonb_build_object('from', old.status, 'to', new.status)),
          clock_timestamp());
  return new;
end $function$;

revoke all on function public.booking_log_operational_status() from public, anon, authenticated;

drop trigger if exists booking_log_operational_status on public.booking;
create trigger booking_log_operational_status
  after update of status on public.booking
  for each row execute function public.booking_log_operational_status();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Leitura do histórico por escopo
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists booking_modification_select on public.booking_modification;
create policy booking_modification_select on public.booking_modification for select to authenticated
  using (
    public.is_hub_admin()
    or exists (select 1 from public.booking b where b.id = booking_id and b.profile_id = auth.uid())
    or exists (
      select 1
        from public.booking b
        join public.location l on l.id = b.location_id
       where b.id = booking_id
         and public.member_has_scope(l.company_id, 'bookings:read')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Histórico com quem fez
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.booking_history(p_booking_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_admin boolean := public.is_hub_admin();
  v_owner uuid;
  v_company uuid;
begin
  if v_uid is null then
    raise exception 'Autenticação necessária.' using errcode = '42501';
  end if;

  select b.profile_id, l.company_id into v_owner, v_company
    from public.booking b
    left join public.location l on l.id = b.location_id
   where b.id = p_booking_id;

  if not found then
    return '[]'::jsonb;
  end if;
  if not (v_admin or v_owner = v_uid or (v_company is not null and public.member_has_scope(v_company, 'bookings:read'))) then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', m.id, 'type', m.type, 'created_at', m.created_at,
             'actor_role', m.actor_role, 'changes', m.changes,
             'amount_delta_cents', m.amount_delta_cents, 'reason', m.reason,
             'actor_name', case
               when m.actor_id is null then null
               when v_admin or m.actor_id = v_uid then coalesce(p.full_name, 'Sem nome')
               when m.actor_id = v_owner then 'Cliente'
               when p.role = 'hub_admin' then 'Equipe Movepark'
               else coalesce(p.full_name, 'Sem nome')
             end)
           order by m.created_at, m.id)
      from public.booking_modification m
      left join public.profiles p on p.id = m.actor_id
     where m.booking_id = p_booking_id), '[]'::jsonb);
end $function$;

comment on function public.booking_history(uuid) is
  'Histórico da reserva do Hub (booking_modification) com quem fez. Para o parceiro, equipe Movepark e cliente aparecem sem nome. Fase 6 das reservas unificadas.';

revoke all on function public.booking_history(uuid) from public, anon;
grant execute on function public.booking_history(uuid) to authenticated;
