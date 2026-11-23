-- pgTAP: taxa do gateway medida nas vendas (23/11/2026). Spec: docs/specs/taxas-da-reserva.md
-- Só hub_admin lê. A medida sai do ÚLTIMO evento payables de cada pagamento pago, ignora recebível
-- de refund e pagamento pendente. O banco vivo tem vendas de verdade no período, então as
-- asserções comparam o antes e o depois da fixture (delta), nunca o número absoluto.
-- Taxas da fixture são inventadas (o repo é público). Transação com rollback.

begin;
select plan(14);

select has_function('public', 'gateway_fee_measured', array['integer'], 'gateway_fee_measured(int) existe');
select ok(not has_function_privilege('anon', 'public.gateway_fee_measured(integer)', 'execute'), 'anon não executa');

do $$
declare
  adm uuid := gen_random_uuid(); cust uuid := gen_random_uuid(); opr uuid := gen_random_uuid();
  cid uuid := gen_random_uuid(); loc uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (adm,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','gfm-adm@ex.com',now(),now()),
           (cust,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','gfm-cust@ex.com',now(),now()),
           (opr,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','gfm-opr@ex.com',now(),now());
  insert into public.profiles(id, role) values (adm,'hub_admin') on conflict (id) do update set role = 'hub_admin';
  insert into public.profiles(id, role) values (cust,'customer') on conflict (id) do nothing;
  insert into public.profiles(id, role) values (opr,'company_operator') on conflict (id) do update set role = 'company_operator';
  insert into public.company(id, name, slug) values (cid, 'GFM Empresa', 'gfm-empresa');
  insert into public.location(id, company_id, name, slug) values (loc, cid, 'GFM Loc', 'gfm-loc');
  perform set_config('test.adm', adm::text, false);
  perform set_config('test.cust', cust::text, false);
  perform set_config('test.opr', opr::text, false);
  perform set_config('test.loc', loc::text, false);
end $$;

-- ── quem não é hub_admin ────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.cust'), 'role', 'authenticated')::text, true);
select throws_ok($$select public.gateway_fee_measured(90)$$, '42501', null, 'cliente recebe 42501');
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.opr'), 'role', 'authenticated')::text, true);
select throws_ok($$select public.gateway_fee_measured(90)$$, '42501', null, 'operador recebe 42501');

-- ── antes da fixture ────────────────────────────────────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.adm'), 'role', 'authenticated')::text, true);
select lives_ok($$select set_config('test.before', public.gateway_fee_measured(90)::text, false)$$, 'hub_admin lê');
reset role;

-- ── fixture: cartão 2x pago, Pix pago, cartão pendente ──────────────────────
do $$
declare
  cust uuid := current_setting('test.cust')::uuid; loc uuid := current_setting('test.loc')::uuid;
  b1 uuid := gen_random_uuid(); b2 uuid := gen_random_uuid(); b3 uuid := gen_random_uuid();
  card uuid := gen_random_uuid(); pix uuid := gen_random_uuid(); pend uuid := gen_random_uuid();
begin
  insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount)
    values (b1,'MP-GFM001',cust,loc,now() + interval '2 days',now() + interval '3 days','confirmed',100),
           (b2,'MP-GFM002',cust,loc,now() + interval '2 days',now() + interval '3 days','confirmed',50),
           (b3,'MP-GFM003',cust,loc,now() + interval '2 days',now() + interval '3 days','pending',100);
  insert into public.payment(id, booking_id, provider, method, kind, amount, status, paid_at, installments, provider_payment_id, provider_charge_id)
    values (card, b1, 'pagarme', 'card', 'booking', 100, 'paid', now(), 2, 'or_gfm1', 'ch_gfm1'),
           (pix,  b2, 'pagarme', 'pix',  'booking', 50,  'paid', now(), 1, 'or_gfm2', 'ch_gfm2'),
           (pend, b3, 'pagarme', 'card', 'booking', 100, 'pending', null, 2, 'or_gfm3', 'ch_gfm3');
  insert into public.payment_gateway_event(payment_id, booking_id, kind, http_status, request, response, created_at) values
    -- evento ANTIGO do cartão: a taxa 999 não pode entrar (vale o último)
    (card, b1, 'payables', 200, '{}', '{"data":[{"type":"credit","fee":999,"amount":5000,"installment":1}]}', now() - interval '1 day'),
    -- último evento do cartão: duas parcelas, uma antecipada, e um recebível de refund
    (card, b1, 'payables', 200, '{}', jsonb_build_object('data', jsonb_build_array(
       jsonb_build_object('type','credit','fee',100,'fraud_coverage_fee',10,'amount',3000,'installment',1,
                          'anticipation_fee',0,'payment_date','2026-12-01T03:00:00Z'),
       jsonb_build_object('type','credit','fee',50,'fraud_coverage_fee',0,'amount',1000,'installment',2,
                          'anticipation_fee',19,'payment_date','2026-12-01T03:00:00Z',
                          'original_payment_date','2026-12-31T03:00:00Z'),
       jsonb_build_object('type','refund','fee',-100,'amount',-3000,'installment',1))), now()),
    -- releitura MAIS NOVA com erro da Pagar.me (MP-573C3E): não pode apagar o retrato bom
    (card, b1, 'payables', 500, '{"reread":true}', '{"message":"Internal Server Error"}', now() + interval '1 hour'),
    (pix,  b2, 'payables', 200, '{}', '{"data":[{"type":"credit","fee":40,"amount":5000}]}', now()),
    -- pendente: não pode entrar
    (pend, b3, 'payables', 200, '{}', '{"data":[{"type":"credit","fee":777,"amount":10000,"installment":1}]}', now());
end $$;

-- ── depois da fixture ───────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.adm'), 'role', 'authenticated')::text, true);
select set_config('test.after', public.gateway_fee_measured(90)::text, false);
reset role;

create function pg_temp.gfm_row(j jsonb, m text, n int, f text) returns bigint language sql as $f$
  select coalesce((select (r ->> f)::bigint from jsonb_array_elements(j -> 'rows') r
                    where r ->> 'method' = m and (r ->> 'installments')::int = n), 0)
$f$;
create function pg_temp.gfm_delta(m text, n int, f text) returns bigint language sql as $f$
  select pg_temp.gfm_row(current_setting('test.after')::jsonb, m, n, f)
       - pg_temp.gfm_row(current_setting('test.before')::jsonb, m, n, f)
$f$;
create function pg_temp.gfm_ant(f text) returns bigint language sql as $f$
  select (current_setting('test.after')::jsonb -> 'anticipation' ->> f)::bigint
       - (current_setting('test.before')::jsonb -> 'anticipation' ->> f)::bigint
$f$;

select is(pg_temp.gfm_delta('card', 2, 'sales'), 1::bigint, 'o cartão pago entra uma vez; o pendente não');
select is(pg_temp.gfm_delta('card', 2, 'charged_cents'), 10000::bigint, 'valor cobrado em centavos');
select is(pg_temp.gfm_delta('card', 2, 'fee_cents'), 150::bigint, 'MDR do último evento, sem o antigo e sem o refund');
select is(pg_temp.gfm_delta('card', 2, 'fraud_cents'), 10::bigint, 'antifraude somado');
select is(pg_temp.gfm_delta('pix', 1, 'fee_cents'), 40::bigint, 'Pix medido na linha de 1 parcela');
select is(pg_temp.gfm_ant('payables'), 1::bigint, 'uma parcela antecipada');
select is(pg_temp.gfm_ant('fee_cents'), 19::bigint, 'taxa de antecipação somada');
select is(pg_temp.gfm_ant('base_cents_month'), 950::bigint, 'base ao mês: líquido de 950 por 30 dias');
select is((current_setting('test.after')::jsonb ->> 'days')::int, 90, 'janela devolvida');

select * from finish();
rollback;
