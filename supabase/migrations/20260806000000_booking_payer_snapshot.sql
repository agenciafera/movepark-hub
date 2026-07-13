-- Snapshot do pagador no booking + separação titular/passageiro.
--
-- Decisão de produto: o TITULAR (a conta logada) é sempre o pagador. Todo o pagamento (PIX, cartão,
-- fare-upgrade) e a nota leem do snapshot do booking, nunca do auth.users/profiles. Por isso o booking
-- passa a carregar também o documento do pagador (customer_tax_id). "Reserva para outra pessoa" não
-- mistura mais o passageiro no customer_*: o passageiro (quem usa a vaga) tem colunas próprias, usadas
-- só no voucher/aviso.
--
-- customer_first_name/last_name/phone/email/tax_id = TITULAR (pagador). Pagamento + nota.
-- passenger_first_name/last_name/phone            = quem usa a vaga (opcional). Voucher/notificação.
-- (O trigger booking_reconcile_customer_name de first/last <-> customer_name continua valendo.)

alter table public.booking
  add column if not exists customer_tax_id      text,
  add column if not exists passenger_first_name text,
  add column if not exists passenger_last_name  text,
  add column if not exists passenger_phone      text;

comment on column public.booking.customer_tax_id is
  'CPF/CNPJ do pagador (titular), coletado no passo de pagamento. Fonte do documento pra PIX/cartão/nota.';
comment on column public.booking.passenger_first_name is
  'Nome de quem vai usar a vaga (reserva para outra pessoa). Voucher/aviso; NÃO é o pagador.';
comment on column public.booking.passenger_last_name is
  'Sobrenome de quem vai usar a vaga (reserva para outra pessoa).';
comment on column public.booking.passenger_phone is
  'Telefone de quem vai usar a vaga (reserva para outra pessoa). Aviso operacional.';
