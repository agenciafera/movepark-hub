-- Ocupação devolve também o vendido no site do parceiro (WL).
--
-- O card "Ocupação" do dashboard do operador lia só `booked_count` (reservas do Hub) e
-- mostrava a Abbapark com 3% numa semana em que o pátio estava perto de 45%: o grosso das
-- reservas entra pelo WL e mora em `location_parking_availability.external_booked_count`,
-- que o anti-overbooking já soma desde a E2.5.1. A RPC passa a devolver essa coluna, para a
-- ocupação do dashboard bater com a da tela de Ocupação e com a checagem de capacidade.
--
-- Mudança aditiva no retorno (coluna nova no fim). Como o tipo de retorno muda, é
-- drop + create, e os grants são refeitos iguais aos de antes (authenticated e
-- service_role; nada para anon nem public).

drop function if exists public.operator_location_occupancy(uuid, date, date);

create function public.operator_location_occupancy(
  p_location_id uuid,
  p_from date,
  p_to date
) returns table(
  location_parking_type_id uuid,
  parking_type_name text,
  date date,
  capacity integer,
  booked_count integer,
  blocked boolean,
  external_booked_count integer
) language plpgsql stable security definer set search_path to 'public' as $occ$
declare v_company_id uuid;
begin
  select company_id into v_company_id from public.location where id = p_location_id and deleted_at is null;
  if v_company_id is null then
    raise exception 'Unidade não encontrada.' using errcode = 'P0001';
  end if;
  if not public.is_hub_admin()
     and not exists (select 1 from public.profile_company where profile_id = auth.uid() and company_id = v_company_id) then
    raise exception 'Sem permissão para ver a ocupação desta unidade.' using errcode = '42501';
  end if;
  if not public.member_has_scope(v_company_id, 'occupancy:read') then
    raise exception 'Seu papel não permite ver a ocupação (occupancy:read).' using errcode = '42501';
  end if;

  return query
    select lpt.id, pt.name, d.date::date, lpt.capacity, coalesce(a.booked_count, 0),
           coalesce(a.blocked, false), coalesce(a.external_booked_count, 0)
    from public.location_parking_type lpt
    join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
    join public.parking_type pt on pt.id = cpt.parking_type_id
    cross join generate_series(p_from, p_to, '1 day') d(date)
    left join public.location_parking_availability a
      on a.location_parking_type_id = lpt.id and a.date = d.date::date
    where lpt.location_id = p_location_id and lpt.is_active
    order by pt.name, d.date;
end; $occ$;

revoke all on function public.operator_location_occupancy(uuid, date, date) from public, anon;
grant execute on function public.operator_location_occupancy(uuid, date, date) to authenticated, service_role;
