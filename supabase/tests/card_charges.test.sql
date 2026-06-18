-- pgTAP: E0.1.3 — cartão. Coluna de parcelas no payment, seed da política de parcelamento (JSON
-- válido) e RLS do app_setting (consumidor NÃO lê a política → precisa da Edge get-payment-config).
-- Transação com rollback.

begin;
select plan(6);

select has_column('public', 'payment', 'installments', 'payment.installments existe');

-- seed da política presente e como JSON válido
select isnt(
  (select value from public.app_setting where key = 'card_installment_policy'),
  null, 'política de parcelamento semeada');

select is(
  (select (value::jsonb ->> 'maxInstallments')::int from public.app_setting where key = 'card_installment_policy'),
  12, 'política: maxInstallments default = 12');

select is(
  (select (value::jsonb ->> 'enabled')::boolean from public.app_setting where key = 'card_installment_policy'),
  true, 'política: habilitada por default');

-- RLS: consumidor (anon/authenticated) NÃO lê a política (só hub_admin / service_role)
set local role anon;
select is_empty(
  $$ select 1 from public.app_setting where key = 'card_installment_policy' $$,
  'anon NÃO lê card_installment_policy');
reset role;

set local role authenticated;
select is_empty(
  $$ select 1 from public.app_setting where key = 'card_installment_policy' $$,
  'authenticated (sem hub_admin) NÃO lê card_installment_policy');
reset role;

select * from finish();
rollback;
