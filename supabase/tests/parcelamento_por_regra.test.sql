-- pgTAP: parcelamento no cartão por regra de repasse e por empresa (09/11/2026).
-- Spec: docs/specs/comissao-por-origem.md (seção "Parcelamento por origem").
--
-- O que este arquivo tranca: qual parcelamento (máximo de parcelas e até quantas sem juros) a
-- reserva leva. A regra vence a empresa, a empresa vence a plataforma (nulo), e o resultado fica
-- congelado na reserva, fora do alcance de PATCH do cliente. Errar aqui é oferecer 3x sem juros
-- num estacionamento que não paga por isso, ou o contrário. Transação com rollback.

begin;
select plan(18);

-- ── fixture ─────────────────────────────────────────────────────────────────
do $$
declare
  cust uuid := gen_random_uuid();
  adm  uuid := gen_random_uuid();
  a    uuid := gen_random_uuid();
  b    uuid := gen_random_uuid();
  la   uuid := gen_random_uuid();
  lb   uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (cust,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','parc-cust@ex.com',now(),now()),
    (adm, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','parc-adm@ex.com',now(),now());
  insert into public.profiles(id, role) values (cust,'customer') on conflict (id) do update set role = 'customer';
  insert into public.profiles(id, role) values (adm,'hub_admin') on conflict (id) do update set role = 'hub_admin';
  insert into public.company(id, name, slug, take_rate_bps) values (a, 'Parc A', 'parc-a', 2000), (b, 'Parc B', 'parc-b', 2000);
  insert into public.location(id, company_id, name, slug) values (la, a, 'Parc Loc A', 'parc-loc-a'), (lb, b, 'Parc Loc B', 'parc-loc-b');
  perform set_config('test.cust', cust::text, false);
  perform set_config('test.adm', adm::text, false);
  perform set_config('test.a', a::text, false);
  perform set_config('test.b', b::text, false);
  perform set_config('test.la', la::text, false);
end $$;

-- ── constraints ─────────────────────────────────────────────────────────────
select throws_ok(
  format($$ update public.company set installments_max = 6 where id = %L $$, current_setting('test.a')),
  '23514', null, 'o par vem junto: máximo sem "sem juros até" é recusado');
select throws_ok(
  format($$ update public.company set installments_max = 2, installments_interest_free = 3 where id = %L $$, current_setting('test.a')),
  '23514', null, '"sem juros até" não passa do máximo de parcelas');

-- ── RPC do padrão da empresa ────────────────────────────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.cust'), 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok(
  format($$ select public.set_company_installments(%L::uuid, 1, 1) $$, current_setting('test.a')),
  '42501', null, 'cliente não define o parcelamento de um estacionamento');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.adm'), 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok(
  format($$ select public.set_company_installments(%L::uuid, 6, null) $$, current_setting('test.a')),
  '22023', null, 'a RPC recusa o par incompleto com mensagem clara');
select lives_ok(
  format($$ select public.set_company_installments(%L::uuid, 1, 1) $$, current_setting('test.a')),
  'hub_admin define "só à vista" para a empresa A');
reset role;

select is((select installments_max::int from public.company where id = current_setting('test.a')::uuid), 1,
  'o padrão da empresa fica gravado');

-- ── resolução ───────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select is(public.resolve_commission(current_setting('test.b')::uuid, 'hub_search', null, null, now()) ->> 'installments_max', null,
  'sem regra e sem padrão da empresa, o parcelamento é o da plataforma (nulo)');
select is((public.resolve_commission(current_setting('test.a')::uuid, 'hub_search', null, null, now()) ->> 'installments_max')::int, 1,
  'sem regra, vale o padrão da empresa');

insert into public.commission_rule(company_id, name, utm_sources, take_rate_bps, gateway_fee_payer, chargeback_bearer,
                                   installments_max, installments_interest_free)
  values (current_setting('test.a')::uuid, 'Site com juros', array['parc-a-site'], 1000, 'partner', 'each', 12, 1);
