-- pgTAP: dívida do parceiro e split dinâmico (E0.3.5).
-- Spec: docs/specs/split-dinamico-e-divida-do-parceiro.md
--
-- O que este arquivo tranca é a conta que move dinheiro entre a Movepark e o parceiro depois que
-- o gateway já creditou: estorno vira dívida, venda abate, estorno de venda que abateu desfaz o
-- abatimento, reserva conta enquanto viva, acerto manual reduz. Errar aqui é repassar duas vezes
-- ou cobrar o que não é devido, e ninguém na tela perceberia.
-- Transação com rollback.

begin;
select plan(32);

-- ── schema ──────────────────────────────────────────────────────────────────
select has_column('public', 'payment', 'debt_recovered_cents', 'payment.debt_recovered_cents existe');
select has_table('public', 'payout_debt_reservation', 'payout_debt_reservation existe');
select has_table('public', 'payout_debt_settlement', 'payout_debt_settlement existe');
select has_table('public', 'payout_refund_manual', 'payout_refund_manual existe');
select has_table('public', 'gateway_account_balance', 'gateway_account_balance existe');

-- ── a perna do parceiro é por role, e legado por liable ─────────────────────
select is(public.split_rule_is_partner('{"role":"partner","liable":false}'::jsonb), true,
  'role=partner é parceiro mesmo com liable=false (o chargeback foi para a Movepark)');
select is(public.split_rule_is_partner('{"role":"movepark","liable":true}'::jsonb), false,
  'role=movepark não é parceiro mesmo com liable=true');
select is(public.split_rule_is_partner('{"liable":true}'::jsonb), true,
  'regra antiga sem role: liable=true era a marca do parceiro');
select is(public.split_rule_is_partner('{"liable":false}'::jsonb), false,
  'regra antiga sem role: liable=false é a Movepark');

-- ── fixture ─────────────────────────────────────────────────────────────────
do $$
declare
  cust uuid := gen_random_uuid();
  cid  uuid := gen_random_uuid();
  loc  uuid := gen_random_uuid();
  bk   uuid;
  -- Split novo: role explícito, chargeback (liable) na Movepark.
  split_novo jsonb := '[{"role":"partner","recipientId":"re_p","amount":16000,"liable":false,"chargeProcessingFee":true,"chargeRemainderFee":true,"type":"flat"},
                        {"role":"movepark","recipientId":"re_mp","amount":4000,"liable":true,"chargeProcessingFee":false,"chargeRemainderFee":false,"type":"flat"}]'::jsonb;
  split_100 jsonb := '[{"role":"partner","recipientId":"re_p","amount":8000,"liable":false,"chargeProcessingFee":true,"chargeRemainderFee":true,"type":"flat"},
                       {"role":"movepark","recipientId":"re_mp","amount":2000,"liable":true,"chargeProcessingFee":false,"chargeRemainderFee":false,"type":"flat"}]'::jsonb;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (cust,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','debt-cust@ex.com',now(),now());
  insert into public.profiles(id, role) values (cust,'customer') on conflict (id) do nothing;
  insert into public.company(id, name, slug) values (cid, 'Debt Empresa', 'debt-empresa');
  insert into public.location(id, company_id, name, slug) values (loc, cid, 'Debt Loc', 'debt-loc');
  perform set_config('test.cid', cid::text, false);
  perform set_config('test.cust', cust::text, false);
  perform set_config('test.loc', loc::text, false);

  -- A) venda de R$ 200 com split, estornada INTEIRA: dívida = perna do parceiro (160)
  bk := gen_random_uuid();
  insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount)
    values (bk,'MP-DEBT-A',cust,loc,'2026-12-10T12:00:00Z','2026-12-12T12:00:00Z','cancelled',200);
  insert into public.payment(booking_id, provider, method, kind, amount, status, paid_at, refunded_at, refunded_amount, refund_reason, split_sent_to_gateway, refund_absorbed_by_master, split)
    values (bk,'pagarme','pix','booking',200,'refunded','2026-11-01T13:00:00Z','2026-11-02T10:00:00Z',200,'cancelamento (customer)', true, true, split_novo);
end $$;

select is(public.payout_debt_cents(current_setting('test.cid')::uuid), 16000::bigint,
  'estorno total de venda com split: dívida = perna do parceiro (R$ 160)');

