-- Lógica do status `expired` (abandono) vs `cancelled` (cancelamento real). Ver
-- docs/specs/booking-flow.md (seção "Abandono vs cancelamento").
--
-- Regra: `expired` = reserva encerrada que NUNCA foi paga (carrinho abandonado). `cancelled` =
-- reserva paga/comprometida e depois cancelada. É abandono APENAS quando a reserva é um `pending`
-- cru, sem nenhum pagamento comprometido. Qualquer outra coisa é cancelamento real:
--   - `confirmed`/`checked_in`: só se chega nesses status depois de pagar → sempre `cancelled`;
--   - `pending` que já tem pagamento pago ou em voo (a janela pré-confirmação, ou cartão em análise):
--     tem dinheiro envolvido → `cancelled`, não abandono.
-- "Comprometido" = payment paid/authorized/refunded, com paid_at, ou cartão que não falhou/cancelou.
--
-- CREATE OR REPLACE preserva owner e grants das funções existentes; não reemitimos GRANT.

-- 1) Expiração de pending abandonado. O corpo (grace + filtro de pagamento comprometido) é o mesmo
--    de sempre; a única diferença é o RESULTADO: como delega para cancel_booking_with_release, e essa
--    função agora decide pelo pagamento, o pending ocioso (sem pagamento) passa a virar `expired` em
--    vez de `cancelled`. Reserva com pagamento comprometido (paid/authorized/cartão em voo) continua
--    intocada. PIX apenas gerado e não pago expira normalmente (agora como abandono).
create or replace function public.cron_expire_pending_bookings()
returns integer language plpgsql security definer set search_path to 'public' as $fe$
declare v_id uuid; n integer := 0; v_grace int := public.get_booking_hold_grace_minutes();
begin
  for v_id in
    select b.id
    from public.booking b
    where b.status = 'pending'
      and b.expires_at is not null
      and b.expires_at < now() - make_interval(mins => v_grace)
      and b.deleted_at is null
      -- ADR-005: não cancela reserva com pagamento comprometido (paid/authorized/cartão em voo).
      -- PIX apenas gerado e não pago (method=pix, status=pending) NÃO casa → expira normalmente.
      and not exists (
        select 1 from public.payment p
        where p.booking_id = b.id
          and (
            p.status in ('paid', 'authorized')
            or (p.method = 'card' and p.status not in ('failed', 'cancelled', 'refunded'))
          )
      )
  loop
    perform public.cancel_booking_with_release(v_id, 'expiração automática (hold)');
    n := n + 1;
  end loop;
  return n;
end; $fe$;

-- 2) Cancelamento + liberação (Edge cancel-booking / webhook). Idempotente por status terminal.
--    pending cru e sem pagamento comprometido → expired (abandono); o resto → cancelled.
create or replace function public.cancel_booking_with_release(p_booking_id uuid, p_reason text default null)
returns public.booking_status
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_status public.booking_status;
  v_new_status public.booking_status;
begin
  select status into v_status from public.booking where id = p_booking_id for update;
  if v_status is null then
    raise exception 'Reserva não encontrada.' using errcode = 'P0001';
  end if;
  if v_status in ('cancelled', 'expired') then
    return v_status; -- noop: já terminal → NÃO libera capacidade de novo
  end if;
  if v_status not in ('pending', 'confirmed') then
    raise exception 'Reserva não pode ser cancelada no status %.', v_status using errcode = 'P0001';
  end if;

  -- Abandono só quando é um pending cru sem pagamento comprometido; o resto é cancelamento real.
  if v_status = 'pending' and not exists (
    select 1 from public.payment p
    where p.booking_id = p_booking_id
      and (p.status in ('paid', 'authorized', 'refunded') or p.paid_at is not null
           or (p.method = 'card' and p.status not in ('failed', 'cancelled', 'refunded')))
  ) then
    v_new_status := 'expired';
  else
    v_new_status := 'cancelled';
  end if;

  perform public.release_booking_capacity(p_booking_id);

  update public.booking
     set status = v_new_status,
         deleted_at = now(),
         notes = coalesce(notes || ' | ', '') || coalesce(nullif(trim(p_reason), ''), 'cancelamento')
   where id = p_booking_id;

  return v_new_status;
end;
$$;

-- 3) Cancelamento via Public API. Mesma regra: pending cru sem pagamento → expired; resto → cancelled.
create or replace function public.api_cancel_booking(
  p_company_id uuid, p_booking_id uuid, p_reason text default null
) returns jsonb language plpgsql security definer set search_path to 'public' as $acancel$
declare v_status public.booking_status; v_new_status public.booking_status;
begin
  select b.status into v_status from public.booking b
  join public.location l on l.id = b.location_id
  where b.id = p_booking_id and l.company_id = p_company_id and b.deleted_at is null;
  if v_status is null then
    raise exception 'Reserva não encontrada nesta empresa.' using errcode = 'P0001';
  end if;
  if v_status in ('cancelled', 'expired', 'completed') then
    raise exception 'Reserva não pode ser cancelada no status atual.' using errcode = 'P0001';
  end if;
  if v_status = 'pending' and not exists (
    select 1 from public.payment p
    where p.booking_id = p_booking_id
      and (p.status in ('paid', 'authorized', 'refunded') or p.paid_at is not null
           or (p.method = 'card' and p.status not in ('failed', 'cancelled', 'refunded')))
  ) then
    v_new_status := 'expired';
  else
    v_new_status := 'cancelled';
  end if;
  perform public.release_booking_capacity(p_booking_id);
  update public.booking
     set status = v_new_status, deleted_at = now(),
         notes = coalesce(notes || ' | ', '') || coalesce(nullif(trim(p_reason), ''), 'cancelada via API')
   where id = p_booking_id;
  return jsonb_build_object('booking_id', p_booking_id, 'status', v_new_status);
end; $acancel$;

-- 4) Pagamento que aterrissa TARDE numa reserva já encerrada: agora a reserva pode estar `expired`
--    (não só `cancelled`), então o caminho de reconfirmar-ou-estornar cobre os dois.
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

  if v_status = 'confirmed' then
    return jsonb_build_object('outcome', 'noop');
  end if;

  if v_status = 'pending' then
    update public.booking set status = 'confirmed', expires_at = null
    where id = p_booking_id and status = 'pending';
    return jsonb_build_object('outcome', 'confirmed');
  end if;

  -- Expirou/cancelou antes do pagamento aterrissar: reconfirma se houver vaga; senão estorna.
  if v_status in ('cancelled', 'expired') then
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

  return jsonb_build_object('outcome', 'noop');
end; $$;

-- 5) Backfill: os `cancelled` legados sem pagamento comprometido são carrinho abandonado → `expired`.
--    Quem teve pagamento pago/em voo (cancelamento real, com ou sem estorno) permanece `cancelled`.
--    Mesmo predicado de "comprometido" das funções acima, para não reclassificar um cancelamento real.
--    Não dispara os triggers de WPS/WL (eles observam new.status = 'cancelled', não 'expired').
update public.booking b
set status = 'expired'
where b.status = 'cancelled'
  and not exists (
    select 1 from public.payment p
    where p.booking_id = b.id
      and (p.status in ('paid', 'authorized', 'refunded') or p.paid_at is not null
           or (p.method = 'card' and p.status not in ('failed', 'cancelled', 'refunded')))
  );
