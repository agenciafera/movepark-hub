-- E0.3.3 · Permite o kind 'update' em payout_recipient_event.
-- A Edge update-recipient-payout registra a aplicação da cadência/antecipação no gateway com
-- kind='update', mas o CHECK original só aceitava create|refresh|webhook — o insert falhava em
-- silêncio (o erro não era capturado), então a aplicação no Pagar.me acontecia mas sem trilha de
-- auditoria. Adiciona 'update' ao conjunto permitido.

alter table public.payout_recipient_event
  drop constraint if exists payout_recipient_event_kind_check;

alter table public.payout_recipient_event
  add constraint payout_recipient_event_kind_check
  check (kind = any (array['create', 'refresh', 'webhook', 'update']));
