-- pgTAP: estorno híbrido (E0.3.6, 16/09/2026). Colunas novas, chave nasce desligada, o extrato
-- diz quem pagou cada estorno e a dívida ignora o estorno que o gateway debitou do parceiro.
-- Transação com rollback.

begin;
select plan(9);

select has_column('public', 'payment', 'refund_split', 'payment.refund_split existe');
select has_column('public', 'payment', 'refund_partner_cents', 'payment.refund_partner_cents existe');
select has_column('public', 'payment', 'refund_partner_balance_cents', 'payment.refund_partner_balance_cents existe');
select is((select value from public.app_setting where key = 'pagarme_refund_hybrid_enabled'), 'false',
  'a chave do estorno híbrido nasce desligada');

do $$
declare
  adm uuid := gen_random_uuid(); cust uuid := gen_random_uuid();
  cid uuid := gen_random_uuid(); loc uuid := gen_random_uuid(); bk1 uuid := gen_random_uuid(); bk2 uuid := gen_random_uuid();
  split_novo jsonb := '[{"role":"partner","recipientId":"re_hib_p","amount":8000,"type":"flat","liable":false,"chargeProcessingFee":true,"chargeRemainderFee":true},
                        {"role":"movepark","recipientId":"re_hib_mp","amount":2000,"type":"flat","liable":true,"chargeProcessingFee":false,"chargeRemainderFee":false}]'::jsonb;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (adm,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','hib-adm@ex.com',now(),now()),
           (cust,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','hib-cust@ex.com',now(),now());
  insert into public.profiles(id, role) values (adm,'hub_admin') on conflict (id) do update set role='hub_admin';
  insert into public.profiles(id, role) values (cust,'customer') on conflict (id) do nothing;
  insert into public.company(id, name, slug) values (cid, 'Hib Empresa', 'hib-empresa');
  insert into public.location(id, company_id, name, slug) values (loc, cid, 'Hib Loc', 'hib-loc');
  -- Venda A: gateway debitou o parceiro (híbrido). Não é dívida.
  insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount)
    values (bk1,'MP-HIB-A',cust,loc,'2026-12-10T12:00:00Z','2026-12-12T12:00:00Z','cancelled',100);
  insert into public.payment(booking_id, provider, method, kind, amount, status, paid_at, refunded_at, refunded_amount, refund_reason, split_sent_to_gateway, refund_absorbed_by_master, refund_partner_cents, refund_partner_balance_cents, split, gateway_fee_cents)
    values (bk1,'pagarme','pix','booking',100,'refunded','2026-11-01T13:00:00Z','2026-11-02T10:00:00Z',100,'cancelamento (staff)', true, false, 7900, 50000, split_novo, 100);
  -- Venda B: Movepark absorveu (fallback). É dívida.
  insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount)
    values (bk2,'MP-HIB-B',cust,loc,'2026-12-13T12:00:00Z','2026-12-14T12:00:00Z','cancelled',100);
  insert into public.payment(booking_id, provider, method, kind, amount, status, paid_at, refunded_at, refunded_amount, refund_reason, split_sent_to_gateway, refund_absorbed_by_master, refund_partner_cents, split, gateway_fee_cents)
    values (bk2,'pagarme','pix','booking',100,'refunded','2026-11-03T13:00:00Z','2026-11-04T10:00:00Z',100,'cancelamento (staff)', true, true, 0, split_novo, 100);
  perform set_config('test.adm', adm::text, false);
  perform set_config('test.cid', cid::text, false);
end $$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.adm'), 'role', 'authenticated')::text, true);

select is(public.payout_debt_cents(current_setting('test.cid')::uuid), 7900::bigint,
  'só o estorno absorvido pela Movepark vira dívida, líquida da taxa que o parceiro pagou (8000 - 100)');

select is(
  ((public.payout_statement('2026-11-01T00:00:00Z','2026-12-01T00:00:00Z', current_setting('test.cid')::uuid, true) -> 'companies' -> 0) ->> 'refunded_by_partner_cents')::int,
  7900, 'o extrato soma o que o gateway debitou do parceiro');
select is(
  ((public.payout_statement('2026-11-01T00:00:00Z','2026-12-01T00:00:00Z', current_setting('test.cid')::uuid, true) -> 'companies' -> 0) ->> 'refunded_count')::int,
  2, 'os dois estornos contam como estorno');
select is(
  (select l ->> 'refund_absorbed_by_master' from jsonb_array_elements((public.payout_statement('2026-11-01T00:00:00Z','2026-12-01T00:00:00Z', current_setting('test.cid')::uuid, true) -> 'companies' -> 0) -> 'lines') l where l ->> 'booking_code' = 'MP-HIB-A'),
  'false', 'a linha da venda A diz que o parceiro devolveu');
select is(
  (select (l ->> 'refund_partner_cents')::int from jsonb_array_elements((public.payout_statement('2026-11-01T00:00:00Z','2026-12-01T00:00:00Z', current_setting('test.cid')::uuid, true) -> 'companies' -> 0) -> 'lines') l where l ->> 'booking_code' = 'MP-HIB-A'),
  7900, 'a linha da venda A traz quanto o parceiro devolveu');
reset role;

select * from finish();
rollback;
