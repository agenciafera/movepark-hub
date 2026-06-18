-- E0.3.2 — Estorno / refunded. Colunas de estorno no `payment` e uma RPC única e idempotente
-- (`cancel_booking_with_release`) que cancela a reserva + libera a capacidade no MÁXIMO uma vez.
-- Edge `cancel-booking` e `pagarme-webhook` chamam só essa RPC, evitando dupla liberação de vaga
-- (release_booking_capacity decrementa por data e NÃO é idempotente). Ver docs/specs/booking-flow.md.

-- Dados do estorno no payment. provider_payment_id guarda o ORDER id; o estorno precisa do CHARGE id.
alter table public.payment
  add column if not exists provider_charge_id text,
  add column if not exists refunded_amount numeric(12,2),
  add column if not exists refunded_at timestamptz,
  add column if not exists refund_reason text;

comment on column public.payment.provider_charge_id is
  'charge.id do gateway (necessário p/ estorno; provider_payment_id guarda o order id).';

-- Lookup do webhook charge.refunded por charge id.
create index if not exists payment_provider_charge_id_idx
  on public.payment (provider_charge_id)
  where provider_charge_id is not null;

-- Cancela a reserva e libera a capacidade UMA vez. Idempotente por status: noop se já `cancelled`.
-- Único ponto de cancelamento+liberação chamado pela Edge e pelo webhook (service_role).
create or replace function public.cancel_booking_with_release(p_booking_id uuid, p_reason text default null)
returns public.booking_status
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_status public.booking_status;
begin
  select status into v_status from public.booking where id = p_booking_id for update;
  if v_status is null then
    raise exception 'Reserva não encontrada.' using errcode = 'P0001';
  end if;
  if v_status = 'cancelled' then
    return v_status; -- noop: já cancelada → NÃO libera capacidade de novo
  end if;
  if v_status not in ('pending', 'confirmed') then
    raise exception 'Reserva não pode ser cancelada no status %.', v_status using errcode = 'P0001';
  end if;

  perform public.release_booking_capacity(p_booking_id);

  update public.booking
     set status = 'cancelled',
         deleted_at = now(),
         notes = coalesce(notes || ' | ', '') || coalesce(nullif(trim(p_reason), ''), 'cancelamento')
   where id = p_booking_id;

  return 'cancelled';
end;
$$;

alter function public.cancel_booking_with_release(uuid, text) owner to postgres;
revoke all on function public.cancel_booking_with_release(uuid, text) from public, anon, authenticated;
grant execute on function public.cancel_booking_with_release(uuid, text) to service_role;
