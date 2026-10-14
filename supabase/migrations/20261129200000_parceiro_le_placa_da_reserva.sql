-- O parceiro passa a ler o veículo das reservas da empresa dele (14/10/2026).
--
-- A policy de SELECT de `vehicle` só deixava o dono (`profile_id = auth.uid()`) e o hub_admin. Como
-- o parceiro enxerga a reserva (`booking`, por `current_company_ids()`) mas não o veículo, o join
-- `vehicle:vehicle(...)` voltava nulo para ele: a ficha da reserva no Operator mostrava placa "-",
-- e o voucher gerado pelo Operator (Edge `voucher-pdf`, com o client do usuário) sairia sem placa,
-- justo o que a portaria confere.
--
-- O recorte é o mesmo da reserva: o veículo aparece só se uma reserva de unidade da empresa dele o
-- usa. Veículo de cliente que nunca reservou ali continua invisível. Só leitura: escrever no
-- veículo segue com o dono (ou pela Edge `change-booking-vehicle`).

create index if not exists booking_vehicle_id_idx on public.booking (vehicle_id) where vehicle_id is not null;

drop policy if exists vehicle_select on public.vehicle;
create policy vehicle_select on public.vehicle for select to authenticated
  using (
    profile_id = (select auth.uid())
    or (select public.is_hub_admin())
    or exists (
      select 1
        from public.booking b
        join public.location l on l.id = b.location_id
       where b.vehicle_id = vehicle.id
         and l.company_id in (select public.current_company_ids())
    )
  );
