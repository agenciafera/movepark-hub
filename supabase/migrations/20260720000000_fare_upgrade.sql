-- E2.8-d · Upgrade de Tarifa pós-reserva (cobrança do delta, receita de serviço Movepark).
-- A cobrança do upgrade é um `payment` separado (kind='fare_upgrade'); quando pago, o webhook
-- promove a Tarifa da reserva via apply_fare_upgrade (em vez de confirmar/gerar voucher).

alter table public.payment
  add column kind text not null default 'booking' check (kind in ('booking', 'fare_upgrade')),
  add column fare_target_tier public.fare_tier;

comment on column public.payment.kind is
  'booking = cobrança da reserva; fare_upgrade = cobrança do delta de upgrade de Tarifa (E2.8-d).';

-- Promove a Tarifa da reserva para o nível alvo: atualiza preço/janela/benefícios snapshot e soma o
-- delta ao total. Idempotente: se a reserva já está no nível (ou acima), é noop.
create or replace function public.apply_fare_upgrade(
  p_booking_id uuid,
  p_target_tier public.fare_tier
) returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_fare public.fare; v_old_cents int; v_check_in timestamptz; v_cancel timestamptz; v_delta numeric;
begin
  select fare_price_cents, check_in_at into v_old_cents, v_check_in
  from public.booking where id = p_booking_id and deleted_at is null
  for update;
  if v_check_in is null then
    raise exception 'Reserva não encontrada.' using errcode = 'P0001';
  end if;

  select * into v_fare from public.fare where tier = p_target_tier and is_active = true;
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

revoke all on function public.apply_fare_upgrade(uuid, public.fare_tier) from public;
grant execute on function public.apply_fare_upgrade(uuid, public.fare_tier) to service_role;
