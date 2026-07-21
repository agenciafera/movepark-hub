-- Corrida entre eventos do webhook do Pagar.me (86ajmwb4u).
--
-- O Pagar.me entrega charge.pending, charge.paid e charge.created quase ao mesmo tempo, e a Edge
-- os processa em paralelo. A escrita de status era read-then-write sem trava: o handler do
-- charge.pending lia 'pending' (antes do charge.paid gravar 'paid') e no fim sobrescrevia o 'paid'
-- de volta pra 'pending'. Perda de atualização clássica, medida em 25% dos pagamentos.
--
-- A guarda em memória (decidePaymentStatus) reduz a janela mas não a fecha, porque o problema é
-- concorrência. A correção precisa ser atômica no banco: trava de linha (FOR UPDATE) serializa os
-- handlers do mesmo payment, e uma regra de precedência impede qualquer transição que REBAIXE um
-- pagamento já terminal.
--
-- Regra: um pagamento já terminal não é rebaixado. A ÚNICA saída legítima de 'paid' é 'refunded'
-- (o estorno). 'cancelled' e 'refunded' são terminais definitivos. Um 'paid' que nasce de 'pending'
-- ou 'authorized' é avanço normal e passa. Isso preserva paid->refunded e bloqueia paid->pending
-- (a corrida) e paid->cancelled (um pagamento liquidado não vira cancelado; se precisar reverter,
-- é estorno). Espelha a guarda sequencial de decidePaymentStatus (logic.ts).

create or replace function public.apply_payment_webhook_status(
  p_payment_id uuid,
  p_new_status public.payment_status,
  p_set_paid_at boolean default false
)
returns table (applied boolean, effective_status public.payment_status)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.payment_status;
begin
  -- Trava a linha: handlers concorrentes do mesmo payment esperam aqui, um de cada vez.
  select status into v_current from public.payment where id = p_payment_id for update;
  if not found then
    return query select false, null::public.payment_status;
    return;
  end if;

  -- Bloqueia rebaixamento de status terminal (não é erro; é a corrida chegando fora de ordem).
  if v_current in ('paid', 'refunded', 'cancelled')
     and not (
       v_current = p_new_status                                  -- idempotente
       or (v_current = 'paid' and p_new_status = 'refunded')     -- única saída de 'paid'
     ) then
    return query select false, v_current;
    return;
  end if;

  update public.payment
     set status = p_new_status,
         -- Preserva o primeiro paid_at (reconciliação por período, E0.3.3); só grava se ainda nulo.
         paid_at = case when p_set_paid_at then coalesce(paid_at, now()) else paid_at end
   where id = p_payment_id;

  return query select true, p_new_status;
end;
$$;

comment on function public.apply_payment_webhook_status(uuid, public.payment_status, boolean) is
  'Aplica transição de status do payment de forma atômica (FOR UPDATE) e monotônica: nunca rebaixa '
  'um pagamento terminal. Fecha a corrida entre eventos do webhook do Pagar.me (86ajmwb4u).';

-- Só o service_role (a Edge do webhook) chama. O Supabase concede EXECUTE a anon/authenticated por
-- default privilege em toda função nova do schema public; um `revoke from public` não tira essas
-- concessões explícitas, então precisa revogar de anon e authenticated nominalmente. Sem isto, uma
-- função SECURITY DEFINER que escreve status de pagamento ficaria chamável por anon.
revoke all on function public.apply_payment_webhook_status(uuid, public.payment_status, boolean) from public, anon, authenticated;
grant execute on function public.apply_payment_webhook_status(uuid, public.payment_status, boolean) to service_role;
