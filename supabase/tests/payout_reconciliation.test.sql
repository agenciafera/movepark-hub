-- pgTAP: E0.3.3 — reconciliação. payout_statement deriva o repasse do payment.split (parceiro =
-- liable:true), líquido de estornos, com escopo (operator só a sua empresa). payout_balance =
-- líquido − saques pagos. Transação com rollback.

begin;
select plan(11);

-- ── fixtures (como postgres; RLS não se aplica) ──────────────────────────────
do $$
declare
  op_a uuid := gen_random_uuid();
  op_b uuid := gen_random_uuid();
  adm  uuid := gen_random_uuid();
  cust uuid := gen_random_uuid();
  cid_a uuid; cid_b uuid;
  loc_a uuid := gen_random_uuid(); loc_b uuid := gen_random_uuid();
  bk uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (op_a,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','rec-a@ex.com',now(),now()),
    (op_b,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','rec-b@ex.com',now(),now()),
    (adm ,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','rec-adm@ex.com',now(),now()),
    (cust,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','rec-cust@ex.com',now(),now());
  insert into public.profiles(id, role) values
    (op_a,'company_operator'),(op_b,'company_operator'),(adm,'hub_admin'),(cust,'customer')
    on conflict (id) do nothing;

  cid_a := public.submit_partner_lead('Rec Empresa A','Op A','rec-a@ex.com','+5511999992001');
  cid_b := public.submit_partner_lead('Rec Empresa B','Op B','rec-b@ex.com','+5511999992002');
  insert into public.profile_company(profile_id, company_id) values (op_a, cid_a), (op_b, cid_b);

  insert into public.location(id, company_id, name, slug) values
    (loc_a, cid_a, 'Loc A', 'rec-loc-a'), (loc_b, cid_b, 'Loc B', 'rec-loc-b');

  -- helper local: cria booking + payment com split
  -- Empresa A: pay1 paid (parceiro 8500, mp 1500), pay2 paid (parceiro 17000, mp 3000),
  --            pay3 refunded (parceiro 8500, mp 1500) + 1 mock paid + 1 pending → ignorados
  bk := gen_random_uuid();
  insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount)
    values (bk,'MP-RECA1',cust,loc_a,'2026-05-10T12:00:00Z','2026-05-12T12:00:00Z','confirmed',100);
  insert into public.payment(booking_id, provider, method, amount, status, paid_at, split) values
    (bk,'pagarme','pix',100,'paid','2026-05-10T13:00:00Z',
     '[{"recipientId":"rp_a","amount":8500,"liable":true,"chargeProcessingFee":true,"chargeRemainderFee":true,"type":"flat"},
       {"recipientId":"rp_mp","amount":1500,"liable":false,"chargeProcessingFee":false,"chargeRemainderFee":false,"type":"flat"}]'::jsonb);

  bk := gen_random_uuid();
  insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount)
    values (bk,'MP-RECA2',cust,loc_a,'2026-05-15T12:00:00Z','2026-05-18T12:00:00Z','confirmed',200);
  insert into public.payment(booking_id, provider, method, amount, status, paid_at, split) values
    (bk,'pagarme','card',200,'paid','2026-05-15T13:00:00Z',
     '[{"recipientId":"rp_a","amount":17000,"liable":true,"chargeProcessingFee":true,"chargeRemainderFee":true,"type":"flat"},
       {"recipientId":"rp_mp","amount":3000,"liable":false,"chargeProcessingFee":false,"chargeRemainderFee":false,"type":"flat"}]'::jsonb);

  bk := gen_random_uuid();
  insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount)
    values (bk,'MP-RECA3',cust,loc_a,'2026-05-20T12:00:00Z','2026-05-22T12:00:00Z','cancelled',100);
  insert into public.payment(booking_id, provider, method, amount, status, paid_at, refunded_at, split) values
    (bk,'pagarme','pix',100,'refunded','2026-05-20T13:00:00Z','2026-05-21T10:00:00Z',
     '[{"recipientId":"rp_a","amount":8500,"liable":true,"chargeProcessingFee":true,"chargeRemainderFee":true,"type":"flat"},
       {"recipientId":"rp_mp","amount":1500,"liable":false,"chargeProcessingFee":false,"chargeRemainderFee":false,"type":"flat"}]'::jsonb);

  -- mock paid (deve ser IGNORADO) + pending (ignorado)
  bk := gen_random_uuid();
  insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount)
    values (bk,'MP-RECMOCK',cust,loc_a,'2026-05-23T12:00:00Z','2026-05-24T12:00:00Z','confirmed',999);
  insert into public.payment(booking_id, provider, method, amount, status, paid_at, split) values
    (bk,'mock','pix',999,'paid','2026-05-23T13:00:00Z',
     '[{"recipientId":"rp_a","amount":99900,"liable":true,"chargeProcessingFee":true,"chargeRemainderFee":true,"type":"flat"}]'::jsonb);
  bk := gen_random_uuid();
  insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount)
    values (bk,'MP-RECPEND',cust,loc_a,'2026-05-25T12:00:00Z','2026-05-26T12:00:00Z','pending',100);
  insert into public.payment(booking_id, provider, method, amount, status, split) values
    (bk,'pagarme','pix',100,'pending',
     '[{"recipientId":"rp_a","amount":8500,"liable":true,"chargeProcessingFee":true,"chargeRemainderFee":true,"type":"flat"}]'::jsonb);

  -- Empresa B: pay paid (parceiro 5000, mp 1000)
  bk := gen_random_uuid();
  insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount)
    values (bk,'MP-RECB1',cust,loc_b,'2026-05-11T12:00:00Z','2026-05-12T12:00:00Z','confirmed',60);
  insert into public.payment(booking_id, provider, method, amount, status, paid_at, split) values
    (bk,'pagarme','pix',60,'paid','2026-05-11T13:00:00Z',
     '[{"recipientId":"rp_b","amount":5000,"liable":true,"chargeProcessingFee":true,"chargeRemainderFee":true,"type":"flat"},
       {"recipientId":"rp_mp","amount":1000,"liable":false,"chargeProcessingFee":false,"chargeRemainderFee":false,"type":"flat"}]'::jsonb);

  -- saque pago de A (p/ o balance)
  insert into public.payout_withdrawal(company_id, provider, external_transfer_id, amount_cents, status, paid_at)
    values (cid_a,'pagarme','tr_a1',10000,'paid','2026-05-30T10:00:00Z');

  perform set_config('test.op_a', op_a::text, false);
  perform set_config('test.op_b', op_b::text, false);
  perform set_config('test.adm',  adm::text,  false);
  perform set_config('test.cid_a', cid_a::text, false);
  perform set_config('test.cid_b', cid_b::text, false);
