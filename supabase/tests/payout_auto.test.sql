-- pgTAP: repasse automático mensal (E0.3.13, 26/09/2026). Spec: docs/specs/repasse-automatico-mensal.md.
-- Transação com rollback.
begin;
select plan(27);

select is((select value from public.app_setting where key = 'payout_auto_day'), '10', 'dia padrão nasce em 10');
select is((select value from public.app_setting where key = 'payout_auto_min_cents'), '5000', 'mínimo nasce em R$ 50');
select has_column('public', 'company', 'payout_auto_day', 'company.payout_auto_day existe');
select has_column('public', 'payout_withdrawal', 'fee_borne_by', 'payout_withdrawal.fee_borne_by existe');
select has_table('public', 'payout_auto_cycle', 'payout_auto_cycle existe');

do $$
declare
  adm uuid := gen_random_uuid(); cust uuid := gen_random_uuid(); op uuid := gen_random_uuid();
  cid uuid := gen_random_uuid(); cid2 uuid := gen_random_uuid(); loc uuid := gen_random_uuid();
  b1 uuid := gen_random_uuid(); b2 uuid := gen_random_uuid();
  split_novo jsonb := '[{"role":"partner","recipientId":"re_pa_p","amount":8000,"type":"flat","liable":false,"chargeProcessingFee":true,"chargeRemainderFee":true},
                        {"role":"movepark","recipientId":"re_pa_mp","amount":2000,"type":"flat","liable":true,"chargeProcessingFee":false,"chargeRemainderFee":false}]'::jsonb;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (adm,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','pa-adm@ex.com',now(),now()),
           (cust,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','pa-cust@ex.com',now(),now()),
           (op,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','pa-op@ex.com',now(),now());
  insert into public.profiles(id, role) values (adm,'hub_admin') on conflict (id) do update set role='hub_admin';
  insert into public.profiles(id, role) values (cust,'customer') on conflict (id) do nothing;
  insert into public.profiles(id, role) values (op,'company_operator') on conflict (id) do update set role='company_operator';
  insert into public.company(id, name, slug) values (cid, 'Auto Empresa', 'auto-empresa'), (cid2, 'Auto Desligada', 'auto-desligada');
  update public.company set payout_auto_enabled = false where id = cid2;
  insert into public.profile_company(profile_id, company_id, role) values (op, cid, 'owner');
  insert into public.location(id, company_id, name, slug) values (loc, cid, 'Auto Loc', 'auto-loc');
  insert into public.payout_recipient(company_id, provider, external_recipient_id, status, balance_available_cents, balance_waiting_cents, balance_synced_at)
    values (cid, 'pagarme', 're_pa_p', 'active', 20000, 3000, now()), (cid2, 'pagarme', 're_pa_p2', 'active', 20000, 0, now());
  -- venda liberada (paga há 40 dias)
  insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount)
    values (b1,'MP-PA-1',cust,loc,now() - interval '39 days',now() - interval '38 days','completed',100);
  insert into public.payment(booking_id, provider, method, kind, amount, status, paid_at, split_sent_to_gateway, split, gateway_fee_cents, partner_release_at)
    values (b1,'pagarme','pix','booking',100,'paid',now() - interval '40 days', true, split_novo, 100, now() - interval '40 days');
  -- venda que libera daqui a 3 dias (paga há 27 dias): entra na previsão se o próximo dia for depois
  insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount)
    values (b2,'MP-PA-2',cust,loc,now() - interval '20 days',now() - interval '19 days','completed',100);
  insert into public.payment(booking_id, provider, method, kind, amount, status, paid_at, split_sent_to_gateway, split, gateway_fee_cents, partner_release_at)
    values (b2,'pagarme','pix','booking',100,'paid',now() - interval '27 days', true, split_novo, 100, now() - interval '27 days');
  -- saque automático anterior: taxa por conta da Movepark
  insert into public.payout_withdrawal(company_id, provider, external_transfer_id, external_recipient_id, amount_cents, fee_cents, status, paid_at, origin, fee_borne_by)
    values (cid, 'pagarme', 'tr_pa_auto', 're_pa_p', 1000, 367, 'paid', now() - interval '10 days', 'automatic', 'movepark');
  -- saque manual anterior: taxa do parceiro
  insert into public.payout_withdrawal(company_id, provider, external_transfer_id, external_recipient_id, amount_cents, fee_cents, status, paid_at)
    values (cid, 'pagarme', 'tr_pa_manual', 're_pa_p', 500, 367, 'paid', now() - interval '9 days');
  perform set_config('test.adm', adm::text, false);
  perform set_config('test.cust', cust::text, false);
  perform set_config('test.op', op::text, false);
  perform set_config('test.cid', cid::text, false);
  perform set_config('test.cid2', cid2::text, false);
end $$;

