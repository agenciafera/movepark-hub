-- pgTAP: motor de cupons (migration coupon_engine).
-- Cobre operator_upsert_coupon / operator_set_coupon_active / operator_delete_coupon,
-- coupon_evaluate (regra + cálculo), guard de escopo e o trigger de incremento no pagamento.
-- Rodar com: supabase test db (stack local — ver README.md). Transação + rollback.

begin;
select plan(14);

-- ── Fixture: company aprovada + operator vinculado + jwt + location ─────────
do $$
declare v_cid uuid; v_uid uuid := gen_random_uuid(); v_lid uuid;
begin
  v_cid := public.submit_partner_lead('Estac Cupom QA','Op QA','qa-coupon@example.com','+5511988880000');
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (v_uid, '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
            'qa-coupon-op@example.com', now(), now());
  insert into public.profiles(id, role) values (v_uid, 'company_operator') on conflict (id) do nothing;
  update public.company set onboarding_status='approved' where id=v_cid;
  insert into public.profile_company(profile_id, company_id) values (v_uid, v_cid);
  perform set_config('test.cid', v_cid::text, true);
  perform set_config('test.uid', v_uid::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);
  v_lid := public.onboarding_upsert_location(v_cid, null, 'Unidade QA', 'Rua X', -23.5, -46.6,
            'America/Sao_Paulo', null, null, null, '[]'::jsonb);
  perform set_config('test.lid', v_lid::text, true);
end $$;

-- ── Criação do catálogo (code normalizado UPPERCASE) ────────────────────────
do $$
declare v_id uuid;
begin
  v_id := public.operator_upsert_coupon(
    current_setting('test.cid')::uuid, null, 'promo10', 'Dez por cento',
    'percent', 10, null, null, 100, true, 0, null, null, null, null);
  perform set_config('test.coup', v_id::text, true);
end $$;

select ok(current_setting('test.coup') is not null, 'operator_upsert_coupon cria e retorna id');
select is(
  (select code from public.coupon where id = current_setting('test.coup')::uuid),
  'PROMO10', 'code é normalizado para UPPERCASE');
select is(
  (select is_active from public.coupon where id = current_setting('test.coup')::uuid),
  true, 'cupom criado ativo');

-- percent > 100 rejeitado
select throws_ok(
  $$ select public.operator_upsert_coupon(current_setting('test.cid')::uuid, null, 'BAD', null,
       'percent', 150, null, null, null, true, 0, null, null, null, null) $$,
  'P0001', null, 'percent > 100 é rejeitado');

-- valor negativo rejeitado
select throws_ok(
  $$ select public.operator_upsert_coupon(current_setting('test.cid')::uuid, null, 'NEG', null,
       'fixed', -5, null, null, null, true, 0, null, null, null, null) $$,
  'P0001', null, 'desconto negativo é rejeitado');

-- ── coupon_evaluate: cálculo percent ────────────────────────────────────────
select is(
  (select discount from public.coupon_evaluate('promo10', current_setting('test.lid')::uuid,
     current_setting('test.uid')::uuid, 100, 3, null)),
  10::numeric, 'percent: 10% de 100 = 10');

-- fixed: least(value, subtotal)
do $$
declare v_id uuid;
begin
  v_id := public.operator_upsert_coupon(current_setting('test.cid')::uuid, null, 'off50', '',
    'fixed', 50, null, null, null, true, 0, null, null, null, null);
  perform set_config('test.coup2', v_id::text, true);
end $$;
select is(
  (select discount from public.coupon_evaluate('off50', current_setting('test.lid')::uuid,
     current_setting('test.uid')::uuid, 30, 3, null)),
  30::numeric, 'fixed: least(50, 30) = 30');

-- inativo → error_code inactive
do $$ begin perform public.operator_set_coupon_active(current_setting('test.coup')::uuid, false); end $$;
select is(
  (select error_code from public.coupon_evaluate('promo10', current_setting('test.lid')::uuid,
     current_setting('test.uid')::uuid, 100, 3, null)),
  'inactive', 'cupom inativo → inactive');
do $$ begin perform public.operator_set_coupon_active(current_setting('test.coup')::uuid, true); end $$;

-- código inexistente → invalid
select is(
  (select error_code from public.coupon_evaluate('NOPE', current_setting('test.lid')::uuid,
     current_setting('test.uid')::uuid, 100, 3, null)),
  'invalid', 'código inexistente → invalid');

-- min_amount não atingido → min_amount
do $$
declare v_id uuid;
begin
  v_id := public.operator_upsert_coupon(current_setting('test.cid')::uuid, null, 'min200', '',
    'percent', 10, null, null, null, true, 0, null, 200, null, null);
  perform set_config('test.coup3', v_id::text, true);
end $$;
select is(
  (select error_code from public.coupon_evaluate('min200', current_setting('test.lid')::uuid,
     current_setting('test.uid')::uuid, 100, 3, null)),
  'min_amount', 'subtotal abaixo do mínimo → min_amount');

-- ── Trigger de incremento no pagamento ──────────────────────────────────────
do $$
declare v_bid uuid;
begin
  insert into public.booking(code, profile_id, location_id, check_in_at, check_out_at, total_amount, currency, status)
  values ('QA-CP-1', current_setting('test.uid')::uuid, current_setting('test.lid')::uuid,
          now(), now() + interval '1 day', 90, 'BRL', 'pending')
  returning id into v_bid;
  insert into public.booking_coupon(booking_id, coupon_id, discount_applied)
  values (v_bid, current_setting('test.coup')::uuid, 10);
  insert into public.payment(booking_id, amount, currency, status, provider)
  values (v_bid, 90, 'BRL', 'paid', 'mock');
end $$;
select is(
  (select times_used from public.coupon where id = current_setting('test.coup')::uuid),
  1, 'pagamento pago incrementa times_used (1×)');

-- ── Exclusão: bloqueada se usado, permitida se livre ────────────────────────
select throws_ok(
  $$ select public.operator_delete_coupon(current_setting('test.coup')::uuid) $$,
  'P0001', null, 'delete bloqueado se cupom já usado em reserva');

do $$ begin perform public.operator_delete_coupon(current_setting('test.coup2')::uuid); end $$;
select ok(
  not exists(select 1 from public.coupon where id = current_setting('test.coup2')::uuid),
  'delete remove cupom não utilizado');

-- ── Guard de escopo: usuário fora da empresa → 42501 ────────────────────────
do $$
declare v_other uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (v_other, '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
            'qa-coupon-intruso@example.com', now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', v_other)::text, true);
end $$;
select throws_ok(
  $$ select public.operator_upsert_coupon(current_setting('test.cid')::uuid, null, 'HACK', null,
       'percent', 5, null, null, null, true, 0, null, null, null, null) $$,
  '42501', null, 'usuário fora da empresa recebe 42501');

select * from finish();
rollback;
