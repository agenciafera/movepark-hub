-- pgTAP: conta do parceiro (E0.3.7, 16/09/2026). O extrato traz venda com líquido e data de
-- liberação, estorno dizendo quem pagou, dívida, acerto, saque; só hub_admin ou membro com
-- finance:read lê. Transação com rollback.

begin;
select plan(12);

select has_column('public', 'payment', 'partner_release_at', 'payment.partner_release_at existe');

do $$
declare
  adm uuid := gen_random_uuid(); cust uuid := gen_random_uuid();
  cid uuid := gen_random_uuid(); loc uuid := gen_random_uuid();
  b1 uuid := gen_random_uuid(); b2 uuid := gen_random_uuid(); b3 uuid := gen_random_uuid();
  split_novo jsonb := '[{"role":"partner","recipientId":"re_pa_p","amount":8000,"type":"flat","liable":false,"chargeProcessingFee":true,"chargeRemainderFee":true},
                        {"role":"movepark","recipientId":"re_pa_mp","amount":2000,"type":"flat","liable":true,"chargeProcessingFee":false,"chargeRemainderFee":false}]'::jsonb;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (adm,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','pa-adm@ex.com',now(),now()),
           (cust,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','pa-cust@ex.com',now(),now());
  insert into public.profiles(id, role) values (adm,'hub_admin') on conflict (id) do update set role='hub_admin';
  insert into public.profiles(id, role) values (cust,'customer') on conflict (id) do nothing;
  insert into public.company(id, name, slug) values (cid, 'Conta Empresa', 'conta-empresa');
  insert into public.location(id, company_id, name, slug) values (loc, cid, 'Conta Loc', 'conta-loc');
  insert into public.payout_recipient(company_id, provider, external_recipient_id, status, balance_available_cents, balance_waiting_cents, balance_synced_at, transfer_interval, transfer_day)
    values (cid, 'pagarme', 're_pa_p', 'active', 12849, 0, now(), 'Monthly', 10);
  -- 1: venda paga, liberada (PIX)
  insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount)
    values (b1,'MP-PA-1',cust,loc,'2026-12-10T12:00:00Z','2026-12-12T12:00:00Z','confirmed',100);
  insert into public.payment(booking_id, provider, method, kind, amount, status, paid_at, split_sent_to_gateway, split, gateway_fee_cents, partner_release_at)
    values (b1,'pagarme','pix','booking',100,'paid','2026-08-01T13:00:00Z', true, split_novo, 100, '2026-08-01T13:00:00Z');
  -- 2: venda estornada, Movepark absorveu (dívida)
  insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount)
    values (b2,'MP-PA-2',cust,loc,'2026-12-13T12:00:00Z','2026-12-14T12:00:00Z','cancelled',100);
  insert into public.payment(booking_id, provider, method, kind, amount, status, paid_at, refunded_at, refunded_amount, refund_reason, split_sent_to_gateway, refund_absorbed_by_master, split, gateway_fee_cents, partner_release_at)
    values (b2,'pagarme','pix','booking',100,'refunded','2026-08-02T13:00:00Z','2026-08-03T10:00:00Z',100,'cancelamento (staff)', true, true, split_novo, 100, '2026-08-02T13:00:00Z');
  -- 3: venda estornada, gateway debitou o parceiro (híbrido)
  insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount)
    values (b3,'MP-PA-3',cust,loc,'2026-12-15T12:00:00Z','2026-12-16T12:00:00Z','cancelled',100);
  insert into public.payment(booking_id, provider, method, kind, amount, status, paid_at, refunded_at, refunded_amount, refund_reason, split_sent_to_gateway, refund_absorbed_by_master, refund_partner_cents, split, gateway_fee_cents, partner_release_at)
    values (b3,'pagarme','pix','booking',100,'refunded','2026-08-04T13:00:00Z','2026-08-05T10:00:00Z',100,'cancelamento (staff)', true, false, 7900, split_novo, 100, '2026-08-04T13:00:00Z');
  -- acerto e saque
  insert into public.payout_debt_settlement(company_id, amount_cents, kind, note, created_at) values (cid, 3000, 'manual_payment', 'pix do dono', '2026-08-07T10:00:00Z');
  insert into public.payout_withdrawal(company_id, provider, external_transfer_id, external_recipient_id, amount_cents, fee_cents, status, paid_at)
    values (cid, 'pagarme', 'tr_pa_1', 're_pa_p', 5000, 367, 'paid', '2026-08-06T10:00:00Z');
  perform set_config('test.adm', adm::text, false);
  perform set_config('test.cust', cust::text, false);
  perform set_config('test.cid', cid::text, false);
end $$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.cust'), 'role', 'authenticated')::text, true);
select throws_ok(
  format('select public.partner_account_statement(%L::uuid, %L, %L)', current_setting('test.cid'), '2026-08-01T00:00:00Z', '2026-12-01T00:00:00Z'),
  '42501', 'Sem permissão para este extrato.', 'cliente sem vínculo não lê a conta');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.adm'), 'role', 'authenticated')::text, true);
create temporary table _st as
  select public.partner_account_statement(current_setting('test.cid')::uuid, '2026-08-01T00:00:00Z', '2026-12-01T00:00:00Z') as j;

select is((select (j -> 'header' ->> 'available_cents')::int from _st), 12849, 'cabeçalho traz o saldo disponível do gateway');
select is((select j -> 'header' ->> 'transfer_interval' from _st), 'Monthly', 'cabeçalho traz o ciclo de transferência');
select is((select (j -> 'header' ->> 'debt_cents')::int from _st), 5000, 'dívida = 8000 absorvidos menos 3000 de acerto');
select is((select jsonb_array_length(j -> 'movements') from _st), 7, 'sete movimentos: 3 vendas, 1 dívida, 1 estorno, 1 acerto, 1 saque');

select is(
  (select (m ->> 'net_cents')::int from _st, jsonb_array_elements(j -> 'movements') m where m ->> 'kind' = 'sale' and m ->> 'booking_code' = 'MP-PA-1'),
  7900, 'venda: líquido = parte do parceiro menos a taxa que ele paga');
select is(
  (select m ->> 'release_status' from _st, jsonb_array_elements(j -> 'movements') m where m ->> 'kind' = 'sale' and m ->> 'booking_code' = 'MP-PA-1'),
  'released', 'venda PIX já liberada');
select is(
  (select (m ->> 'debt_delta_cents')::int from _st, jsonb_array_elements(j -> 'movements') m where m ->> 'kind' = 'debt'),
  8000, 'estorno absorvido pela Movepark vira dívida de 8000 e não mexe no saldo');
select is(
  (select (m ->> 'net_cents')::int from _st, jsonb_array_elements(j -> 'movements') m where m ->> 'kind' = 'refund'),
  -7900, 'estorno híbrido debita 7900 do saldo do parceiro');
select is(
  (select (m ->> 'net_cents')::int from _st, jsonb_array_elements(j -> 'movements') m where m ->> 'kind' = 'withdrawal'),
  -5367, 'saque sai do saldo com a taxa de saque');
select is(
  (select (m ->> 'debt_delta_cents')::int from _st, jsonb_array_elements(j -> 'movements') m where m ->> 'kind' = 'settlement'),
  -3000, 'acerto manual reduz a dívida');
reset role;

select * from finish();
rollback;
