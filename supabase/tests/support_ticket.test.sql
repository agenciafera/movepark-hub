-- pgTAP: chamado de atendimento e suporte prioritário fora do catálogo (25/09/2026).
-- Spec: docs/specs/chamado-de-atendimento.md. Transação com rollback.

begin;
select plan(12);

do $$
declare cust uuid := gen_random_uuid(); adm uuid := gen_random_uuid(); outro uuid := gen_random_uuid(); v_lpt uuid; r jsonb; v_ticket uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (cust,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','ch-cust@ex.com',now(),now()),
    (adm, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','ch-adm@ex.com',now(),now()),
    (outro,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','ch-outro@ex.com',now(),now());
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
  r := public.create_booking_atomic(cust, v_lpt, now() + interval '5 days', now() + interval '7 days', null, false, null, null, null, null, 'flex');
  insert into public.support_ticket(booking_id, profile_id, kind, message, phone)
    values ((r ->> 'booking_id')::uuid, cust, 'complaint', 'O portão estava fechado quando cheguei.', '5541988149449')
    returning id into v_ticket;
  perform set_config('test.bk', r ->> 'booking_id', false);
  perform set_config('test.ticket', v_ticket::text, false);
  perform set_config('test.cust', cust::text, false);
  perform set_config('test.adm', adm::text, false);
  perform set_config('test.outro', outro::text, false);
end $$;

-- ── catálogo: suporte prioritário fora ───────────────────────────────────────
select is((select count(*)::int from public.fare where (benefits ->> 'priority_support')::boolean), 0,
  'nenhuma tarifa do catálogo promete suporte prioritário');
select is((select value from public.app_setting where key = 'support_inbox'), 'contato@movepark.co', 'a caixa da equipe está configurada');

-- ── código e estado ──────────────────────────────────────────────────────────
select ok((select code from public.support_ticket where id = current_setting('test.ticket')::uuid) ~ '^CH-[A-HJ-NP-Z2-9]{6}$', 'código legível CH-XXXXXX');
select is((select status from public.support_ticket where id = current_setting('test.ticket')::uuid), 'open', 'nasce aberto');
select throws_ok(format('insert into public.support_ticket(booking_id, profile_id, kind, message) values (%L, %L, ''complaint'', ''curto'')', current_setting('test.bk'), current_setting('test.cust')), '23514', null, 'mensagem curta demais é recusada');

-- ── RLS ──────────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.cust'), 'role', 'authenticated')::text, true);
select is((select count(*)::int from public.support_ticket where id = current_setting('test.ticket')::uuid), 1, 'o cliente vê o próprio chamado');
select throws_ok(format('select public.admin_close_support_ticket(%L)', current_setting('test.ticket')), '42501', null, 'o cliente não encerra');
select is(public.open_support_ticket_count(), 0, 'o cliente não vê a contagem da equipe');

select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.outro'), 'role', 'authenticated')::text, true);
select is((select count(*)::int from public.support_ticket where id = current_setting('test.ticket')::uuid), 0, 'outra pessoa não vê o chamado');

select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.adm'), 'role', 'authenticated')::text, true);
select cmp_ok(public.open_support_ticket_count(), '>=', 1, 'hub_admin vê a contagem de abertos');
select lives_ok(format('select public.admin_close_support_ticket(%L)', current_setting('test.ticket')), 'hub_admin encerra');
select is((select status || ':' || (closed_by = current_setting('test.adm')::uuid)::text from public.support_ticket where id = current_setting('test.ticket')::uuid), 'closed:true', 'fica encerrado, com quem encerrou');

select * from finish();
rollback;
