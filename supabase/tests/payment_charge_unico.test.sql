-- pgTAP: uma cobrança do gateway vira no máximo um pagamento (27/11/2026).
-- O webhook da Pagar.me recebe o mesmo aviso mais de uma vez e liga a cobrança atrasada ao pagamento
-- que ficou sem ids (MP-F00991): a mesma cobrança não pode acabar em duas linhas. Rollback no fim.

begin;
select plan(4);

select has_index('public', 'payment', 'payment_provider_charge_unico', 'índice da cobrança existe');
select index_is_unique('public', 'payment', 'payment_provider_charge_unico', 'e é único');

-- Duas linhas com a mesma cobrança: a segunda é recusada. O seed não tem reserva, então a FK de
-- booking fica desligada só nesta transação (FK é gatilho; o índice único continua valendo).
set local session_replication_role = replica;
select lives_ok(
  $$ insert into public.payment (booking_id, provider, provider_charge_id, amount, status)
     values ('00000000-0000-0000-0000-0000000c0de1', 'pagarme', 'ch_teste_unico', 10, 'pending') $$,
  'primeira linha da cobrança entra');
select throws_ok(
  $$ insert into public.payment (booking_id, provider, provider_charge_id, amount, status)
     values ('00000000-0000-0000-0000-0000000c0de1', 'pagarme', 'ch_teste_unico', 10, 'pending') $$,
  '23505', null, 'a mesma cobrança não vira segundo pagamento');

select * from finish();
rollback;