-- B) estorno PARCIAL de 25% numa venda de R$ 100 (perna 80): dívida sobe 20
do $$
declare bk uuid := gen_random_uuid();
begin
  insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount)
    values (bk,'MP-DEBT-B',current_setting('test.cust')::uuid,current_setting('test.loc')::uuid,'2026-12-13T12:00:00Z','2026-12-14T12:00:00Z','confirmed',100);
  insert into public.payment(booking_id, provider, method, kind, amount, status, paid_at, refunded_at, refunded_amount, split_sent_to_gateway, refund_absorbed_by_master, split)
    values (bk,'pagarme','pix','booking',100,'paid','2026-11-03T13:00:00Z','2026-11-04T10:00:00Z',25, true, true,
      '[{"role":"partner","recipientId":"re_p","amount":8000,"liable":false,"type":"flat"},{"role":"movepark","recipientId":"re_mp","amount":2000,"liable":true,"type":"flat"}]'::jsonb);
end $$;
select is(public.payout_debt_cents(current_setting('test.cid')::uuid), 18000::bigint,
  'estorno parcial de 25%: a dívida sobe proporcional (80 × 25% = 20)');

-- C) venda em custódia (split NÃO enviado) estornada: NÃO gera dívida, o dinheiro nunca saiu do master
do $$
declare bk uuid := gen_random_uuid();
begin
  insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount)
    values (bk,'MP-DEBT-C',current_setting('test.cust')::uuid,current_setting('test.loc')::uuid,'2026-12-15T12:00:00Z','2026-12-16T12:00:00Z','cancelled',100);
  insert into public.payment(booking_id, provider, method, kind, amount, status, paid_at, refunded_at, refunded_amount, split_sent_to_gateway, split)
    values (bk,'pagarme','pix','booking',100,'refunded','2026-11-05T13:00:00Z','2026-11-06T10:00:00Z',100, false,
      '[{"role":"partner","recipientId":null,"amount":8000,"liable":false,"type":"flat"},{"role":"movepark","recipientId":"re_mp","amount":2000,"liable":true,"type":"flat"}]'::jsonb);
end $$;
select is(public.payout_debt_cents(current_setting('test.cid')::uuid), 18000::bigint,
  'estorno de venda em custódia não gera dívida: o parceiro nunca recebeu');

-- C2) estorno ANTIGO de venda com split, em que o gateway debitou o parceiro sozinho: NÃO gera dívida
do $$
declare bk uuid := gen_random_uuid();
begin
  insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount)
    values (bk,'MP-DEBT-C2',current_setting('test.cust')::uuid,current_setting('test.loc')::uuid,'2026-12-17T12:00:00Z','2026-12-18T12:00:00Z','cancelled',100);
  insert into public.payment(booking_id, provider, method, kind, amount, status, paid_at, refunded_at, refunded_amount, split_sent_to_gateway, refund_absorbed_by_master, split)
    values (bk,'pagarme','pix','booking',100,'refunded','2026-07-05T13:00:00Z','2026-07-06T10:00:00Z',100, true, false,
      '[{"recipientId":"re_p","amount":8000,"liable":true,"type":"flat"},{"recipientId":"re_mp","amount":2000,"liable":false,"type":"flat"}]'::jsonb);
end $$;
select is(public.payout_debt_cents(current_setting('test.cid')::uuid), 18000::bigint,
  'estorno antigo que seguiu o split (gateway debitou o parceiro) não é dívida');

-- D) a reserva (venda a caminho) conta enquanto viva
select is(
  (select amount_cents from public.payout_debt_reserve(current_setting('test.cid')::uuid, 8000)),
  8000::bigint,
  'reserva devolve min(dívida, perna): dívida 180, perna 80 → 80');
select is(public.payout_debt_cents(current_setting('test.cid')::uuid), 10000::bigint,
  'reserva viva já desconta da dívida (180 − 80 = 100)');
select is(
  (select amount_cents from public.payout_debt_reserve(current_setting('test.cid')::uuid, 15000)),
  10000::bigint,
  'segunda reserva pega só o que sobrou: 100, não 150');
select is(
  (select amount_cents from public.payout_debt_reserve(current_setting('test.cid')::uuid, 5000)),
  0::bigint,
  'sem dívida sobrando, a reserva devolve zero e não grava nada');
select is(
  (select count(*)::int from public.payout_debt_reservation where company_id = current_setting('test.cid')::uuid),
  2, 'só as reservas com valor foram gravadas');

