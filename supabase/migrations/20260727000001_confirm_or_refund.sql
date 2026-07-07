-- E0.3.1-a · Layer 4 — rede de segurança: confirmação de pagamento sobre reserva já expirada.
-- Caso 4c: o webhook `paid` chega depois do cron já ter cancelado a reserva (gap entre pagar e o
-- webhook). Antes: `update ... where status='pending'` casava 0 linhas → pagamento órfão (pago sem
-- vaga). Agora uma RPC única decide: reconfirma se ainda há vaga; senão sinaliza estorno (SQL não
-- faz HTTP — a Edge chamadora executa gateway.refundCharge). Ver docs/specs/booking-flow.md.

-- Simétrico ao release_booking_capacity: readquire a capacidade das datas do booking, com checagem.
-- Duas passadas: (1) trava + confere TODAS as datas; (2) só então incrementa — nunca estoura nem
-- deixa hold parcial. Retorna false se qualquer data estiver cheia/bloqueada (sem escrever nada).
create or replace function public.acquire_booking_capacity(p_booking_id uuid)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare
  v_lpt_id uuid; v_capacity int; v_check_in timestamptz; v_check_out timestamptz;
  v_date date; v_booked int; v_blocked boolean; v_external int;
begin
  select lpt.id, lpt.capacity, b.check_in_at, b.check_out_at
    into v_lpt_id, v_capacity, v_check_in, v_check_out
  from public.booking b
  join public.booking_item bi on bi.booking_id = b.id and bi.item_type = 'parking'
  join public.location l on l.id = b.location_id
  join public.company_parking_type cpt
    on cpt.parking_type_id = bi.parking_type_id and cpt.company_id = l.company_id
  join public.location_parking_type lpt
    on lpt.location_id = l.id and lpt.company_parking_type_id = cpt.id
  where b.id = p_booking_id
  limit 1;

  if v_lpt_id is null then
    return false;
  end if;

  -- Passo 1: trava e confere cada data (sem escrever booked_count).
  for v_date in
    select generate_series(v_check_in::date, (v_check_out - interval '1 microsecond')::date, '1 day')::date
  loop
    insert into public.location_parking_availability (location_parking_type_id, date, booked_count)
    values (v_lpt_id, v_date, 0) on conflict (location_parking_type_id, date) do nothing;
    select booked_count, blocked, external_booked_count into v_booked, v_blocked, v_external
    from public.location_parking_availability
    where location_parking_type_id = v_lpt_id and date = v_date for update;
    if coalesce(v_blocked, false) or v_booked + coalesce(v_external, 0) >= v_capacity then
      return false;  -- alguma data sem vaga → não adquire nada (locks liberam no fim da tx)
    end if;
  end loop;

  -- Passo 2: incrementa cada data (todas confirmadas com vaga acima).
  for v_date in
    select generate_series(v_check_in::date, (v_check_out - interval '1 microsecond')::date, '1 day')::date
  loop
    update public.location_parking_availability set booked_count = booked_count + 1
    where location_parking_type_id = v_lpt_id and date = v_date;
  end loop;

  return true;
end; $$;

alter function public.acquire_booking_capacity(uuid) owner to postgres;
revoke all on function public.acquire_booking_capacity(uuid) from public, anon, authenticated;
grant execute on function public.acquire_booking_capacity(uuid) to service_role;

-- Confirma a reserva ou sinaliza estorno. Idempotente por status (noop se já confirmed). Nunca
-- captura sem entregar: se a vaga sumiu, sinaliza needs_refund em vez de confirmar. Só a Edge estorna.
create or replace function public.confirm_or_refund_booking(p_booking_id uuid, p_payment_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_status public.booking_status;
  v_charge_id text;
begin
  select status into v_status from public.booking where id = p_booking_id for update;
  if v_status is null then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  -- Já confirmada (webhook reentregue / confirmação inline já rodou) → noop.
  if v_status = 'confirmed' then
    return jsonb_build_object('outcome', 'noop');
  end if;

  -- Caminho feliz: ainda segurando a vaga → confirma e zera o hold.
  if v_status = 'pending' then
    update public.booking set status = 'confirmed', expires_at = null
    where id = p_booking_id and status = 'pending';
    return jsonb_build_object('outcome', 'confirmed');
  end if;

  -- Expirou/cancelou antes do pagamento aterrissar (caso 4c): reconfirma se houver vaga; senão estorna.
  if v_status = 'cancelled' then
    if public.acquire_booking_capacity(p_booking_id) then
      update public.booking set status = 'confirmed', deleted_at = null, expires_at = null
      where id = p_booking_id;
      return jsonb_build_object('outcome', 'reconfirmed');
    else
      select provider_charge_id into v_charge_id from public.payment where id = p_payment_id;
      update public.payment
        set refund_reason = coalesce(nullif(trim(refund_reason), ''), 'pago sem vaga na confirmação tardia')
      where id = p_payment_id;
      return jsonb_build_object('outcome', 'needs_refund', 'charge_id', v_charge_id);
    end if;
  end if;

  -- checked_in / completed / no_show → já além da confirmação; noop defensivo.
  return jsonb_build_object('outcome', 'noop');
end; $$;

alter function public.confirm_or_refund_booking(uuid, uuid) owner to postgres;
revoke all on function public.confirm_or_refund_booking(uuid, uuid) from public, anon, authenticated;
grant execute on function public.confirm_or_refund_booking(uuid, uuid) to service_role;
