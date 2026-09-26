-- Fecha os helpers do repasse automático (E0.3.13) para o papel `authenticated`: eram definer sem
-- checagem de chamador, e qualquer usuário logado podia ler o dia, o liga/desliga e o crédito de
-- taxa de QUALQUER empresa por RPC. Quem precisa deles é o banco (payout_auto_forecast,
-- payout_withdrawable, payout_auto_due, todos definer e com a própria checagem) e a Edge
-- (service_role). `payout_debt_cents` tem o mesmo grant desde 20261118090000 e fica como está:
-- o pgTAP `payout_debt.test.sql` o chama como hub_admin, e mudar isso é outra entrega.
revoke all on function public.payout_auto_day(uuid) from public, anon, authenticated;
revoke all on function public.payout_auto_enabled(uuid) from public, anon, authenticated;
revoke all on function public.payout_auto_min_cents() from public, anon, authenticated;
revoke all on function public.payout_next_auto_at(uuid, date) from public, anon, authenticated;
revoke all on function public.payout_fee_credit_cents(uuid, text) from public, anon, authenticated;
grant execute on function public.payout_auto_day(uuid), public.payout_auto_enabled(uuid),
  public.payout_auto_min_cents(), public.payout_next_auto_at(uuid, date),
  public.payout_fee_credit_cents(uuid, text) to service_role;