-- reserva vencida deixa de contar
update public.payout_debt_reservation set expires_at = now() - interval '1 minute'
 where company_id = current_setting('test.cid')::uuid;
select is(public.payout_debt_cents(current_setting('test.cid')::uuid), 18000::bigint,
  'reserva vencida sem pagamento não conta: a dívida volta para a próxima venda');

-- E) a venda que abateu: consome a reserva e grava o abatimento na cobrança
do $$
declare bk uuid := gen_random_uuid(); r record; pid uuid;
begin
  select * into r from public.payout_debt_reserve(current_setting('test.cid')::uuid, 8000);
  insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount)
    values (bk,'MP-DEBT-E',current_setting('test.cust')::uuid,current_setting('test.loc')::uuid,'2026-12-20T12:00:00Z','2026-12-21T12:00:00Z','confirmed',100);
  insert into public.payment(booking_id, provider, method, kind, amount, status, paid_at, split_sent_to_gateway, split,
                             debt_recovered_cents, debt_reservation_id)
    values (bk,'pagarme','pix','booking',100,'paid','2026-11-07T13:00:00Z', true,
      -- perna do parceiro zerada pelo abatimento: foi 100% master
      '[{"role":"partner","recipientId":"re_p","amount":8000,"liable":false,"type":"flat"},{"role":"movepark","recipientId":"re_mp","amount":2000,"liable":true,"type":"flat"}]'::jsonb,
      r.amount_cents, r.reservation_id)
    returning id into pid;
  update public.payout_debt_reservation set consumed_by_payment_id = pid where id = r.reservation_id;
  perform set_config('test.pay_e', pid::text, false);
end $$;
select is(public.payout_debt_cents(current_setting('test.cid')::uuid), 10000::bigint,
  'venda que abateu 80: dívida 180 → 100, e a reserva consumida não conta duas vezes');

-- F) a venda que abateu é estornada: o abatimento se desfaz (perna inteira volta)
update public.payment set status = 'refunded', refunded_at = now(), refunded_amount = amount,
       refund_absorbed_by_master = true
 where id = current_setting('test.pay_e')::uuid;
select is(public.payout_debt_cents(current_setting('test.cid')::uuid), 18000::bigint,
  'estorno da venda que abateu: dívida volta a 180 (o abatimento foi pago com dinheiro do cliente, que voltou)');

-- G) acerto manual reduz (hub_admin)
do $$
declare adm uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (adm,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','debt-adm@ex.com',now(),now());
  insert into public.profiles(id, role) values (adm,'hub_admin') on conflict (id) do update set role='hub_admin';
  perform set_config('test.adm', adm::text, false);
end $$;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.adm'), 'role', 'authenticated')::text, true);
select lives_ok(
  format($$ select public.payout_debt_settle(%L::uuid, 5000, 'manual_payment', 'PIX recebido') $$, current_setting('test.cid')),
  'hub_admin lança acerto manual');
select is(public.payout_debt_cents(current_setting('test.cid')::uuid), 13000::bigint,
  'acerto de R$ 50 reduz a dívida: 180 → 130');
select is(
  ((public.payout_balance(current_setting('test.cid')::uuid)) ->> 'debt_cents')::bigint, 13000::bigint,
  'payout_balance expõe debt_cents');
select is(
  ((public.payout_debt_lines(current_setting('test.cid')::uuid)) -> 'origins') is not null
  and jsonb_array_length((public.payout_debt_lines(current_setting('test.cid')::uuid)) -> 'origins') = 3,
  true, 'payout_debt_lines lista as 3 origens (A, B parcial e E estornada)');
select is(
  (select count(*)::int from jsonb_array_elements(public.payout_debt_overview()) x
    where x ->> 'company_id' = current_setting('test.cid')),
  1, 'payout_debt_overview lista a empresa com dívida');
reset role;

-- não-admin não lança acerto
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.cust'), 'role', 'authenticated')::text, true);
select throws_ok(
  format($$ select public.payout_debt_settle(%L::uuid, 5000, 'manual_payment') $$, current_setting('test.cid')),
  '42501', null, 'cliente não lança acerto de dívida');
select ok(
  not has_function_privilege('authenticated', 'public.payout_debt_reserve(uuid, bigint, text, bigint)', 'EXECUTE'),
  'a reserva de abatimento é só do service_role (a Edge), nunca do usuário');
reset role;

-- F) A dívida é líquida da taxa que o parceiro pagou na captura (17/09/2026): venda de R$ 100
--    com perna 8000, taxa apurada 100 e charge_processing_fee no parceiro, estornada inteira,
--    sobe a dívida em 7900, não em 8000.
create temporary table _antes as select public.payout_debt_cents(current_setting('test.cid')::uuid) as d;
do $$
declare bk uuid := gen_random_uuid();
  split_100 jsonb := '[{"role":"partner","recipientId":"re_p","amount":8000,"liable":false,"chargeProcessingFee":true,"chargeRemainderFee":true,"type":"flat"},
                       {"role":"movepark","recipientId":"re_mp","amount":2000,"liable":true,"chargeProcessingFee":false,"chargeRemainderFee":false,"type":"flat"}]'::jsonb;
