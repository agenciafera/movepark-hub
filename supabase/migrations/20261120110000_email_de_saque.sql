-- E-mail de saque (E0.3.10, 17/09/2026). Spec: docs/specs/conta-do-parceiro.md.
--
-- O parceiro recebe um e-mail quando pede o saque (em processamento, com a previsão de queda) e
-- outro quando o gateway confirma que caiu ou que falhou. A unicidade vem destas colunas,
-- reivindicadas por UPDATE condicional antes do envio: a Edge do saque, a conciliação (cron) e o
-- webhook podem todos tentar, e sai um e-mail só de cada.

alter table public.payout_withdrawal
  add column if not exists requested_email_sent_at timestamptz,
  add column if not exists settled_email_sent_at timestamptz;
comment on column public.payout_withdrawal.requested_email_sent_at is
  'Quando o parceiro foi avisado de que o saque está em processamento (um e-mail por saque).';
comment on column public.payout_withdrawal.settled_email_sent_at is
  'Quando o parceiro foi avisado do desfecho (caiu na conta, falhou ou cancelado).';

create index if not exists payout_withdrawal_email_pending_idx
  on public.payout_withdrawal (created_at)
  where deleted_at is null
    and (requested_email_sent_at is null
         or (status in ('paid', 'failed', 'canceled') and settled_email_sent_at is null));
