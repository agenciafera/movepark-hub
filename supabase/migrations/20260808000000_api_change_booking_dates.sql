-- E2.8-f / ADR-003 · Expõe "reagendar reserva" na Public API + MCP parceiro.
-- Wrapper api_* (gateway-only, service_role) sobre change_booking_dates, no padrão das demais
-- api_* de booking: isola o tenant (a reserva tem que pertencer à empresa da chave) e delega.
-- change_booking_dates revalida pending/capacidade/min-stay e re-precifica atômico; reserva paga é
-- recusada lá dentro. O parceiro age como STAFF da própria empresa, então NÃO há gate de benefício
-- de Tarifa (Flex+) aqui — igual ao override de staff no Edge change-booking-dates.

create or replace function public.api_change_booking_dates(
  p_company_id uuid, p_booking_id uuid, p_check_in timestamptz, p_check_out timestamptz
) returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare v_status public.booking_status;
begin
  select b.status into v_status
  from public.booking b
  join public.location l on l.id = b.location_id
  where b.id = p_booking_id and l.company_id = p_company_id and b.deleted_at is null;
  if v_status is null then
    raise exception 'Reserva não encontrada nesta empresa.' using errcode = 'P0001';
  end if;
  return public.change_booking_dates(p_booking_id, p_check_in, p_check_out);
end; $fn$;

revoke all on function public.api_change_booking_dates(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.api_change_booking_dates(uuid, uuid, timestamptz, timestamptz) to service_role;
