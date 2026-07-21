-- apply_fare_upgrade: preço da tarifa por unidade (86ajmwhdk) + gates revalidados (86ajmy41d).
--
-- As duas correções tocam a MESMA função, então vão juntas. Reescrever este corpo duas vezes em
-- migrations separadas é a armadilha que gerou a regressão original do overlay: a segunda reescrita
-- parte de uma versão que não tem a primeira.
--
-- 1) Preço por unidade. A função lia o catálogo global (public.fare) e ignorava
--    location_fare.price_cents_override. Agora resolve o location_parking_type a partir da própria
--    reserva e usa get_unit_fares, a MESMA fonte da vitrine. Não muda a assinatura: o vínculo sai de
--    booking.location_id + booking_item.parking_type_id via company_parking_type, o que evita mexer
--    no webhook que chama esta RPC.
--
-- 2) Gates. Os limites de negócio viviam só na Edge create-fare-upgrade, mas quem APLICA o upgrade é
--    o webhook, quando o PIX é pago. Como o QR do upgrade vive 1 hora, bem mais que o hold, dava
--    para gerar o QR, deixar o check-in passar (ou cancelar a reserva) e pagar depois: a RPC
--    aplicava assim mesmo, recalculando fare_cancel_until numa reserva que não podia mais mudar.
--    ADR-005: o enforcement é do servidor, e o servidor de verdade aqui é quem escreve.
--
-- Segue aceitando reserva 'pending' (ainda não paga), que é o comportamento de hoje e tem teste
-- ativo. A pergunta de produto sobre isso continua aberta na 86ajmy41d.

create or replace function public.apply_fare_upgrade(
  p_booking_id uuid,
  p_target_tier public.fare_tier
) returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_fare record; v_old_cents int; v_check_in timestamptz; v_cancel timestamptz; v_delta numeric;
  v_status public.booking_status; v_lpt uuid;
begin
  select fare_price_cents, check_in_at, status
    into v_old_cents, v_check_in, v_status
  from public.booking where id = p_booking_id and deleted_at is null
  for update;
  if v_check_in is null then
    raise exception 'Reserva não encontrada.' using errcode = 'P0001';
  end if;

  -- Gates revalidados no servidor que escreve, não só na Edge que cobra.
  if v_status not in ('pending', 'confirmed') then
    raise exception 'Reserva não permite upgrade neste status.' using errcode = 'P0001';
  end if;
  if v_check_in <= now() then
    raise exception 'Check-in já passou.' using errcode = 'P0001';
  end if;

  -- Unidade da reserva, para resolver a tarifa pela mesma fonte que a vitrine.
  select lpt.id into v_lpt
  from public.booking b
  join public.booking_item bi on bi.booking_id = b.id and bi.parking_type_id is not null
  join public.company_parking_type cpt on cpt.parking_type_id = bi.parking_type_id
  join public.location_parking_type lpt
    on lpt.location_id = b.location_id and lpt.company_parking_type_id = cpt.id
  where b.id = p_booking_id
  limit 1;

  select * into v_fare from public.get_unit_fares(v_lpt) where tier = p_target_tier;
  if v_fare.tier is null then
    raise exception 'Tarifa indisponível.' using errcode = 'P0001';
  end if;

  -- Sem downgrade / já aplicado → noop idempotente (webhook pode reentregar).
  if v_fare.price_cents <= coalesce(v_old_cents, 0) then
    return jsonb_build_object('booking_id', p_booking_id, 'upgraded', false);
  end if;

  if v_fare.cancel_window_minutes is not null then
    v_cancel := v_check_in - (v_fare.cancel_window_minutes || ' minutes')::interval;
  end if;
  v_delta := (v_fare.price_cents - coalesce(v_old_cents, 0)) / 100.0;

  update public.booking set
    fare_tier = p_target_tier,
    fare_price_cents = v_fare.price_cents,
    fare_cancel_until = v_cancel,
    fare_benefits = v_fare.benefits,
    total_amount = total_amount + v_delta
  where id = p_booking_id;

  return jsonb_build_object('booking_id', p_booking_id, 'upgraded', true, 'delta', v_delta);
end; $fn$;

-- Trinca a execução para só service_role. A original (20260720) já fazia revoke from public, mas o
-- default privilege do Supabase concede EXECUTE a authenticated em toda função nova do schema public,
-- e revoke from public não remove essa concessão. Só o webhook (service_role) chama esta RPC; a Edge
-- create-fare-upgrade é quem valida dono e cobra. Um authenticated chamando direto pulava esse gate.
revoke all on function public.apply_fare_upgrade(uuid, public.fare_tier) from public, anon, authenticated;
grant execute on function public.apply_fare_upgrade(uuid, public.fare_tier) to service_role;
