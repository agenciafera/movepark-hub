-- E-mail de cancelamento ao cliente (17/09/2026). Spec: docs/specs/booking-flow.md.
--
-- Até aqui o cliente só recebia e-mail na confirmação. Cancelamento e estorno passavam em
-- silêncio (medido pelo Kallef nos testes de 17/09). A coluna é a guarda de exatamente-uma-vez,
-- igual à da confirmação: reivindicada por UPDATE condicional antes do envio, limpa se o envio falhar.

alter table public.booking
  add column if not exists cancellation_email_sent_at timestamptz;
comment on column public.booking.cancellation_email_sent_at is
  'Quando o cliente foi avisado do cancelamento (e do estorno, quando houve). Um e-mail por reserva.';
