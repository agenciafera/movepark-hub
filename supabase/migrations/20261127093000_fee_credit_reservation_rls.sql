-- Reserva do crédito da taxa (E0.3.13) protegida como a reserva de dívida: hub_admin lê, ninguém
-- mais escreve por RLS (toda escrita passa pela RPC service_role). Sem esta policy a tabela cai no
-- inventário fail-closed (`rls_inventory.test.sql`), que é lista exata e reprovou o job db.
revoke all on public.payout_fee_credit_reservation from anon, authenticated;
grant select on public.payout_fee_credit_reservation to authenticated;
drop policy if exists payout_fee_credit_reservation_admin_read on public.payout_fee_credit_reservation;
create policy payout_fee_credit_reservation_admin_read on public.payout_fee_credit_reservation
  for select to authenticated using (public.is_hub_admin());
