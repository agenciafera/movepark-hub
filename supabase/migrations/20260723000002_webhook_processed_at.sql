-- Idempotência resiliente do webhook do Pagar.me (bug de estorno não refletir).
-- Antes: um evento cujo processamento falhou (crash/timeout) já estava gravado em
-- payment_webhook_event, então a reentrega da Pagar.me batia no 23505 e era ENGOLIDA — a falha
-- ficava permanente. Com `processed_at`, a reentrega só é pulada se a tentativa anterior COMPLETOU;
-- caso contrário, reprocessa (todas as ações do handler são idempotentes).
alter table public.payment_webhook_event
  add column if not exists processed_at timestamptz;

comment on column public.payment_webhook_event.processed_at is
  'Quando o evento foi processado com sucesso. Nulo = tentativa anterior não completou → reprocessar na reentrega.';

-- Backfill: eventos já existentes são considerados processados (não reprocessar histórico).
update public.payment_webhook_event set processed_at = received_at where processed_at is null;
