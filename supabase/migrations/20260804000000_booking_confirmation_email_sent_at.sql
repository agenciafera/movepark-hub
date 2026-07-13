-- Guarda de exatamente-uma-vez para o e-mail de confirmação de reserva.
-- O envio acontece no ponto de confirmação de pagamento (pagarme-webhook / mock-payment),
-- que pode ser reentrante (webhooks duplicados: order.paid + charge.paid, reentregas). Sem
-- guarda, o cliente receberia e-mails repetidos. O helper `sendBookingConfirmationEmail`
-- "reivindica" a reserva com um UPDATE condicional (SET ... WHERE confirmation_email_sent_at
-- IS NULL) e só envia quem ganhar a corrida; em falha de envio, limpa o campo para retry.
alter table public.booking
  add column if not exists confirmation_email_sent_at timestamptz;

comment on column public.booking.confirmation_email_sent_at is
  'Quando o e-mail de confirmação foi enviado (guarda de idempotência do envio). NULL = ainda não enviado.';
