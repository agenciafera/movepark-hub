-- pgTAP: E0.1.2 — schema de cobrança PIX. Colunas no payment, seed do recebedor master e
-- idempotência de webhook (RLS bloqueia leitura por authenticated/anon). Transação com rollback.

begin;
select plan(8);

select has_column('public', 'payment', 'method', 'payment.method existe');
select has_column('public', 'payment', 'pix_qr_code', 'payment.pix_qr_code existe');
select has_column('public', 'payment', 'pix_qr_code_url', 'payment.pix_qr_code_url existe');
select has_column('public', 'payment', 'expires_at', 'payment.expires_at existe');
select has_column('public', 'payment', 'split', 'payment.split existe');

select is(
  (select value from public.app_setting where key = 'pagarme_movepark_recipient_id'),
  '',
  'seed do recebedor master da Movepark (vazio)');

-- idempotência: linha semeada como postgres não é visível por authenticated (RLS sem policy)
insert into public.payment_webhook_event (id, type) values ('evt_test_1', 'order.paid');

set local role authenticated;
select is_empty(
  $$ select 1 from public.payment_webhook_event $$,
  'authenticated NÃO lê payment_webhook_event (só service_role)');
reset role;

set local role anon;
select is_empty(
  $$ select 1 from public.payment_webhook_event $$,
  'anon NÃO lê payment_webhook_event');
reset role;

select * from finish();
rollback;
