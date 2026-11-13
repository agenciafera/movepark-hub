-- pgTAP: ocupação por dia, Hub e white-label (13/11/2026).
-- Migration: 20261203170000_ocupacao_diaria.sql. Spec: docs/specs/operator-panel.md (Ocupação por dia).
--
-- O que este arquivo protege:
--   1. o site conta pelo espelho (`wl_booking`), sem depender da sincronização de disponibilidade;
--   2. a regra de datas é a do booked_count: do dia da entrada até o dia anterior a uma saída à
--      meia-noite, e o dia da saída conta quando a saída é depois da meia-noite;
--   3. só conta o que virou venda (Hub confirmed/checked_in/completed; site confirmed, sem duplicada);
--   4. capacidade soma os tipos ativos e tira o tipo bloqueado no dia;
--   5. membro de outra empresa não vê a unidade, e a anon não executa.

begin;
select plan(9);

do $$
declare
  v_owner uuid := gen_random_uuid();
  v_outro uuid := gen_random_uuid();
  v_cust uuid := gen_random_uuid();
  v_c uuid; v_c2 uuid; v_loc uuid := gen_random_uuid(); v_pt uuid; v_cpt uuid; v_lpt_a uuid; v_lpt_b uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (v_owner,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','occd-a@ex.com',now(),now()),
    (v_outro,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','occd-b@ex.com',now(),now()),
    (v_cust,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','occd-c@ex.com',now(),now());
  insert into public.profiles(id, role) values
    (v_owner,'company_operator'), (v_outro,'company_operator'), (v_cust,'customer')
    on conflict (id) do update set role = excluded.role;

  insert into public.company(name, slug, wl_domain, wl_tenant_key)
    values ('OCCD Com Site', 'occd-com-site', 'occd-app.movepark.co', 'occd') returning id into v_c;
  insert into public.company(name, slug) values ('OCCD Outra', 'occd-outra') returning id into v_c2;
  insert into public.profile_company(profile_id, company_id, role) values (v_owner, v_c, 'owner'), (v_outro, v_c2, 'owner');
  insert into public.location(id, company_id, name, slug) values (v_loc, v_c, 'OCCD Pátio', 'occd-patio');

  select id into v_pt from public.parking_type limit 1;
  insert into public.company_parking_type(company_id, parking_type_id, base_price, default_capacity, is_active)
    values (v_c, v_pt, 50, 10, true) returning id into v_cpt;
  insert into public.location_parking_type(location_id, company_parking_type_id, capacity, is_active)
    values (v_loc, v_cpt, 10, true) returning id into v_lpt_a;
  insert into public.location_parking_type(location_id, company_parking_type_id, capacity, is_active)
    values (v_loc, v_cpt, 5, true) returning id into v_lpt_b;
  -- O tipo B fica bloqueado no dia 12: a capacidade do dia é só a do A.
  insert into public.location_parking_availability(location_parking_type_id, date, booked_count, blocked)
    values (v_lpt_b, '2027-11-12', 0, true);

  -- Hub: confirmada de 10/11 10h a 12/11 10h (ocupa 10, 11 e 12); pendente e cancelada não contam.
  insert into public.booking(code, location_id, profile_id, status, check_in_at, check_out_at, total_amount, customer_name) values
    ('OCCDH1', v_loc, v_cust, 'confirmed', '2027-11-10 10:00+00', '2027-11-12 10:00+00', 100, 'Ana'),
    ('OCCDH2', v_loc, v_cust, 'pending',   '2027-11-10 10:00+00', '2027-11-12 10:00+00', 100, 'Bia'),
    ('OCCDH3', v_loc, v_cust, 'cancelled', '2027-11-10 10:00+00', '2027-11-12 10:00+00', 100, 'Caio');

  -- Site: confirmada de 11/11 8h até 13/11 00:00 (ocupa 11 e 12, não 13); cancelada não conta.
  insert into public.wl_booking(company_id, location_id, wl_order_id, wl_order_number, status, check_in_at, check_out_at, wl_created_at) values
    (v_c, v_loc, 1, 'OCCD-1', 'confirmed', '2027-11-11 08:00+00', '2027-11-13 00:00+00', '2027-10-01 12:00+00'),
    (v_c, v_loc, 2, 'OCCD-2', 'cancelled', '2027-11-11 08:00+00', '2027-11-13 00:00+00', '2027-10-01 12:00+00');
  -- Pedido duplicado no site (mesmo carro, outro número): não conta.
  insert into public.wl_booking(company_id, location_id, wl_order_id, wl_order_number, status, check_in_at, check_out_at, wl_created_at, is_duplicate) values
    (v_c, v_loc, 3, 'OCCD-3', 'confirmed', '2027-11-11 08:00+00', '2027-11-13 00:00+00', '2027-10-01 12:00+00', true);

  perform set_config('test.loc', v_loc::text, false);
  perform set_config('test.owner', v_owner::text, false);
  perform set_config('test.outro', v_outro::text, false);
end $$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.owner'))::text, true);
create temp table _d on commit drop as
  select * from public.location_occupancy_daily('2027-11-10', '2027-11-13', array[current_setting('test.loc')::uuid]);

select is((select count(*)::int from _d), 4, 'um dia por data do intervalo, inclusive nas pontas');
select is((select hub from _d where date = '2027-11-12'), 1,
  'Hub ocupa até o dia da saída quando ela é depois da meia-noite; pendente e cancelada não contam');
select is((select hub from _d where date = '2027-11-13'), 0, 'Hub não ocupa depois do dia da saída');
select is((select wl from _d where date = '2027-11-11'), 1, 'o site conta pelo espelho, só a confirmada e não duplicada');
select is((select wl from _d where date = '2027-11-13'), 0, 'saída à meia-noite não ocupa o dia da saída');
select is((select capacity from _d where date = '2027-11-11'), 15, 'capacidade soma os tipos ativos');
select is((select capacity from _d where date = '2027-11-12'), 10, 'tipo bloqueado no dia sai da capacidade');

select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.outro'))::text, true);
select is(
  (select coalesce(sum(capacity + hub + wl), 0)::int
     from public.location_occupancy_daily('2027-11-10', '2027-11-13', array[current_setting('test.loc')::uuid])),
  0, 'membro de outra empresa não vê a unidade');

reset role;
select ok(not has_function_privilege('anon', 'public.location_occupancy_daily(date, date, uuid[])', 'execute'),
  'a anon key não executa');

select * from finish();
rollback;
