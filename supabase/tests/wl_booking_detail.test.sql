-- pgTAP: detalhe da reserva do site white-label (reservas unificadas, fase 3, 09/10/2026).
-- Migration: 20261129110000_wl_booking_detalhe.sql. Spec: reservas-unificadas-hub-wl.md § 4.2.
--
-- O que este arquivo protege:
--   1. quem tem white-label abre a reserva do site, com o status no vocabulário do Hub (D2) e o
--      do site junto;
--   2. a linha do tempo traz as ações do Hub com quem fez, e a equipe da Movepark aparece sem nome;
--   3. outra empresa (e empresa sem white-label) não abre, nem lê o log das ações;
--   4. a anon key não executa.

begin;
select plan(9);

do $$
declare
  v_owner_a uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_a uuid; v_b uuid; v_w uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (v_owner_a,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','wbd-a@ex.com',now(),now()),
    (v_owner_b,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','wbd-b@ex.com',now(),now()),
    (v_admin,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','wbd-adm@ex.com',now(),now());
  insert into public.profiles(id, role, first_name, last_name) values
    (v_owner_a,'company_operator','Dona','Alfa'), (v_owner_b,'company_operator','Dono','Beta'),
    (v_admin,'hub_admin','Pessoa','Admin')
    on conflict (id) do update set role = excluded.role, first_name = excluded.first_name, last_name = excluded.last_name;

  insert into public.company(name, slug, wl_domain, wl_tenant_key)
    values ('WBD Com Site', 'wbd-com-site', 'wbd-app.movepark.co', 'wbd') returning id into v_a;
  insert into public.company(name, slug) values ('WBD Só Hub', 'wbd-so-hub') returning id into v_b;
  insert into public.profile_company(profile_id, company_id, role) values (v_owner_a, v_a, 'owner'), (v_owner_b, v_b, 'owner');

  insert into public.wl_booking(company_id, wl_order_id, wl_order_number, wl_status, status, attendance_status,
                                check_in_at, check_out_at, license_plate, paid_total_cents, customer_name, wl_created_at)
    values (v_a, 1, 'WBD-0001', 'complete', 'confirmed', 'compareceu',
            '2026-09-01 08:00+00', '2026-09-03 08:00+00', 'ABC1D23', 15000, 'Caio', '2026-08-20 10:00+00')
    returning id into v_w;

  insert into public.wl_booking_action_log(wl_booking_id, company_id, action, request, requested_by, http_status, result, created_at) values
    (v_w, v_a, 'attendance', '{"status":"compareceu"}', v_admin, 200, 'ok', '2026-09-01 09:00+00'),
    (v_w, v_a, 'license_plate', '{"license_plate":"ABC1D23","reason":"cliente trocou de carro"}', v_owner_a, 200, 'ok', '2026-08-30 09:00+00');

  perform set_config('test.w', v_w::text, false);
  perform set_config('test.owner_a', v_owner_a::text, false);
  perform set_config('test.owner_b', v_owner_b::text, false);
  perform set_config('test.admin', v_admin::text, false);
end $$;

set local role authenticated;

-- ── 1. o dono da empresa com site abre ───────────────────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.owner_a'))::text, true);
create temp table _d on commit drop as select public.wl_booking_detail(current_setting('test.w')::uuid) d;
select is((select d->>'wl_order_number' from _d), 'WBD-0001', 'o dono da empresa com site abre a reserva');
select is((select d->>'status' from _d), 'completed', 'status no vocabulário do Hub (pago, compareceu, já saiu)');
select is((select d->>'site_status' from _d), 'confirmed', 'e o status do site junto, para as ações');

-- ── 2. linha do tempo ────────────────────────────────────────────────────────
select is((select jsonb_array_length(d->'actions') from _d), 2, 'as duas ações do Hub, mais recente primeiro');
select is((select d->'actions'->0->>'by_name' from _d), 'Equipe Movepark', 'ação da equipe Movepark aparece sem o nome para o parceiro');
select is((select d->'actions'->1->>'by_name' from _d), 'Dona Alfa', 'ação do próprio usuário aparece com o nome');

-- ── 3. outra empresa não abre ────────────────────────────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.owner_b'))::text, true);
select ok(public.wl_booking_detail(current_setting('test.w')::uuid) is null, 'empresa de fora não abre');
select is((select count(*)::int from public.wl_booking_action_log), 0, 'nem lê o log das ações');
reset role;

-- ── 4. anon ──────────────────────────────────────────────────────────────────
select ok(not has_function_privilege('anon', 'public.wl_booking_detail(uuid)', 'execute'), 'a anon key não executa');

select * from finish();
rollback;