-- Daqui até a previsão, as chamadas são as do cron/Edge: claims de service_role (postgres sem claims
-- cai na checagem de permissão de payout_withdrawable e company_set_payout_schedule).
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- resolução do dia e da próxima data
select is(public.payout_auto_day(current_setting('test.cid')::uuid), 10, 'empresa sem override herda o dia 10');
select lives_ok(format('select public.company_set_payout_schedule(%L::uuid, 31, null)', current_setting('test.cid')), 'hub_admin (service) muda o dia');
select is(public.payout_next_auto_at(current_setting('test.cid')::uuid, date '2026-09-05'), date '2026-09-30', 'dia 31 em setembro cai no dia 30');
select is(public.payout_next_auto_at(current_setting('test.cid')::uuid, date '2026-10-31'), date '2026-10-31', 'o próprio dia conta como próximo');
select lives_ok(format('select public.company_set_payout_schedule(%L::uuid, 10, null)', current_setting('test.cid')), 'volta ao dia 10');
select is(public.payout_next_auto_at(current_setting('test.cid')::uuid, date '2026-09-11'), date '2026-10-10', 'hoje passou do dia: próximo mês');
select is(public.payout_next_auto_at(current_setting('test.cid')::uuid, date '2026-09-10'), date '2026-09-10', 'hoje é o dia');

-- quem é hoje
select is((select count(*) from public.payout_auto_due(date '2026-10-10') d where d.company_id = current_setting('test.cid')::uuid), 1::bigint, 'empresa ligada com recebedor ativo é devida no dia 10');
select is((select count(*) from public.payout_auto_due(date '2026-10-10') d where d.company_id = current_setting('test.cid2')::uuid), 0::bigint, 'empresa desligada não é devida');
select is((select count(*) from public.payout_auto_due(date '2026-10-09') d where d.company_id = current_setting('test.cid')::uuid), 0::bigint, 'dia 9 não é o dia');
insert into public.payout_auto_cycle(company_id, cycle_month, scheduled_for, outcome) values (current_setting('test.cid')::uuid, date '2026-10-01', date '2026-10-10', 'paid');
select is((select count(*) from public.payout_auto_due(date '2026-10-10') d where d.company_id = current_setting('test.cid')::uuid), 0::bigint, 'ciclo do mês já aberto: não repete');
select throws_ok(format('insert into public.payout_auto_cycle(company_id, cycle_month, scheduled_for) values (%L::uuid, date ''2026-10-01'', date ''2026-10-10'')', current_setting('test.cid')), '23505', null, 'um ciclo por empresa e mês');

-- razão: a taxa por conta da Movepark não desconta do parceiro; a do parceiro desconta
-- liberado 7900 (b1: 8000 menos a taxa de 100 que o parceiro paga) − saques (1000 + (500 + 367)) = 6033, no teto do gateway 20000
select is((public.payout_withdrawable(current_setting('test.cid')::uuid)->>'available_cents')::bigint, 6033::bigint, 'saque automático desconta só o valor; manual desconta valor e taxa');

-- crédito da taxa
select is(public.payout_fee_credit_cents(current_setting('test.cid')::uuid), 367::bigint, 'crédito = taxa dos saques automáticos vivos');
select is((select amount_cents from public.payout_fee_credit_reserve(current_setting('test.cid')::uuid, 200)), 200::bigint, 'reserva limita ao teto pedido');
select is(public.payout_fee_credit_cents(current_setting('test.cid')::uuid), 167::bigint, 'reserva viva sai do crédito');
select is((select amount_cents from public.payout_fee_credit_reserve(current_setting('test.cid2')::uuid, 500)), 0::bigint, 'sem crédito, reserva zero');

-- previsão como o Dono (RLS)
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.op'), 'role', 'authenticated')::text, true);
select is((public.payout_auto_forecast(current_setting('test.cid')::uuid)->>'day')::int, 10, 'Dono lê a previsão: dia');
-- próxima data é o dia 10 do mês seguinte ao ciclo já fechado (2026-10) OU o próximo dia 10 real; a venda b2 libera em 3 dias, antes de qualquer dia 10 futuro:
-- liberado até lá = 7900 + 7900 − saques 1867 = 13933, teto gateway 20000 + 3000
select is((public.payout_auto_forecast(current_setting('test.cid')::uuid)->>'forecast_cents')::bigint, 13933::bigint, 'previsão inclui a venda que libera até a data');
select is((public.payout_auto_forecast(current_setting('test.cid')::uuid)->>'below_min')::boolean, false, 'acima do mínimo');
select throws_ok(format('select public.payout_auto_forecast(%L::uuid)', current_setting('test.cid2')), '42501', null, 'Dono de outra empresa não lê');
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.cust'), 'role', 'authenticated')::text, true);
select throws_ok(format('select public.company_set_payout_schedule(%L::uuid, 5, true)', current_setting('test.cid')), 'P0001', null, 'cliente não muda o dia');

select * from finish();
rollback;
