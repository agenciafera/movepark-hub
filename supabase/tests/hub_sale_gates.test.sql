-- pgTAP: travas para a primeira venda de um parceiro real pelo Hub (23/09/2026).
-- Plano: docs/superpowers/plans/2026-09-23-venda-pelo-hub-e-beneficios.md
--
-- 1. Checkout abandonado (`expired`) libera a vaga no white-label, como o cancelamento.
-- 2. Unidade de checkout externo não reserva pelo Hub por nenhum caminho.
-- Transação com rollback, sobre o banco vivo.

begin;
select plan(7);

-- ── fixture: uma unidade hub real com o sync WL ligado só dentro desta transação ─────────
do $$
declare
  cust uuid := gen_random_uuid();
  v_lpt uuid; v_cid uuid; r jsonb;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (cust,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','gates-cust@ex.com',now(),now());
  insert into public.profiles(id, role) values (cust,'customer') on conflict (id) do nothing;

  -- A única empresa hub vendável no banco vivo é a Agência Fera (rascunho): lista só nesta transação.
  select lpt.id, c.id into v_lpt, v_cid
    from public.location_parking_type lpt
    join public.location l on l.id = lpt.location_id
    join public.company c on c.id = l.company_id
    join public.pricing_rule pr on pr.location_parking_type_id = lpt.id
   where l.checkout_mode = 'hub' and lpt.is_active and lpt.capacity > 0 and l.status = 'active'
     and c.status = 'active' and c.onboarding_status = 'active' and pr.strategy = 'uniform_by_duration'
   order by c.name, lpt.capacity desc limit 1;
  update public.location set is_listed = true where id = (select location_id from public.location_parking_type where id = v_lpt);
  update public.company set wl_domain = coalesce(wl_domain, 'gates-app.movepark.co'),
         wl_tenant_key = coalesce(wl_tenant_key, 'gates'), wl_sync_enabled = true where id = v_cid;
  update public.location_parking_type set wl_category_slug = 'gates-cat', wl_product_slug = 'gates-prod' where id = v_lpt;
  update public.location_parking_type set capacity = 50 where id = v_lpt;

  r := public.create_booking_atomic(cust, v_lpt, '2027-02-01T12:00:00Z', '2027-02-03T12:00:00Z');
  perform set_config('test.bk', r ->> 'booking_id', false);
  perform set_config('test.cust', cust::text, false);
end $$;

select is((select count(*)::int from public.wl_delivery where event_id = current_setting('test.bk') || ':reserve'), 1,
  'reserva pendente enfileira o reserve para o white-label');

update public.booking set status = 'expired', deleted_at = now() where id = current_setting('test.bk')::uuid;
select is((select count(*)::int from public.wl_delivery where event_id = current_setting('test.bk') || ':release'), 1,
  'checkout abandonado (expired) libera a vaga no white-label');

update public.booking set status = 'cancelled' where id = current_setting('test.bk')::uuid;
select is((select count(*)::int from public.wl_delivery where event_id = current_setting('test.bk') || ':release'), 1,
  'expirada que depois vira cancelada não libera duas vezes');

-- cancelamento direto continua liberando
do $$
declare cust2 uuid := gen_random_uuid(); v_lpt uuid; r jsonb;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (cust2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','gates-cust2@ex.com',now(),now());
  insert into public.profiles(id, role) values (cust2,'customer') on conflict (id) do nothing;
  select lpt.id into v_lpt from public.location_parking_type lpt where lpt.wl_category_slug = 'gates-cat';
  r := public.create_booking_atomic(cust2, v_lpt, '2027-02-10T12:00:00Z', '2027-02-11T12:00:00Z');
  perform set_config('test.bk2', r ->> 'booking_id', false);
end $$;
update public.booking set status = 'cancelled', deleted_at = now() where id = current_setting('test.bk2')::uuid;
select is((select count(*)::int from public.wl_delivery where event_id = current_setting('test.bk2') || ':release'), 1,
  'cancelamento continua liberando');

-- ── unidade externa não reserva pelo Hub ───────────────────────────────────
-- O banco do CI nasce do seed, sem parceiro externo: a unidade externa é criada aqui.
do $$
declare v_co uuid; v_loc uuid; v_pt uuid; v_cpt uuid;
begin
  insert into public.company(name, slug, wl_public_domain, wl_domain, wl_tenant_key, wl_sync_enabled)
    values ('Gates Parceiro Externo','gates-parceiro-externo','https://gates.movepark.co/','gates-app.movepark.co','gates', false)
    returning id into v_co;
  insert into public.location(company_id, name, slug, checkout_mode)
    values (v_co, 'Gates Externa','gates-externa','external') returning id into v_loc;
  insert into public.parking_type(code, name) values ('gates_coberta','Gates Coberta') returning id into v_pt;
  insert into public.company_parking_type(company_id, parking_type_id, base_price, default_capacity)
    values (v_co, v_pt, 40, 10) returning id into v_cpt;
  insert into public.location_parking_type(location_id, company_parking_type_id, capacity, is_active, wl_category_slug, wl_product_slug)
    values (v_loc, v_cpt, 10, true, 'gates', 'vaga-coberta');
end $$;
select cmp_ok((select count(*)::int from public.location where checkout_mode = 'external' and deleted_at is null), '>', 0,
  'existe unidade externa no banco (senão o teste seguinte seria vazio)');
select throws_ok(
  format($f$select public.create_booking_atomic(%L::uuid, (select lpt.id from public.location_parking_type lpt join public.location l on l.id = lpt.location_id
      where l.checkout_mode = 'external' and lpt.is_active and l.deleted_at is null limit 1), '2027-03-01T12:00:00Z', '2027-03-02T12:00:00Z')$f$,
    current_setting('test.cust')),
  'P0001', 'Esta unidade reserva pelo site do estacionamento.',
  'unidade de checkout externo não reserva pelo miolo (cobre chat, MCP e API)');
select is((select count(*)::int from public.booking b join public.location l on l.id = b.location_id
            where l.checkout_mode = 'external' and b.profile_id = current_setting('test.cust')::uuid), 0,
  'nenhuma reserva ficou para trás na unidade externa');

select * from finish();
rollback;
