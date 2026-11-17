-- Reembolso manual parcial (17/11/2026).
--
-- A fila manual (`payout_refund_manual`) nasceu para o cancelamento, em que a devolução é sempre a
-- cobrança inteira. Marcar a linha como paga punha o pagamento em `refunded` com o valor cheio.
-- Com a troca de datas mais barata, a fila passa a receber devoluções PARCIAIS (só as diárias): se a
-- regra antiga continuasse, a reserva apareceria toda estornada e o estacionamento perderia a venda
-- no extrato. Agora soma o que a linha devolveu e só vira `refunded` quando chega no total.
-- Linhas antigas (valor cheio, `refunded_amount` vazio) dão o mesmo resultado de antes.

create or replace function public.payout_refund_manual_mark_paid(p_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.payout_refund_manual%rowtype;
begin
  if not public.is_hub_admin() then
    raise exception 'Só a Movepark marca reembolso manual.' using errcode = '42501';
  end if;
  select * into v_row from public.payout_refund_manual where id = p_id for update;
  if v_row.id is null then
    raise exception 'Reembolso manual não encontrado.' using errcode = 'P0002';
  end if;
  if v_row.status <> 'pending' then
    return; -- idempotente
  end if;
  update public.payout_refund_manual
     set status = 'paid', paid_by = auth.uid(), paid_at = now(),
         note = coalesce(nullif(trim(p_note), ''), note)
   where id = p_id;
  update public.payment p
     set refunded_amount = least(p.amount, coalesce(p.refunded_amount, 0) + v_row.amount_cents / 100.0),
         status = case when coalesce(p.refunded_amount, 0) + v_row.amount_cents / 100.0 >= p.amount
                       then 'refunded'::public.payment_status else p.status end,
         refunded_at = now(),
         refund_reason = coalesce(nullif(trim(p.refund_reason), ''), 'reembolso manual')
   where p.id = v_row.payment_id and p.status = 'paid';
end;
$$;
