-- pgTAP: antecipação do cartão do parceiro (E0.3.14). Spec: docs/specs/antecipacao-do-parceiro.md
--
-- O que este arquivo tranca: quem paga a antecipação (regra > empresa > padrão do Hub), o
-- congelamento na reserva fora do alcance de PATCH do cliente, a escrita do padrão da empresa só
-- por hub_admin, e o crédito: toda taxa de antecipação da Movepark que cai no estacionamento volta
-- para ele. Transação com rollback.

begin;
select plan(13);

-- ── fixture ─────────────────────────────────────────────────────────────────
do $$
declare
  cust uuid := gen_random_uuid();
  adm  uuid := gen_random_uuid();
  a    uuid := gen_random_uuid();
  la   uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (cust,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','ant-cust@ex.com',now(),now()),
    (adm, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','ant-adm@ex.com',now(),now());
  insert into public.profiles(id, role) values (cust,'customer') on conflict (id) do update set role = 'customer';
  insert into public.profiles(id, role) values (adm,'hub_admin') on conflict (id) do update set role = 'hub_admin';
  insert into public.company(id, name, slug, take_rate_bps) values (a, 'Ant A', 'ant-a', 2000);
  insert into public.location(id, company_id, name, slug) values (la, a, 'Ant Loc A', 'ant-loc-a');
  perform set_config('test.cust', cust::text, false);
  perform set_config('test.adm', adm::text, false);
  perform set_config('test.a', a::text, false);
  perform set_config('test.la', la::text, false);
end $$;

-- ── resolução ───────────────────────────────────────────────────────────────
-- resolve_commission e booking_apply_commission só respondem a hub_admin ou service_role.
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select is(public.resolve_commission(current_setting('test.a')::uuid, 'hub_search', null, null) ->> 'anticipation_payer',
  'movepark', 'sem regra e sem padrão da empresa: a Movepark paga a antecipação');

update public.company set anticipation_fee_payer = 'partner' where id = current_setting('test.a')::uuid;
select is(public.resolve_commission(current_setting('test.a')::uuid, 'hub_search', null, null) ->> 'anticipation_payer',
  'partner', 'o padrão da empresa vale para a venda sem regra');

insert into public.commission_rule(company_id, name, utm_sources, take_rate_bps, gateway_fee_payer, chargeback_bearer, anticipation_fee_payer)
  values (current_setting('test.a')::uuid, 'Site Ant', array['ant-site'], 1000, 'movepark', 'each', 'movepark');
select is(public.resolve_commission(current_setting('test.a')::uuid, 'hub_search', 'ant-site', now()) ->> 'anticipation_payer',
  'movepark', 'a regra vence a empresa');

update public.commission_rule set anticipation_fee_payer = null where name = 'Site Ant';
select is(public.resolve_commission(current_setting('test.a')::uuid, 'hub_search', 'ant-site', now()) ->> 'anticipation_payer',
  'partner', 'regra sem pagador herda a empresa');

select throws_ok(
  format($$ update public.company set anticipation_fee_payer = 'cliente' where id = %L $$, current_setting('test.a')),
  '23514', null, 'pagador fora de movepark/partner é recusado');

-- ── padrão da empresa: só hub_admin ─────────────────────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.cust'), 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok(
  format($$ select public.set_company_anticipation(%L, 'movepark') $$, current_setting('test.a')),
  '42501', null, 'cliente não define quem paga a antecipação');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.adm'), 'role', 'authenticated')::text, true);
set local role authenticated;
select is(public.set_company_anticipation(current_setting('test.a')::uuid, null) ->> 'anticipation_fee_payer',
  null, 'hub_admin volta a empresa a herdar o padrão');
reset role;

-- ── congelamento na reserva ─────────────────────────────────────────────────
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount, origin)
  values ('00000000-0000-0000-0000-0000000ab001', 'MP-ANT-1', current_setting('test.cust')::uuid, current_setting('test.la')::uuid,
          '2026-12-10T12:00:00Z', '2026-12-12T12:00:00Z', 'pending', 200, 'hub_search');
select is(public.booking_apply_commission('00000000-0000-0000-0000-0000000ab001', null) ->> 'anticipation_payer',
  'movepark', 'a resolução devolve o pagador ao congelar');
select is((select commission_anticipation_payer from public.booking where id = '00000000-0000-0000-0000-0000000ab001'),
  'movepark', 'o pagador fica gravado na reserva');

select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.cust'), 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok(
  $$ update public.booking set commission_anticipation_payer = 'partner' where id = '00000000-0000-0000-0000-0000000ab001' $$,
  '42501', null, 'o cliente não muda o pagador da reserva');
reset role;

-- ── crédito ─────────────────────────────────────────────────────────────────
insert into public.payout_anticipation(company_id, provider, external_id, requested_cents, anticipation_fee_cents, status, fee_borne_by)
  values (current_setting('test.a')::uuid, 'pagarme', 'ba_ant_1', 10000, 300, 'approved', 'movepark'),
         (current_setting('test.a')::uuid, 'pagarme', 'ba_ant_2', 10000, 999, 'approved', 'partner'),
         (current_setting('test.a')::uuid, 'pagarme', 'ba_ant_3', 10000, 777, 'pending', 'movepark');
select is(public.payout_fee_credit_cents(current_setting('test.a')::uuid), 300::bigint,
  'só a pontual aprovada e paga pela Movepark vira crédito');

select throws_ok(
  format($$ insert into public.payout_anticipation(company_id, provider, external_id, requested_cents, status, fee_borne_by)
            values (%L, 'pagarme', 'ba_ant_1', 1, 'pending', 'movepark') $$, current_setting('test.a')),
  '23505', null, 'uma linha por antecipação (idempotência por external_id)');

-- ── RLS ─────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.cust'), 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*) from public.payout_anticipation)::int, 0, 'cliente não vê antecipações');
reset role;

select * from finish();
rollback;