insert into public.commission_rule(company_id, name, utm_sources, take_rate_bps, gateway_fee_payer, chargeback_bearer)
  values (current_setting('test.a')::uuid, 'Insta herda', array['parc-a-insta'], 1000, 'partner', 'each');

select is((public.resolve_commission(current_setting('test.a')::uuid, 'hub_search', 'parc-a-site', now(), now()) ->> 'installments_max')::int, 12,
  'a regra que define parcelamento vence a empresa (máximo)');
select is((public.resolve_commission(current_setting('test.a')::uuid, 'hub_search', 'parc-a-site', now(), now()) ->> 'installments_interest_free')::int, 1,
  'a regra que define parcelamento vence a empresa (juros desde a 2ª)');
select is((public.resolve_commission(current_setting('test.a')::uuid, 'hub_search', 'parc-a-insta', now(), now()) ->> 'installments_max')::int, 1,
  'a regra sem parcelamento herda o padrão da empresa');

select throws_ok(
  $$ insert into public.commission_rule(name, utm_sources, take_rate_bps, gateway_fee_payer, chargeback_bearer, installments_max)
     values ('Global quebrada', array['parc-x'], 1000, 'movepark', 'each', 3) $$,
  '23514', null, 'regra com o par incompleto é recusada');

-- ── congelamento na reserva ─────────────────────────────────────────────────
insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount, origin)
  values ('00000000-0000-0000-0000-0000000ba001', 'MP-PARC-1', current_setting('test.cust')::uuid, current_setting('test.la')::uuid,
          '2026-12-10T12:00:00Z', '2026-12-12T12:00:00Z', 'pending', 200, 'hub_search');
select is((public.booking_apply_commission('00000000-0000-0000-0000-0000000ba001',
    jsonb_build_object('utm_source', 'parc-a-site', 'clicked_at', now())) ->> 'installments_interest_free')::int, 1,
  'a reserva recebe o parcelamento da regra');
select is(
  (select (commission_installments_max, commission_installments_interest_free)::text from public.booking
    where id = '00000000-0000-0000-0000-0000000ba001'),
  '(12,1)', 'e ele fica congelado nas colunas da reserva');

-- Mudar a regra depois não mexe na reserva que já tem pacote travado pelo pagamento.
insert into public.payment(booking_id, provider, amount, status, method)
  values ('00000000-0000-0000-0000-0000000ba001', 'mock', 200, 'paid', 'card');
update public.commission_rule set installments_max = 3, installments_interest_free = 3 where name = 'Site com juros';
select is((public.booking_apply_commission('00000000-0000-0000-0000-0000000ba001', null) ->> 'installments_max')::int, 12,
  'reserva já paga mantém o parcelamento congelado');

-- ── guarda contra PATCH do cliente ──────────────────────────────────────────
insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount, origin)
  values ('00000000-0000-0000-0000-0000000ba002', 'MP-PARC-2', current_setting('test.cust')::uuid, current_setting('test.la')::uuid,
          '2026-12-10T12:00:00Z', '2026-12-12T12:00:00Z', 'pending', 200, 'hub_search');
select public.booking_apply_commission('00000000-0000-0000-0000-0000000ba002', null);

select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.cust'), 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok(
  $$ update public.booking set commission_installments_max = 12, commission_installments_interest_free = 12
      where id = '00000000-0000-0000-0000-0000000ba002' $$,
  '42501', null, 'o cliente não troca o parcelamento da própria reserva');
reset role;

-- ── correção manual leva o parcelamento do canal novo ────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.adm'), 'role', 'authenticated')::text, true);
set local role authenticated;
select is((public.admin_set_booking_commission('00000000-0000-0000-0000-0000000ba002',
    (select id from public.commission_rule where name = 'Site com juros'), 'veio do site') ->> 'installments_max')::int, 3,
  'corrigir o canal aplica o parcelamento da regra escolhida');
reset role;
select is((select commission_installments_interest_free::int from public.booking where id = '00000000-0000-0000-0000-0000000ba002'), 3,
  'e grava na reserva');

select * from finish();
rollback;
