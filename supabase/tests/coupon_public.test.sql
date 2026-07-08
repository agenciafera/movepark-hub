-- pgTAP: validate_coupon_public (cupom sem login, campanhas). Valida cupom SEM sessão
-- (profile_id NULL, pula per_user_limit; enforcement real no create_booking_atomic).
-- Usa uma unidade DO SEED que tenha preço (validate_coupon_public chama simulate_price).
-- Rodar com: supabase test db (stack local — ver README.md). Transação + rollback.

begin;
select plan(6);

-- ── Fixture: acha uma unidade precificada do seed + cria 2 cupons na empresa dela ──
do $$
declare v_lpt uuid; v_cid uuid;
begin
  select lpt.id, l.company_id
    into v_lpt, v_cid
  from public.location_parking_type lpt
  join public.location l on l.id = lpt.location_id
  join public.company c on c.id = l.company_id
  join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
  join public.parking_type pt on pt.id = cpt.parking_type_id
  where l.deleted_at is null and lpt.is_active
    and (public.simulate_price(c.slug, l.slug, pt.code, 3) ->> 'price') is not null
  limit 1;

  insert into public.coupon (company_id, code, discount_type, discount_value)
    values (v_cid, 'QAPUBTEST', 'percent', 10);
  insert into public.coupon (company_id, code, discount_type, discount_value, per_user_limit)
    values (v_cid, 'QAPUBLIM', 'percent', 10, 1);

  perform set_config('test.lpt', v_lpt::text, true);
end $$;

-- Anônimo: sem claim de JWT (auth.uid() = null).
select set_config('request.jwt.claims', NULL, true);

-- 1) cupom válido é aceito sem sessão
select is(
  (public.validate_coupon_public('QAPUBTEST', current_setting('test.lpt')::uuid,
     now() + interval '2 days', now() + interval '5 days') ->> 'valid'),
  'true', 'cupom válido aceito sem sessão');

-- 2) desconto calculado > 0
select ok(
  (public.validate_coupon_public('QAPUBTEST', current_setting('test.lpt')::uuid,
     now() + interval '2 days', now() + interval '5 days') ->> 'discount')::numeric > 0,
  'desconto > 0');

-- 3) código é case-insensitive
select is(
  (public.validate_coupon_public('qapubtest', current_setting('test.lpt')::uuid,
     now() + interval '2 days', now() + interval '5 days') ->> 'valid'),
  'true', 'código case-insensitive');

-- 4) per_user_limit NÃO bloqueia o preview anônimo (pula o limite)
select is(
  (public.validate_coupon_public('QAPUBLIM', current_setting('test.lpt')::uuid,
     now() + interval '2 days', now() + interval '5 days') ->> 'valid'),
  'true', 'per_user_limit ignorado no anônimo (enforcement no booking)');

-- 5) código inexistente → invalid
select is(
  (public.validate_coupon_public('NAOEXISTE', current_setting('test.lpt')::uuid,
     now() + interval '2 days', now() + interval '5 days') ->> 'error_code'),
  'invalid', 'código inexistente → invalid');

-- 6) datas invertidas → invalid
select is(
  (public.validate_coupon_public('QAPUBTEST', current_setting('test.lpt')::uuid,
     now() + interval '5 days', now() + interval '2 days') ->> 'error_code'),
  'invalid', 'check_out <= check_in → invalid');

select * from finish();
rollback;
