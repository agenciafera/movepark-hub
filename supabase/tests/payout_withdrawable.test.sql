-- pgTAP: saque controlado (E0.3.8, 16/09/2026). O disponível para saque é nosso: vendas liberadas
-- pelo prazo (global, sobrescrito por empresa) menos dívida e saques, limitado ao saldo real.
-- Transação com rollback.

begin;
select plan(12);

select is((select value from public.app_setting where key = 'payout_release_days'), '30', 'prazo global nasce em 30 dias');
select has_column('public', 'company', 'payout_release_days', 'company.payout_release_days existe');

do $$
declare
  adm uuid := gen_random_uuid(); cust uuid := gen_random_uuid();
  cid uuid := gen_random_uuid(); loc uuid := gen_random_uuid();
  b1 uuid := gen_random_uuid(); b2 uuid := gen_random_uuid(); b3 uuid := gen_random_uuid();
  split_novo jsonb := '[{"role":"partner","recipientId":"re_wd_p","amount":8000,"type":"flat","liable":false,"chargeProcessingFee":true,"chargeRemainderFee":true},
                        {"role":"movepark","recipientId":"re_wd_mp","amount":2000,"type":"flat","liable":true,"chargeProcessingFee":false,"chargeRemainderFee":false}]'::jsonb;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (adm,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','wd-adm@ex.com',now(),now()),
           (cust,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','wd-cust@ex.com',now(),now());
  insert into public.profiles(id, role) values (adm,'hub_admin') on conflict (id) do update set role='hub_admin';
  insert into public.profiles(id, role) values (cust,'customer') on conflict (id) do nothing;
  insert into public.company(id, name, slug) values (cid, 'Saque Empresa', 'saque-empresa');
  insert into public.location(id, company_id, name, slug) values (loc, cid, 'Saque Loc', 'saque-loc');
  insert into public.payout_recipient(company_id, provider, external_recipient_id, status, balance_available_cents, balance_waiting_cents, balance_synced_at)
    values (cid, 'pagarme', 're_wd_p', 'active', 20000, 0, now());
  -- 1: paga há 40 dias, liberada pelo gateway → libera com prazo 30
  insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount)
    values (b1,'MP-WD-1',cust,loc,now() - interval '39 days',now() - interval '38 days','completed',100);
  insert into public.payment(booking_id, provider, method, kind, amount, status, paid_at, split_sent_to_gateway, split, gateway_fee_cents, partner_release_at)
    values (b1,'pagarme','pix','booking',100,'paid',now() - interval '40 days', true, split_novo, 100, now() - interval '40 days');
  -- 2: paga há 5 dias → retida com prazo 30
  insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount)
    values (b2,'MP-WD-2',cust,loc,now() + interval '5 days',now() + interval '6 days','confirmed',100);
  insert into public.payment(booking_id, provider, method, kind, amount, status, paid_at, split_sent_to_gateway, split, gateway_fee_cents, partner_release_at)
    values (b2,'pagarme','pix','booking',100,'paid',now() - interval '5 days', true, split_novo, 100, now() - interval '5 days');
  -- 3: estornada, Movepark absorveu → dívida de 8000
  insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount)
    values (b3,'MP-WD-3',cust,loc,now() - interval '50 days',now() - interval '49 days','cancelled',100);
  insert into public.payment(booking_id, provider, method, kind, amount, status, paid_at, refunded_at, refunded_amount, split_sent_to_gateway, refund_absorbed_by_master, split, gateway_fee_cents, partner_release_at)
    values (b3,'pagarme','pix','booking',100,'refunded',now() - interval '60 days', now() - interval '55 days', 100, true, true, split_novo, 100, now() - interval '60 days');
  -- saque anterior de 1000 + taxa 367
  insert into public.payout_withdrawal(company_id, provider, external_transfer_id, external_recipient_id, amount_cents, fee_cents, status, paid_at)
    values (cid, 'pagarme', 'tr_wd_1', 're_wd_p', 1000, 367, 'paid', now() - interval '10 days');
  perform set_config('test.adm', adm::text, false);
  perform set_config('test.cust', cust::text, false);
  perform set_config('test.cid', cid::text, false);
end $$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.cust'), 'role', 'authenticated')::text, true);
select throws_ok(format('select public.payout_withdrawable(%L::uuid)', current_setting('test.cid')), '42501', null, 'cliente sem vínculo não lê');
select throws_ok(format('select public.company_set_payout_release_days(%L::uuid, 7)', current_setting('test.cid')), 'P0001', null, 'cliente não muda o prazo');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.adm'), 'role', 'authenticated')::text, true);
select is(public.payout_release_days(current_setting('test.cid')::uuid), 30, 'sem override, vale o global');
-- liberadas: venda 1 (7900) + venda 3 (7900, o dinheiro ficou com ele); retida: venda 2 (7900)
select is((public.payout_withdrawable(current_setting('test.cid')::uuid) ->> 'released_cents')::int, 15800, 'liberado = vendas fora do prazo, líquidas');
select is((public.payout_withdrawable(current_setting('test.cid')::uuid) ->> 'retained_cents')::int, 7900, 'retido = venda dentro do prazo');
select is((public.payout_withdrawable(current_setting('test.cid')::uuid) ->> 'debt_cents')::int, 8000, 'dívida do estorno absorvido');
-- disponível = 15800 − 8000 − 1367 = 6433, e o gateway (20000) cobre
select is((public.payout_withdrawable(current_setting('test.cid')::uuid) ->> 'available_cents')::int, 6433, 'disponível = liberado − dívida − saques');
-- override por empresa: prazo 3 dias libera a venda 2 também
select lives_ok(format('select public.company_set_payout_release_days(%L::uuid, 3)', current_setting('test.cid')), 'hub_admin muda o prazo da empresa');
select is((public.payout_withdrawable(current_setting('test.cid')::uuid) ->> 'available_cents')::int, 14333, 'com prazo 3, a venda de 5 dias entra: 23700 − 8000 − 1367');
reset role;

-- teto físico: se o gateway tem menos, vale o gateway
update public.payout_recipient set balance_available_cents = 5000 where company_id = current_setting('test.cid')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.adm'), 'role', 'authenticated')::text, true);
select is((public.payout_withdrawable(current_setting('test.cid')::uuid) ->> 'available_cents')::int, 5000, 'nunca passa do disponível real na Pagar.me');
reset role;

select * from finish();
rollback;
