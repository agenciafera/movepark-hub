-- pgTAP: ações do Hub sobre a reserva do site white-label (fase 4, 08/10/2026).
-- Migration: 20261128235500_wl_booking_actions.sql. Spec: reservas-wl-no-hub.md § 10.
--
-- O que este arquivo protege:
--   1. com a chave desligada, ninguém age (nem hub_admin), e a tela sabe que está desligada;
--   2. check-in/no-show exigem bookings:checkin e troca de placa exige bookings:write: o
--      Financeiro vê a reserva do site mas não opera;
--   3. membro de outra empresa não age;
--   4. o contexto devolve o que a Edge precisa (pedido, domínio, tenant, quem pediu);
--   5. só o que o legado aceitou muda a linha local, e toda tentativa deixa log;
--   6. a gravação é só do servidor.

begin;
select plan(14);

do $$
declare
  v_owner uuid := gen_random_uuid();
  v_finance uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_a uuid;
  v_b uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (v_owner,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','wlba-owner@ex.com',now(),now()),
    (v_finance,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','wlba-fin@ex.com',now(),now()),
    (v_other,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','wlba-other@ex.com',now(),now());
  -- full_name é coluna gerada a partir de first_name + last_name.
  insert into public.profiles(id, role, first_name, last_name) values
    (v_owner,'company_operator','Dona','Ana'), (v_finance,'company_operator','Fin',null), (v_other,'company_operator','Outro',null)
    on conflict (id) do update set role = excluded.role, first_name = excluded.first_name, last_name = excluded.last_name;

  insert into public.company(name, slug, wl_domain, wl_tenant_key)
    values ('WLBA A', 'wlba-a', 'wlba-a-app.movepark.co', 'wlbaa') returning id into v_a;
  insert into public.company(name, slug, wl_domain, wl_tenant_key)
    values ('WLBA B', 'wlba-b', 'wlba-b-app.movepark.co', 'wlbab') returning id into v_b;
  insert into public.profile_company(profile_id, company_id, role) values
    (v_owner, v_a, 'owner'), (v_finance, v_a, 'finance'), (v_other, v_b, 'owner');

  perform public.wl_booking_apply_page(v_a, jsonb_build_array(
    jsonb_build_object('id', 1, 'order_number', 'WLBA-0001', 'status', jsonb_build_object('code', 'complete'),
      'license_plate', 'ABC1D23', 'initial_date', '2027-11-10 08:00:00', 'final_date', '2027-11-12 08:00:00',
      'attendance_status', 'pendente',
      'category', jsonb_build_object('slug', 'x'), 'product_slug', 'y',
      'customer', jsonb_build_object('name', 'Ana'), 'utm', jsonb_build_object(),
      'created_at', '2027-11-01 10:00:00', 'updated_at', '2027-11-01 10:00:00')
  ), '2027-11-01 10:00:00', 1);

  perform set_config('test.a', v_a::text, false);
  perform set_config('test.booking', (select id::text from public.wl_booking where company_id = v_a), false);
  perform set_config('test.owner', v_owner::text, false);
  perform set_config('test.finance', v_finance::text, false);
  perform set_config('test.other', v_other::text, false);
end $$;

-- ── 1. desligada ─────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.owner'))::text, true);
select is(
  public.wl_booking_action_context(current_setting('test.booking')::uuid, 'attendance') ->> 'reason',
  'disabled', 'com a chave desligada, ninguém age');
select is(
  public.wl_booking_my_actions(current_setting('test.a')::uuid) ->> 'enabled',
  'false', 'a tela sabe que está desligada');
reset role;

update public.app_setting
   set value = (value::jsonb || '{"actions_enabled": true}'::jsonb)::text
 where key = 'wl_booking_import';

-- ── 2 e 4. o Dono age, e o contexto traz o que a Edge precisa ────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.owner'))::text, true);
select is(
  (select c ->> 'ok' || '|' || (c ->> 'wl_order_number') || '|' || (c ->> 'wl_tenant_key') || '|' || (c ->> 'actor')
     from (select public.wl_booking_action_context(current_setting('test.booking')::uuid, 'attendance') c) x),
  'true|WLBA-0001|wlbaa|Dona Ana', 'o Dono marca comparecimento, e o contexto traz pedido, tenant e quem pediu');
select is(
  public.wl_booking_action_context(current_setting('test.booking')::uuid, 'license_plate') ->> 'ok',
  'true', 'o Dono troca placa');
select is(
  public.wl_booking_action_context(current_setting('test.booking')::uuid, 'cancelar') ->> 'reason',
  'invalid_action', 'ação desconhecida é recusada');

-- ── 2. o Financeiro vê mas não opera ─────────────────────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.finance'))::text, true);
select is(
  public.wl_booking_action_context(current_setting('test.booking')::uuid, 'attendance') ->> 'reason',
  'forbidden', 'o Financeiro não marca comparecimento');
select is(
  public.wl_booking_action_context(current_setting('test.booking')::uuid, 'license_plate') ->> 'reason',
  'forbidden', 'nem troca placa');
select is(
  public.wl_booking_my_actions(current_setting('test.a')::uuid),
  '{"enabled": true, "attendance": false, "license_plate": false}'::jsonb,
  'a tela do Financeiro não mostra os botões');

-- ── 3. outra empresa ─────────────────────────────────────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.other'))::text, true);
select is(
  public.wl_booking_action_context(current_setting('test.booking')::uuid, 'attendance') ->> 'reason',
  'forbidden', 'dono de outra empresa não age');
reset role;

-- ── 5. reflexo local e log ───────────────────────────────────────────────────
select public.wl_booking_record_action(
  current_setting('test.booking')::uuid, 'attendance', '{"status": "no_show"}'::jsonb,
  current_setting('test.owner')::uuid, 409, 'refused', 'not_eligible', 'Só pedido pago', 'no_show', null);
select is(
  (select attendance_status from public.wl_booking where id = current_setting('test.booking')::uuid),
  'pendente', 'recusa do legado não muda a linha local');

select public.wl_booking_record_action(
  current_setting('test.booking')::uuid, 'license_plate', '{"license_plate": "XYZ9K88"}'::jsonb,
  current_setting('test.owner')::uuid, 200, 'ok', null, null, null, 'XYZ9K88');
select is(
  (select license_plate from public.wl_booking where id = current_setting('test.booking')::uuid),
  'XYZ9K88', 'o que o legado aceitou aparece na hora');
select is(
  (select count(*)::int from public.wl_booking_action_log where wl_booking_id = current_setting('test.booking')::uuid),
  2, 'toda tentativa deixa log, aceita ou recusada');

-- o Dono lê o log da própria empresa; o de outra empresa não
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.other'))::text, true);
select is((select count(*)::int from public.wl_booking_action_log), 0, 'outra empresa não lê o log');
reset role;

-- ── 6. gravação só do servidor ───────────────────────────────────────────────
select ok(
  not has_function_privilege('authenticated', 'public.wl_booking_record_action(uuid, text, jsonb, uuid, integer, text, text, text, text, text)', 'execute')
  and not has_function_privilege('anon', 'public.wl_booking_action_context(uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.wl_booking_my_actions(uuid)', 'execute')
  and not has_table_privilege('anon', 'public.wl_booking_action_log', 'select'),
  'só o servidor grava, e a anon key não alcança');

select * from finish();
rollback;
