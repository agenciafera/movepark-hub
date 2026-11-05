-- purchase do GA4 pelo servidor (Measurement Protocol), docs/specs/analytics-ecommerce.md §3.
--
-- O navegador só dispara o `purchase` quando a página do checkout vê a reserva confirmada. Quem
-- gera o PIX, fecha a aba e paga depois nunca volta, e a venda some do GA4. O webhook de
-- pagamento passa a mandar o mesmo evento pelo Measurement Protocol, e para o GA4 juntar esse
-- hit à sessão de quem comprou ele precisa do `client_id` (cookie `_ga`) e do `session_id`
-- (cookie `_ga_<stream>`) capturados no navegador na hora da reserva. O `create-booking` grava
-- os dois aqui; sem eles o servidor manda com o id do usuário e a sessão não casa.
--
-- `ga_purchase_sent_at` é a guarda de exatamente-uma-vez do envio (mesmo desenho de
-- `confirmation_email_sent_at`): o webhook pode chegar mais de uma vez para a mesma reserva.

alter table public.booking
  add column if not exists ga_client_id text,
  add column if not exists ga_session_id text,
  add column if not exists ga_purchase_sent_at timestamptz;

alter table public.booking
  add constraint booking_ga_client_id_len check (ga_client_id is null or length(ga_client_id) <= 64),
  add constraint booking_ga_session_id_len check (ga_session_id is null or length(ga_session_id) <= 32);

comment on column public.booking.ga_client_id is
  'client_id do GA4 (cookie _ga, sem o prefixo GA1.1) capturado na criação da reserva; o purchase servidor usa para casar com a sessão do navegador.';
comment on column public.booking.ga_session_id is
  'session_id do GA4 (cookie _ga_<stream>) capturado na criação da reserva.';
comment on column public.booking.ga_purchase_sent_at is
  'Quando o purchase foi enviado ao GA4 pelo Measurement Protocol (guarda de exatamente-uma-vez; nulo = nunca).';
