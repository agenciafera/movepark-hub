-- pgTAP: RPCs de serviços adicionais geridos pelo operator (migration add_on_management).
-- Cobre operator_upsert_addon / operator_set_location_addon / operator_delete_addon
-- + guard de escopo (addon_assert_company_access).
-- Rodar com: supabase test db (stack local — ver README.md). Transação + rollback.

begin;
select plan(12);

-- ── Fixture: company aprovada + operator vinculado + jwt ────────────────────
do $$
declare v_cid uuid; v_uid uuid := gen_random_uuid();
begin
  v_cid := public.submit_partner_lead('Estac Addon QA','Op QA','qa-addon@example.com','+5511988887777');
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (v_uid, '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
            'qa-addon-op@example.com', now(), now());
  insert into public.profiles(id, role) values (v_uid, 'company_operator') on conflict (id) do nothing;
  update public.company set onboarding_status='approved' where id=v_cid;
  insert into public.profile_company(profile_id, company_id) values (v_uid, v_cid);
  perform set_config('test.cid', v_cid::text, true);
  perform set_config('test.uid', v_uid::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);
end $$;

-- ── Criação do catálogo ─────────────────────────────────────────────────────
do $$
declare v_aid uuid;
begin
  v_aid := public.operator_upsert_addon(
    current_setting('test.cid')::uuid, null, null, 'Lava-jato', 'Lavagem externa', 30, true, 0);
  perform set_config('test.aid', v_aid::text, true);
end $$;

select ok(current_setting('test.aid') is not null, 'operator_upsert_addon cria e retorna id');
select is(
  (select code from public.add_on_service where id = current_setting('test.aid')::uuid),
  'lava-jato', 'code é slugificado a partir do nome');
select is(
  (select is_active from public.add_on_service where id = current_setting('test.aid')::uuid),
  true, 'serviço criado ativo por padrão');
select is(
  (select sort_order from public.add_on_service where id = current_setting('test.aid')::uuid),
  0, 'sort_order default 0');

-- nome obrigatório
select throws_ok(
  $$ select public.operator_upsert_addon(current_setting('test.cid')::uuid, null, null, '   ', null, 10, true, 0) $$,
  'P0001', null, 'nome em branco é rejeitado');

-- ── Edição por id ───────────────────────────────────────────────────────────
do $$ begin
  perform public.operator_upsert_addon(
    current_setting('test.cid')::uuid, current_setting('test.aid')::uuid, null,
    'Lava-jato Premium', 'Completa', 45, true, 1);
end $$;
select is(
  (select name from public.add_on_service where id = current_setting('test.aid')::uuid),
  'Lava-jato Premium', 'update por id altera o nome');

-- ── Disponibilidade por unidade ─────────────────────────────────────────────
do $$
declare v_lid uuid;
begin
  v_lid := public.onboarding_upsert_location(
    current_setting('test.cid')::uuid, null, 'Unidade QA', 'Rua X', -23.5, -46.6,
    'America/Sao_Paulo', null, null, null, '[]'::jsonb);
  perform set_config('test.lid', v_lid::text, true);
  perform public.operator_set_location_addon(
    current_setting('test.aid')::uuid, v_lid, true, 50);
end $$;

select is(
  (select is_active from public.location_add_on_service
   where add_on_service_id = current_setting('test.aid')::uuid
     and location_id = current_setting('test.lid')::uuid),
  true, 'serviço habilitado na unidade');
select is(
  (select price_override from public.location_add_on_service
   where add_on_service_id = current_setting('test.aid')::uuid
     and location_id = current_setting('test.lid')::uuid),
  50::numeric, 'price_override persistido por unidade');

-- unidade de outra empresa (uuid aleatório) é rejeitada
select throws_ok(
  $$ select public.operator_set_location_addon(current_setting('test.aid')::uuid, gen_random_uuid(), true, null) $$,
  'P0001', null, 'unidade fora da empresa é rejeitada');

-- ── Exclusão bloqueada quando usada em reserva ──────────────────────────────
do $$
declare v_bid uuid;
begin
  insert into public.booking(code, profile_id, location_id, check_in_at, check_out_at)
  values ('QA-ADDON-1', current_setting('test.uid')::uuid, current_setting('test.lid')::uuid,
          now(), now() + interval '1 day')
  returning id into v_bid;
  insert into public.booking_item(booking_id, item_type, add_on_service_id, unit_price, subtotal)
  values (v_bid, 'add_on', current_setting('test.aid')::uuid, 45, 45);
end $$;

select throws_ok(
  $$ select public.operator_delete_addon(current_setting('test.aid')::uuid) $$,
  'P0001', null, 'delete bloqueado se serviço já usado em reserva');

-- ── Exclusão permitida para serviço sem reserva ─────────────────────────────
do $$
declare v_aid2 uuid;
begin
  v_aid2 := public.operator_upsert_addon(
    current_setting('test.cid')::uuid, null, null, 'Enceramento', null, 20, true, 2);
  perform public.operator_delete_addon(v_aid2);
  perform set_config('test.aid2', v_aid2::text, true);
end $$;
select ok(
  not exists(select 1 from public.add_on_service where id = current_setting('test.aid2')::uuid),
  'delete remove serviço não utilizado');

-- ── Guard de escopo: usuário fora da empresa não gerencia ───────────────────
do $$
declare v_other uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (v_other, '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
            'qa-addon-intruso@example.com', now(), now());
  insert into public.profiles(id, role) values (v_other, 'company_operator') on conflict (id) do nothing;
  perform set_config('request.jwt.claims', json_build_object('sub', v_other)::text, true);
end $$;
select throws_ok(
  $$ select public.operator_upsert_addon(current_setting('test.cid')::uuid, null, null, 'Hack', null, 1, true, 0) $$,
  '42501', null, 'usuário fora da empresa recebe 42501');

select * from finish();
rollback;
