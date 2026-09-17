-- E-mail de dívida (17/09/2026). Spec: docs/specs/split-dinamico-e-divida-do-parceiro.md.
--
-- Quando a Movepark paga o estorno do master porque o recebedor do parceiro não cobria, a parte
-- dele vira dívida e abate nas próximas vendas. O parceiro recebe um e-mail dizendo isso, uma
-- vez por cobrança. A unicidade vem desta coluna, reivindicada por UPDATE condicional antes do
-- envio; quem manda é a varredura do cron (reconcile-payout-transfers) e o cancel-booking.

alter table public.payment
  add column if not exists debt_email_sent_at timestamptz;
comment on column public.payment.debt_email_sent_at is
  'Quando o parceiro foi avisado de que o estorno desta cobrança virou dívida dele (um e-mail por cobrança).';

create index if not exists payment_debt_email_pending_idx
  on public.payment (refunded_at)
  where refund_absorbed_by_master is true and debt_email_sent_at is null;
