-- pgTAP: E1.4.1 (operator_set_pricing — edita preço com escopo) e E1.4.2 (operator_set_date_blocked
-- + _create_booking_core rejeita data bloqueada). Transação com rollback.

begin;
select plan(7);

do $$
declare
  op_a uuid := gen_random_uuid(); op_b uuid := gen_random_uuid(); cust uuid := gen_random_uuid();
  cid_a uuid; cid_b uuid; v_pt uuid; v_cpt uuid; v_lpt uuid; v_seed_lpt uuid;
  loc_a uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (op_a,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','op-a@ex.com',now(),now()),
    (op_b,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','op-b@ex.com',now(),now()),
    (cust,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','op-cust@ex.com',now(),now());
  insert into public.profiles(id, role) values
    (op_a,'company_operator'),(op_b,'company_operator'),(cust,'customer') on conflict (id) do nothing;
  cid_a := public.submit_partner_lead('Op Empresa A','Op A','op-a@ex.com','+5511999994001');
  cid_b := public.submit_partner_lead('Op Empresa B','Op B','op-b@ex.com','+5511999994002');
  update public.company set status = 'active' where id = cid_a;  -- p/ simulate_price funcionar
  insert into public.profile_company(profile_id, company_id) values (op_a, cid_a), (op_b, cid_b);

  -- lpt da empresa A (pra testar edição de preço)
  select id into v_pt from public.parking_type limit 1;
  insert into public.company_parking_type(company_id, parking_type_id, base_price, default_capacity, is_active)
    values (cid_a, v_pt, 50, 5, true) returning id into v_cpt;
  insert into public.location(id, company_id, name, slug) values (loc_a, cid_a, 'Op Loc A', 'op-loc-a');
  insert into public.location_parking_type(location_id, company_parking_type_id, capacity, is_active)
    values (loc_a, v_cpt, 5, true) returning id into v_lpt;

  -- lpt do seed (já tem pricing) pra testar bloqueio de data + reserva
  select id into v_seed_lpt from public.location_parking_type where capacity > 0 and is_active limit 1;
  update public.location_parking_type set capacity = 3 where id = v_seed_lpt;

  perform set_config('test.op_a', op_a::text, false);
  perform set_config('test.op_b', op_b::text, false);
  perform set_config('test.cust', cust::text, false);
  perform set_config('test.lpt', v_lpt::text, false);
  perform set_config('test.seed_lpt', v_seed_lpt::text, false);
end $$;

create or replace function pg_temp.as_user(p_uid text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', p_uid)::text, true); end $$;

-- ── E1.4.1: operator_set_pricing ─────────────────────────────────────────────
set local role authenticated;
select pg_temp.as_user(current_setting('test.op_a'));
select lives_ok(
  format($$ select public.operator_set_pricing(%L::uuid, 80, '{"strategy":"uniform_by_duration"}'::jsonb,
            '[{"from_day":1,"to_day":null,"unit_price":40}]'::jsonb) $$, current_setting('test.lpt')),
  'operador A salva a precificação da própria unidade');
reset role;

-- persistiu a regra + a faixa + o base_price
select is(
  (select strategy from public.pricing_rule where location_parking_type_id = current_setting('test.lpt')::uuid),
  'uniform_by_duration', 'pricing_rule criado pela RPC');
select is(
  (select count(*)::int from public.pricing_tier pt
   join public.pricing_rule pr on pr.id = pt.pricing_rule_id
   where pr.location_parking_type_id = current_setting('test.lpt')::uuid and pt.is_old_price = false),
  1, 'a faixa de preço foi gravada');

-- operador B não edita o preço da empresa A
set local role authenticated;
select pg_temp.as_user(current_setting('test.op_b'));
select throws_ok(
  format($$ select public.operator_set_pricing(%L::uuid, 80, '{"strategy":"uniform_by_duration"}'::jsonb, '[]'::jsonb) $$,
         current_setting('test.lpt')),
  '42501', null, 'operador B NÃO edita preço de unidade alheia');
reset role;

-- ── E1.4.2: bloqueio de data + reserva (na unidade da empresa A) ─────────────
-- operador A bloqueia 2026-10-10
set local role authenticated;
select pg_temp.as_user(current_setting('test.op_a'));
select lives_ok(
  format($$ select public.operator_set_date_blocked(%L::uuid, '2026-10-10'::date, true) $$, current_setting('test.lpt')),
  'operador A bloqueia a data da própria unidade');
reset role;

-- reserva cobrindo a data bloqueada → rejeitada (a checagem roda antes do preço)
set local role authenticated;
select pg_temp.as_user(current_setting('test.cust'));
select throws_ok(
  format($$ select public.create_booking_atomic(%L::uuid, %L::uuid,
    '2026-10-10T12:00:00Z'::timestamptz, '2026-10-11T12:00:00Z'::timestamptz) $$,
    current_setting('test.cust'), current_setting('test.lpt')),
  'P0001', null, 'reserva em data bloqueada é rejeitada');
reset role;

-- operador A desbloqueia → reserva passa
set local role authenticated;
select pg_temp.as_user(current_setting('test.op_a'));
select public.operator_set_date_blocked(current_setting('test.lpt')::uuid, '2026-10-10'::date, false);
reset role;

set local role authenticated;
select pg_temp.as_user(current_setting('test.cust'));
select ok(
  (public.create_booking_atomic(current_setting('test.cust')::uuid, current_setting('test.lpt')::uuid,
    '2026-10-10T12:00:00Z'::timestamptz, '2026-10-11T12:00:00Z'::timestamptz) ->> 'code') is not null,
  'após desbloquear, a reserva é criada');
reset role;

select * from finish();
rollback;
