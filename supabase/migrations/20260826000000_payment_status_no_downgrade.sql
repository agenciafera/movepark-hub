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
-- Ciclo de vida (rank): pending(1) < authorized/failed(2) < paid(3) < cancelled/refunded(4).
-- Uma transição só é aplicada se avança ou mantém o rank. Isso preserva paid->refunded e
-- paid->cancelled (estorno/cancelamento legítimos) e bloqueia paid->pending (a corrida).

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
  v_rank_cur int;
  v_rank_new int;
begin
  -- Trava a linha: handlers concorrentes do mesmo payment esperam aqui, um de cada vez.
  select status into v_current from public.payment where id = p_payment_id for update;
  if not found then
    return query select false, null::public.payment_status;
    return;
  end if;

  v_rank_cur := case v_current
    when 'pending' then 1 when 'authorized' then 2 when 'failed' then 2
    when 'paid' then 3 when 'cancelled' then 4 when 'refunded' then 4 end;
  v_rank_new := case p_new_status
    when 'pending' then 1 when 'authorized' then 2 when 'failed' then 2
    when 'paid' then 3 when 'cancelled' then 4 when 'refunded' then 4 end;

  -- Nunca rebaixa: transição que anda pra trás no ciclo de vida é ignorada (não é erro; é a
  -- corrida chegando fora de ordem).
  if v_rank_new < v_rank_cur then
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

-- Só o service_role (a Edge do webhook) chama. Não exposto a anon/authenticated.
revoke all on function public.apply_payment_webhook_status(uuid, public.payment_status, boolean) from public;
grant execute on function public.apply_payment_webhook_status(uuid, public.payment_status, boolean) to service_role;