end $$;

create or replace function pg_temp.as_user(p_uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid)::text, true);
end $$;

-- janela cobrindo maio/2026
\set period_from '\'2026-05-01T00:00:00Z\''
\set period_to   '\'2026-06-01T00:00:00Z\''

-- ── 1-5, 9, 10-11: como hub_admin ────────────────────────────────────────────
set local role authenticated;
select pg_temp.as_user(current_setting('test.adm'));

select is(
  ((public.payout_statement(:period_from, :period_to, current_setting('test.cid_a')::uuid)
    -> 'companies' -> 0 ->> 'net_partner_cents')::int),
  25500, 'A: líquido do parceiro = 8500 + 17000 (estorno fora)');

select is(
  ((public.payout_statement(:period_from, :period_to, current_setting('test.cid_a')::uuid)
    -> 'companies' -> 0 ->> 'gross_partner_cents')::int),
  34000, 'A: bruto = paid + refunded (8500+17000+8500); mock/pending fora');

select is(
  ((public.payout_statement(:period_from, :period_to, current_setting('test.cid_a')::uuid)
    -> 'companies' -> 0 ->> 'refunded_partner_cents')::int),
  8500, 'A: estornado = 8500');

select is(
  ((public.payout_statement(:period_from, :period_to, current_setting('test.cid_a')::uuid)
    -> 'companies' -> 0 ->> 'movepark_commission_cents')::int),
  4500, 'A: comissão Movepark = 1500 + 3000 (só pagos)');

select is(
  ((public.payout_statement(:period_from, :period_to, current_setting('test.cid_a')::uuid)
    -> 'companies' -> 0 ->> 'paid_count')::int),
  2, 'A: 2 pagamentos pagos');

select is(
  jsonb_array_length(public.payout_statement(:period_from, :period_to) -> 'companies'),
  2, 'hub_admin sem filtro vê as 2 empresas');

select is(
  ((public.payout_balance(current_setting('test.cid_a')::uuid) ->> 'net_partner_cents')::int),
  25500, 'balance: líquido = 25500');
select is(
  ((public.payout_balance(current_setting('test.cid_a')::uuid) ->> 'balance_cents')::int),
  15500, 'balance: 25500 − 10000 (saque pago) = 15500');
reset role;

-- ── 6-8: escopo (operator) ───────────────────────────────────────────────────
set local role authenticated;
select pg_temp.as_user(current_setting('test.op_a'));
select is(
  ((public.payout_statement(:period_from, :period_to, current_setting('test.cid_a')::uuid)
    -> 'companies' -> 0 ->> 'net_partner_cents')::int),
  25500, 'operador A vê o extrato da própria empresa');
select throws_ok(
  format($$ select public.payout_statement(%L, %L, %L::uuid) $$,
         '2026-05-01T00:00:00Z','2026-06-01T00:00:00Z', current_setting('test.cid_b')),
  '42501', null, 'operador A NÃO acessa o extrato da empresa B');
reset role;

set local role authenticated;
select pg_temp.as_user(current_setting('test.op_b'));
select is(
  ((public.payout_statement(:period_from, :period_to, current_setting('test.cid_b')::uuid)
    -> 'companies' -> 0 ->> 'net_partner_cents')::int),
  5000, 'operador B vê líquido 5000 da empresa B');
reset role;

select * from finish();
rollback;
