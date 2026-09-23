-- pgTAP: garantia de vaga acionada e prioridade por telefone (23/09/2026).
-- Specs: docs/specs/spot-guarantee.md, docs/specs/tarifas-operacao.md. Transação com rollback.

begin;
select plan(14);

do $$
declare cust uuid := gen_random_uuid(); adm uuid := gen_random_uuid(); outro uuid := gen_random_uuid(); v_lpt uuid; r jsonb;
begin
  insert into auth.users(id, instance_id, aud, role, email, phone, created_at, updated_at) values
    (cust,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','gar-cust@ex.com','5541900000001',now(),now()),
    (adm, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','gar-adm@ex.com',null,now(),now()),
    (outro,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','gar-outro@ex.com',null,now(),now());
  insert into public.profiles(id, role) values (cust,'customer'), (outro,'customer') on conflict (id) do nothing;
  insert into public.profiles(id, role) values (adm,'hub_admin') on conflict (id) do update set role = 'hub_admin';
  select lpt.id into v_lpt
    from public.location_parking_type lpt
    join public.location l on l.id = lpt.location_id
    join public.company c on c.id = l.company_id
    join public.pricing_rule pr on pr.location_parking_type_id = lpt.id
   where l.checkout_mode = 'hub' and lpt.is_active and lpt.capacity > 0 and l.status = 'active'
     and c.status = 'active' and c.onboarding_status = 'active' and pr.strategy = 'uniform_by_duration'
   order by c.name, lpt.capacity desc limit 1;
  update public.location set is_listed = true where id = (select location_id from public.location_parking_type where id = v_lpt);
  r := public.create_booking_atomic(cust, v_lpt, now() + interval '5 days', now() + interval '7 days', null, false, null, null, null, null, 'superflex');
  update public.booking set status = 'confirmed', check_in_at = now() + interval '1 hour', check_out_at = now() + interval '2 days',
         customer_phone = '+55 (41) 98814-9449' where id = (r ->> 'booking_id')::uuid;
  perform set_config('test.bk', r ->> 'booking_id', false);
  perform set_config('test.code', r ->> 'code', false);
  perform set_config('test.cust', cust::text, false);
  perform set_config('test.adm', adm::text, false);
  perform set_config('test.outro', outro::text, false);
end $$;

-- ── prioridade por telefone (service_role) ──────────────────────────────────
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(public.booking_priority_for_phones(array['5541988149449']) -> '5541988149449' ->> 'tier', 'superflex',
  'telefone do snapshot da reserva casa, sem pontuação, e traz a tarifa');
select is((public.booking_priority_for_phones(array['+55 41 98814-9449']) -> '5541988149449' ->> 'sla_minutos')::int, 15,
  'o SLA vem da configuração (15 min)');
select is(public.booking_priority_for_phones(array['5541900000001']) -> '5541900000001' ->> 'reserva', current_setting('test.code'),
  'o telefone da conta (auth.users) também casa');
select is(public.booking_priority_for_phones(array['5511999999999']), '{}'::jsonb, 'telefone sem reserva ativa não tem prioridade');
update public.booking set fare_benefits = fare_benefits || '{"priority_support": false}'::jsonb where id = current_setting('test.bk')::uuid;
select is(public.booking_priority_for_phones(array['5541988149449']), '{}'::jsonb, 'sem o benefício, sem prioridade');
update public.booking set fare_benefits = fare_benefits || '{"priority_support": true}'::jsonb where id = current_setting('test.bk')::uuid;

-- ── garantia: o cliente aciona ──────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.outro'), 'role', 'authenticated')::text, true);
select throws_ok(format('select public.claim_spot_guarantee(%L)', current_setting('test.code')), 'P0002', null, 'outra pessoa não aciona a garantia da reserva');

select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.cust'), 'role', 'authenticated')::text, true);
select lives_ok(format('select public.claim_spot_guarantee(%L)', current_setting('test.code')), 'o dono aciona a 1h do check-in');
select is((select count(*)::int from public.guarantee_claim where booking_id = current_setting('test.bk')::uuid and status = 'open'), 1, 'fica um acionamento aberto');
select lives_ok(format('select public.claim_spot_guarantee(%L)', current_setting('test.code')), 'acionar de novo não duplica');
select is((select count(*)::int from public.guarantee_claim where booking_id = current_setting('test.bk')::uuid), 1, 'continua um só');
select is((select count(*)::int from public.guarantee_claim), (select count(*)::int from public.guarantee_claim gc join public.booking b on b.id = gc.booking_id where b.profile_id = current_setting('test.cust')::uuid),
  'o cliente só enxerga os acionamentos das reservas dele');

select throws_ok(format('select public.admin_resolve_guarantee_claim(%L::uuid, %L, 1500, %L)', (select id from public.guarantee_claim where booking_id = current_setting('test.bk')::uuid), 'refunded', 'x'),
  '42501', null, 'cliente não fecha acionamento');

-- ── a Movepark fecha ────────────────────────────────────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.adm'), 'role', 'authenticated')::text, true);
select lives_ok(format('select public.admin_resolve_guarantee_claim(%L::uuid, %L, 1500, %L)', (select id from public.guarantee_claim where booking_id = current_setting('test.bk')::uuid), 'relocated', 'realocado no vizinho, diferença de R$ 15'),
  'hub_admin fecha com desfecho, valor e nota');
select is((select status || '|' || covered_cents from public.guarantee_claim where booking_id = current_setting('test.bk')::uuid), 'relocated|1500', 'o desfecho fica registrado');
reset role;

select * from finish();
rollback;
