-- pgTAP: DAT-04 — haversine_km, nearest_destination, trigger de auto-fill,
-- view location_proximity e RLS da view. Roda em transação com rollback.

begin;
select plan(10);

-- ── fixtures (como postgres; RLS não se aplica a superuser) ──────────────────
-- Destinos de teste em local remoto (Atlântico Sul) p/ não colidir com o seed/baseline.
do $$
declare
  cmp uuid := gen_random_uuid();
  d1  uuid := gen_random_uuid();   -- destino-âncora próximo
  d2  uuid := gen_random_uuid();   -- destino de override
begin
  insert into public.company(id, name, slug) values (cmp, 'Co Teste DAT04', 'co-teste-dat04');

  insert into public.destination(id, code, name, slug, type, city, country, latitude, longitude, is_published)
  values
    (d1, 'TD1', 'Destino Teste 1', 'destino-teste-1', 'airport', 'X', 'BR', -50.0000, -30.0000, true),
    (d2, 'TD2', 'Destino Teste 2', 'destino-teste-2', 'airport', 'Y', 'BR', -49.0000, -30.0000, true);

  -- lote A: geo coladinha em d1, sem destination_id → trigger deve ligar a d1
  insert into public.location(id, company_id, name, slug, latitude, longitude, status)
  values (gen_random_uuid(), cmp, 'Lote A (auto)', 'lote-a-auto', -50.0100, -30.0100, 'active');

  -- lote B: geo coladinha em d1, mas com override explícito p/ d2 → mantém d2
  insert into public.location(id, company_id, name, slug, latitude, longitude, destination_id, status)
  values (gen_random_uuid(), cmp, 'Lote B (override)', 'lote-b-override', -50.0100, -30.0100, d2, 'active');

  -- lote C: sem geo → fica sem destino (null)
  insert into public.location(id, company_id, name, slug, latitude, longitude, status)
  values (gen_random_uuid(), cmp, 'Lote C (sem geo)', 'lote-c-sem-geo', null, null, 'active');

  perform set_config('test.d1', d1::text, false);
  perform set_config('test.d2', d2::text, false);
end $$;

create or replace function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', null, true);
end $$;

-- ── haversine_km ─────────────────────────────────────────────────────────────
select is(public.haversine_km(-23.5, -46.6, -23.5, -46.6), 0::numeric,
  'haversine: mesmo ponto = 0');
select is(public.haversine_km(null, -46.6, -23.5, -46.6), null::numeric,
  'haversine: argumento nulo = null');
select ok(public.haversine_km(0, 0, 1, 0) between 111 and 112,
  'haversine: 1 grau de latitude ≈ 111 km');

-- ── nearest_destination ──────────────────────────────────────────────────────
select is(public.nearest_destination(-50.0100, -30.0100),
  current_setting('test.d1')::uuid,
  'nearest_destination: escolhe o destino publicado mais próximo (d1)');
select is(public.nearest_destination(0.0, -25.0, 100),
  null::uuid,
  'nearest_destination: nenhum dentro do teto de 100 km → null');

-- ── trigger de auto-fill (BEFORE INSERT) ─────────────────────────────────────
select is(
  (select destination_id from public.location where slug = 'lote-a-auto'),
  current_setting('test.d1')::uuid,
  'trigger: lote novo com geo é ligado ao destino mais próximo');
select is(
  (select destination_id from public.location where slug = 'lote-b-override'),
  current_setting('test.d2')::uuid,
  'trigger: override explícito no INSERT não é sobrescrito');
select is(
  (select destination_id from public.location where slug = 'lote-c-sem-geo'),
  null::uuid,
  'trigger: lote sem geo fica sem destino');

-- ── view location_proximity ──────────────────────────────────────────────────
select ok(
  (select distance_km from public.location_proximity lp
   join public.location l on l.id = lp.location_id
   where l.slug = 'lote-a-auto') between 0 and 5,
  'view: distance_km do lote ligado é pequena e não-nula');
select is(
  (select distance_km from public.location_proximity lp
   join public.location l on l.id = lp.location_id
   where l.slug = 'lote-c-sem-geo'),
  null::numeric,
  'view: lote sem geo tem distance_km null');

-- ── RLS: anon lê a view de um lote ativo (security_invoker) ───────────────────
set local role anon;
select pg_temp.as_anon();
select isnt_empty(
  $$select 1 from public.location_proximity lp
    join public.location l on l.id = lp.location_id
    where l.slug = 'lote-a-auto'$$,
  'anon lê a proximidade de lote ativo via a view');
reset role;

select * from finish();
rollback;