begin
  insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount)
    values (bk,'MP-DEBT-F',current_setting('test.cust')::uuid,current_setting('test.loc')::uuid,'2026-12-20T12:00:00Z','2026-12-21T12:00:00Z','cancelled',100);
  insert into public.payment(booking_id, provider, method, kind, amount, status, paid_at, refunded_at, refunded_amount, refund_reason, split_sent_to_gateway, refund_absorbed_by_master, split, gateway_fee_cents)
    values (bk,'pagarme','pix','booking',100,'refunded','2026-11-20T13:00:00Z','2026-11-21T10:00:00Z',100,'cancelamento (staff)', true, true, split_100, 100);
end $$;
select is(public.payout_debt_cents(current_setting('test.cid')::uuid) - (select d from _antes), 7900::bigint,
  'dívida líquida da taxa: perna 8000 menos os 100 que o parceiro pagou na captura');

-- G) Piso do abatimento (17/09/2026): a perna que sobra é zero ou pelo menos o piso, nunca na
--    faixa entre os dois (o recebedor ficaria negativo pagando a taxa). Empresa própria, com
--    dívida de 7950 (perna 8000 menos taxa 50).
do $$
declare cid uuid := gen_random_uuid(); loc uuid := gen_random_uuid(); bk uuid := gen_random_uuid();
  split_100 jsonb := '[{"role":"partner","recipientId":"re_p2","amount":8000,"liable":false,"chargeProcessingFee":true,"chargeRemainderFee":true,"type":"flat"},
                       {"role":"movepark","recipientId":"re_mp","amount":2000,"liable":true,"chargeProcessingFee":false,"chargeRemainderFee":false,"type":"flat"}]'::jsonb;
begin
  insert into public.company(id, name, slug) values (cid, 'Piso Empresa', 'piso-empresa');
  insert into public.location(id, company_id, name, slug) values (loc, cid, 'Piso Loc', 'piso-loc');
  insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount)
    values (bk,'MP-PISO-1',current_setting('test.cust')::uuid,loc,'2026-12-22T12:00:00Z','2026-12-23T12:00:00Z','cancelled',100);
  insert into public.payment(booking_id, provider, method, kind, amount, status, paid_at, refunded_at, refunded_amount, refund_reason, split_sent_to_gateway, refund_absorbed_by_master, split, gateway_fee_cents)
    values (bk,'pagarme','pix','booking',100,'refunded','2026-11-22T13:00:00Z','2026-11-23T10:00:00Z',100,'cancelamento (staff)', true, true, split_100, 50);
  perform set_config('test.cid_piso', cid::text, false);
end $$;
select is(public.payout_debt_cents(current_setting('test.cid_piso')::uuid), 7950::bigint, 'dívida da empresa do piso = 7950');
-- perna 8000, dívida 7950, piso 300: sobraria 50 (< piso) → abate 7700 e deixa 300
select is(
  (select amount_cents from public.payout_debt_reserve(current_setting('test.cid_piso')::uuid, 8000, 'pagarme', 300)),
  7700::bigint, 'na faixa proibida, abate menos e deixa o piso para o parceiro');
-- o que sobrou da dívida (250) numa venda de perna 8000 com piso 300: sobra 7750 (≥ piso), abate tudo
select is(
  (select amount_cents from public.payout_debt_reserve(current_setting('test.cid_piso')::uuid, 8000, 'pagarme', 300)),
  250::bigint, 'fora da faixa, abate a dívida inteira que sobrou');

select * from finish();
rollback;
