-- E2.8-f / ADR-003 · Expõe "trocar veículo/placa da reserva" na Public API + MCP parceiro.
-- Wrapper api_* (gateway-only, service_role) que isola o tenant e faz a parte SQL: resolve o veículo
-- alvo (por vehicle_id do titular OU acha/cria por placa) e aponta a reserva. Espelha a lógica do
-- Edge change-booking-vehicle, MENOS a regeneração do voucher (PDF, lado Edge): o gateway/MCP fazem
-- isso em background quando a reserva está 'confirmed', usando o `status` retornado aqui.
-- Parceiro = staff da própria empresa (sem gate de benefício de Tarifa).

create or replace function public.api_change_booking_vehicle(
  p_company_id uuid, p_booking_id uuid, p_vehicle_id uuid default null, p_license_plate text default null
) returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_status  public.booking_status;
  v_profile uuid;
  v_target  uuid;
  v_owner   uuid;
  v_plate   text := upper(trim(coalesce(p_license_plate, '')));
begin
  -- Isolamento de tenant + carrega status/titular.
  select b.status, b.profile_id into v_status, v_profile
  from public.booking b
  join public.location l on l.id = b.location_id
  where b.id = p_booking_id and l.company_id = p_company_id and b.deleted_at is null;
  if v_status is null then
    raise exception 'Reserva não encontrada nesta empresa.' using errcode = 'P0001';
  end if;
  if v_status not in ('pending', 'confirmed') then
    raise exception 'Esta reserva não permite troca de veículo.' using errcode = 'P0001';
  end if;

  if p_vehicle_id is not null then
    -- Veículo já cadastrado: precisa existir e (se a reserva tem titular) pertencer a ele.
    select id, profile_id into v_target, v_owner
    from public.vehicle where id = p_vehicle_id and deleted_at is null;
    if v_target is null then
      raise exception 'Veículo não encontrado.' using errcode = 'P0001';
    end if;
    if v_profile is not null and v_owner is distinct from v_profile then
      raise exception 'O veículo não pertence ao titular da reserva.' using errcode = 'P0001';
    end if;
  elsif v_plate <> '' then
    -- Por placa: acha/cria o veículo do titular (precisa de titular).
    if v_profile is null then
      raise exception 'Reserva sem titular; não dá pra cadastrar a placa.' using errcode = 'P0001';
    end if;
    select id into v_target from public.vehicle
    where profile_id = v_profile and license_plate = v_plate and deleted_at is null
    limit 1;
    if v_target is null then
      insert into public.vehicle (profile_id, license_plate)
      values (v_profile, v_plate) returning id into v_target;
    end if;
  else
    raise exception 'Informe vehicle_id ou license_plate.' using errcode = 'P0001';
  end if;

  update public.booking set vehicle_id = v_target where id = p_booking_id;
  return jsonb_build_object('ok', true, 'booking_id', p_booking_id, 'vehicle_id', v_target, 'status', v_status);
end; $fn$;

revoke all on function public.api_change_booking_vehicle(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.api_change_booking_vehicle(uuid, uuid, uuid, text) to service_role;
