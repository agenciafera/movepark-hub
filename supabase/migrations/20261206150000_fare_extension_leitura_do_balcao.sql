-- A extensão de saída da proteção de voo continua legível pelo balcão (23/11/2026).
--
-- `booking_fare_extension_company_select` deixa ler a extensão o membro com `bookings:read` na empresa
-- da reserva, porque é nela que está o excedente que o balcão cobra (`overage_cents`,
-- `overage_charged_cents`). A policy consultava `booking` pela RLS do chamador; com `booking_select`
-- atrás de `finance:read` (20261206140100), a Operação deixou de enxergar a extensão (o CI pegou:
-- flight_protection.test.sql, "o operador da empresa enxerga a extensão").
--
-- O ajudante olha a reserva como dono, só para dizer se a pessoa tem `bookings:read` na empresa dela
-- (mesma regra de antes; hub_admin alcança todas), e a policy passa a chamá-lo. A policy é
-- `TO authenticated`, então o ajudante não precisa de EXECUTE para anon. A extensão não é o dinheiro
-- da reserva: o crédito ao parceiro (`partner_credit_cents`) segue como limite registrado em
-- docs/specs/permissions.md.

create or replace function public.counter_can_see_booking(p_booking_id uuid)
returns boolean
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1
      from public.booking b
      join public.location l on l.id = b.location_id
     where b.id = p_booking_id
       and l.company_id = any (public.counter_company_ids())
  )
$$;

revoke all on function public.counter_can_see_booking(uuid) from public, anon;
grant execute on function public.counter_can_see_booking(uuid) to authenticated, service_role;

alter policy booking_fare_extension_company_select on public.booking_fare_extension
  using (public.counter_can_see_booking(booking_id));
