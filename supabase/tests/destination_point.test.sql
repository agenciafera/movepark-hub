-- pgTAP: DAT-05 (PostGIS · ADR-001) — destination_point (terminais), nearest_destination_point,
-- view location_point_proximity (distância por terminal + is_nearest), constraints e RLS.
-- Distância via ST_Distance (geography) — sem haversine manual. Roda em transação com rollback.

begin;
select plan(12);

-- ── fixtures (como postgres; RLS não se aplica a superuser) ──────────────────
-- Destinos remotos (Atlântico Sul) p/ não colidir com seed/baseline.
do $$
declare
  cmp uuid := gen_random_uuid();
  d1  uuid := gen_random_uuid();   -- destino multi-terminal
  d2  uuid := gen_random_uuid();   -- destino com 1 ponto (testa cascade)
  p1  uuid := gen_random_uuid();   -- ponto mais próximo do lote
begin
  insert into public.company(id, name, slug) values (cmp, 'Co Teste DAT05', 'co-teste-dat05');

  insert into public.destination(id, code, name, slug, type, city, country, latitude, longitude, is_published)
  values
    (d1, 'TD5A', 'Destino DAT05 A', 'destino-dat05-a', 'airport', 'X', 'BR', -50.0000, -30.0000, true),
    (d2, 'TD5B', 'Destino DAT05 B', 'destino-dat05-b', 'airport', 'Y', 'BR', -40.0000, -20.0000, true);

  -- 3 pontos em d1: P1 colado, P2 médio, P3 longe.
  insert into public.destination_point(id, destination_id, name, type, latitude, longitude, sort_order)
  values
    (p1, d1, 'P1', 'terminal', -50.0010, -30.0010, 1),
    (gen_random_uuid(), d1, 'P2', 'terminal', -50.0200, -30.0200, 2),
    (gen_random_uuid(), d1, 'P3', 'pier',     -50.0500, -30.0500, 3);

  -- 1 ponto em d2 (p/ testar cascade no delete do destino).
  insert into public.destination_point(destination_id, name, type, latitude, longitude, sort_order)
  values (d2, 'B1', 'terminal', -40.0010, -20.0010, 1);

  -- lote ligado a d1, geo praticamente em cima de P1.
  -- is_listed = true: desde o gate de listagem pública (20260816000000), a RLS catalog_read_location
  -- exige is_listed para o anon enxergar a unidade (e a view de proximidade que a junta).
  insert into public.location(id, company_id, name, slug, latitude, longitude, destination_id, status, is_listed)
  values (gen_random_uuid(), cmp, 'Lote DAT05', 'lote-dat05', -50.0011, -30.0011, d1, 'active', true);

  perform set_config('test.d1', d1::text, false);
  perform set_config('test.d2', d2::text, false);
  perform set_config('test.p1', p1::text, false);
end $$;

-- ── nearest_destination_point ────────────────────────────────────────────────
select is(
  public.nearest_destination_point(-50.0011, -30.0011, current_setting('test.d1')::uuid),
  current_setting('test.p1')::uuid,
  'nearest_destination_point: escolhe o terminal mais próximo do lote (P1)');
select is(
  public.nearest_destination_point(null, -30.0, current_setting('test.d1')::uuid),
  null::uuid,
  'nearest_destination_point: lat nula → null');

-- ── view location_point_proximity ────────────────────────────────────────────
select is(
  (select count(*) from public.location_point_proximity lp
   join public.location l on l.id = lp.location_id where l.slug = 'lote-dat05'),
  3::bigint,
  'view: uma linha por ponto do destino do lote (3)');
select is(
  (select lp.point_name from public.location_point_proximity lp
   join public.location l on l.id = lp.location_id
   where l.slug = 'lote-dat05' and lp.is_nearest),
  'P1',
  'view: is_nearest marca exatamente o terminal mais próximo (P1)');
select is(
  (select count(*) from public.location_point_proximity lp
   join public.location l on l.id = lp.location_id
   where l.slug = 'lote-dat05' and lp.is_nearest),
  1::bigint,
  'view: exatamente um is_nearest por lote');
select ok(
  (select lp.distance_km from public.location_point_proximity lp
   join public.location l on l.id = lp.location_id
   where l.slug = 'lote-dat05' and lp.point_name = 'P1') between 0 and 1,
  'view: distância ao terminal mais próximo é pequena (<1 km)');

-- lote de destino sem pontos não gera linhas (join interno).
select is(
  (select count(*) from public.location_point_proximity lp
   join public.location l on l.id = lp.location_id
   where l.destination_id = current_setting('test.d2')::uuid and l.slug = 'lote-dat05'),
  0::bigint,
  'view: lote não aparece sob destino que não é o seu');

-- ── constraints ──────────────────────────────────────────────────────────────
select throws_ok(
  format($f$insert into public.destination_point(destination_id, name, type, latitude, longitude)
            values (%L, 'X', 'bogus', -1, -1)$f$, current_setting('test.d1')),
  '23514',
  null,
  'check: type fora do conjunto permitido é rejeitado');
select throws_ok(
  format($f$insert into public.destination_point(destination_id, name, type, latitude, longitude)
            values (%L, 'P1', 'terminal', -1, -1)$f$, current_setting('test.d1')),
  '23505',
  null,
  'unique: (destination_id, name) duplicado é rejeitado');

-- ── cascade: apagar o destino remove seus pontos ─────────────────────────────
delete from public.destination where id = current_setting('test.d2')::uuid;
select is(
  (select count(*) from public.destination_point
   where destination_id = current_setting('test.d2')::uuid),
  0::bigint,
  'cascade: apagar o destino apaga seus pontos');

-- ── RLS — anon lê a view e a tabela; anon NÃO escreve ────────────────────────
set local role anon;
select isnt_empty(
  $$select 1 from public.location_point_proximity lp
    join public.location l on l.id = lp.location_id where l.slug = 'lote-dat05'$$,
  'anon lê a proximidade por terminal via a view');
select throws_ok(
  format($f$insert into public.destination_point(destination_id, name, type, latitude, longitude)
            values (%L, 'HACK', 'terminal', -1, -1)$f$, current_setting('test.d1')),
  null, null,
  'anon não consegue inserir terminal (RLS write só hub_admin)');
reset role;

select * from finish();
rollback;
