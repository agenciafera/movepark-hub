-- pgTAP: motor de descontos automáticos (migration discount_engine).
-- Cobre operator_upsert/set_active/delete_discount, guard de escopo e discount_evaluate
-- (best-pick + condições: min_days, min_amount, advance_days). O fluxo de preço/booking
-- end-to-end é coberto por test:int + validação por rollback no staging.
-- Rodar com: supabase test db. Transação + rollback.

begin;
select plan(12);

-- ── Fixture: company aprovada + operator vinculado + jwt + location ─────────
do $$
declare v_cid uuid; v_uid uuid := gen_random_uuid(); v_lid uuid;
begin
  v_cid := public.submit_partner_lead('Estac Desc QA','Op QA','qa-disc@example.com','+5511977770000');
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (v_uid, '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
            'qa-disc-op@example.com', now(), now());
  insert into public.profiles(id, role) values (v_uid, 'company_operator') on conflict (id) do nothing;
  update public.company set onboarding_status='approved' where id=v_cid;
  insert into public.profile_company(profile_id, company_id) values (v_uid, v_cid);
  perform set_config('test.cid', v_cid::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);
  v_lid := public.onboarding_upsert_location(v_cid, null, 'Unidade QA', 'Rua X', -23.5, -46.6,
            'America/Sao_Paulo', null, null, null, '[]'::jsonb);
  perform set_config('test.lid', v_lid::text, true);
end $$;

-- ── Criação ─────────────────────────────────────────────────────────────────
do $$
declare v_id uuid;
begin
  v_id := public.operator_upsert_discount(
    current_setting('test.cid')::uuid, null, current_setting('test.lid')::uuid, 'Promo 20', null,
    'percent', 20, null, null, null, null, null, true, 0, true, 0, null);
  perform set_config('test.r1', v_id::text, true);
end $$;
select ok(current_setting('test.r1') is not null, 'operator_upsert_discount cria e retorna id');

-- percent > 100 rejeitado
select throws_ok(
  $$ select public.operator_upsert_discount(current_setting('test.cid')::uuid, null, null, 'Bad', null,
       'percent', 150, null, null, null, null, null, true, 0, true, 0, null) $$,
  'P0001', null, 'percent > 100 é rejeitado');

-- ── best-pick: 20% (=20) vence fixo R$5 sobre base 100 ──────────────────────
do $$ begin
  perform public.operator_upsert_discount(current_setting('test.cid')::uuid, null,
    current_setting('test.lid')::uuid, 'Fixo 5', null, 'fixed', 5, null, null, null, null, null, true, 0, true, 0, null);
end $$;
select is(
  (select discount from public.discount_evaluate(current_setting('test.lid')::uuid, null, 100, 3, null)),
  20::numeric, 'best-pick: 20% (20) vence fixo R$5');

-- isola: desativa todas as regras da empresa
update public.discount_rule set is_active = false
  where company_id = current_setting('test.cid')::uuid;

-- ── min_days ────────────────────────────────────────────────────────────────
do $$ begin
  perform public.operator_upsert_discount(current_setting('test.cid')::uuid, null,
    current_setting('test.lid')::uuid, 'Long stay', null, 'percent', 10, null, null, 5, null, null, true, 0, true, 0, null);
end $$;
select is(
  (select count(*)::int from public.discount_evaluate(current_setting('test.lid')::uuid, null, 100, 3, null)),
  0, 'min_days: 3 diárias não elegível');
select is(
  (select discount from public.discount_evaluate(current_setting('test.lid')::uuid, null, 100, 5, null)),
  10::numeric, 'min_days: 5 diárias elegível (10% de 100)');
update public.discount_rule set is_active = false where company_id = current_setting('test.cid')::uuid;

-- ── min_amount ──────────────────────────────────────────────────────────────
do $$ begin
  perform public.operator_upsert_discount(current_setting('test.cid')::uuid, null,
    current_setting('test.lid')::uuid, 'Big spend', null, 'percent', 10, null, null, null, 200, null, true, 0, true, 0, null);
end $$;
select is(
  (select count(*)::int from public.discount_evaluate(current_setting('test.lid')::uuid, null, 100, 3, null)),
  0, 'min_amount: base 100 abaixo do mínimo 200 → não elegível');
update public.discount_rule set is_active = false where company_id = current_setting('test.cid')::uuid;

-- ── advance_days (early-bird) ───────────────────────────────────────────────
do $$ begin
  perform public.operator_upsert_discount(current_setting('test.cid')::uuid, null,
    current_setting('test.lid')::uuid, 'Early', null, 'percent', 10, null, null, null, null, 10, true, 0, true, 0, null);
end $$;
select is(
  (select count(*)::int from public.discount_evaluate(current_setting('test.lid')::uuid, null, 100, 3, now() + interval '5 day')),
  0, 'advance_days: check-in em 5d não atinge 10d → não elegível');
select is(
  (select count(*)::int from public.discount_evaluate(current_setting('test.lid')::uuid, null, 100, 3, now() + interval '15 day')),
  1, 'advance_days: check-in em 15d ≥ 10d → elegível');
update public.discount_rule set is_active = false where company_id = current_setting('test.cid')::uuid;

-- ── set_active ──────────────────────────────────────────────────────────────
do $$ begin perform public.operator_set_discount_active(current_setting('test.r1')::uuid, true); end $$;
select is(
  (select is_active from public.discount_rule where id = current_setting('test.r1')::uuid),
  true, 'operator_set_discount_active reativa a regra');

-- ── delete bloqueado quando usado em reserva ────────────────────────────────
do $$
declare v_uid uuid := (current_setting('request.jwt.claims')::json->>'sub')::uuid; v_bid uuid;
begin
  insert into public.booking(code, profile_id, location_id, check_in_at, check_out_at, total_amount, currency, status)
  values ('QA-DISC-1', v_uid, current_setting('test.lid')::uuid, now(), now()+interval '1 day', 80, 'BRL', 'pending')
  returning id into v_bid;
  insert into public.booking_discount(booking_id, discount_rule_id, discount_applied)
  values (v_bid, current_setting('test.r1')::uuid, 20);
end $$;
select throws_ok(
  $$ select public.operator_delete_discount(current_setting('test.r1')::uuid) $$,
  'P0001', null, 'delete bloqueado se desconto já usado em reserva');

-- delete permitido para regra livre
do $$
declare v_id uuid;
begin
  v_id := public.operator_upsert_discount(current_setting('test.cid')::uuid, null, null, 'Livre', null,
    'percent', 5, null, null, null, null, null, true, 0, true, 0, null);
  perform public.operator_delete_discount(v_id);
  perform set_config('test.free', v_id::text, true);
end $$;
select ok(
  not exists(select 1 from public.discount_rule where id = current_setting('test.free')::uuid),
  'delete remove regra não utilizada');

-- ── guard de escopo: usuário fora da empresa → 42501 ────────────────────────
do $$
declare v_other uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (v_other, '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
            'qa-disc-intruso@example.com', now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', v_other)::text, true);
end $$;
select throws_ok(
  $$ select public.operator_upsert_discount(current_setting('test.cid')::uuid, null, null, 'Hack', null,
       'percent', 5, null, null, null, null, null, true, 0, true, 0, null) $$,
  '42501', null, 'usuário fora da empresa recebe 42501');

select * from finish();
rollback;
