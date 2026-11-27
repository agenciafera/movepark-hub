-- Cobrança de cartão sem resposta do gateway (26/11/2026, depois da MP-F00991 e da MP-C365C9).
--
-- Na noite de 25/11 o Pagar.me respondeu 500 ao criar o pedido e aprovou a cobrança mesmo assim.
-- Agora a Edge `create-card-charge`, quando não sabe o resultado e não acha o pedido no gateway,
-- grava o `payment` pendente SEM ids (`provider_payment_id is null`) e com prazo em `expires_at`
-- (ver supabase/functions/_shared/payments/unconfirmed.ts). Cartão pendente já segura a reserva no
-- cron, e é isso que se quer enquanto a cobrança pode aparecer.
--
-- O que faltava: passado o prazo sem aviso do gateway, a linha ficaria pendente para sempre e a
-- reserva nunca expiraria, prendendo a vaga. O cron passa a dá-la como recusada (`failed`) antes de
-- varrer as reservas. `failed` não é terminal em `apply_payment_webhook_status`: se a cobrança
-- aparecer depois, o webhook a pendura nesta mesma linha e `confirm_or_refund_booking` reconfirma a
-- reserva (havendo vaga) ou pede o estorno.
--
-- Só cartão, só reserva (`kind = 'booking'`), só sem id do gateway. Cartão em análise tem id e
-- continua intocado.

create or replace function public.cron_expire_pending_bookings()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_id uuid; n integer := 0; v_grace int := public.get_booking_hold_grace_minutes();
begin
  -- Cobrança sem resposta cujo prazo venceu: dá como recusada (ver cabeçalho).
  update public.payment p
     set status = 'failed'
   where p.kind = 'booking'
     and p.method = 'card'
     and p.status = 'pending'
     and p.provider_payment_id is null
     and p.expires_at is not null
     and p.expires_at < now();

  for v_id in
    select b.id
    from public.booking b
    where b.status = 'pending'
      and b.expires_at is not null
      and b.expires_at < now() - make_interval(mins => v_grace)
      and b.deleted_at is null
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
end; $function$;
