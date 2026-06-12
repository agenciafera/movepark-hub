-- pgTAP: filtro da busca por destino (DAT-04). Regressão do bug em que /destinos/<slug>
-- listava TODOS os lotes ativos em vez das opções ancoradas ao destino. O Edge `search`
-- restringe os candidatos por location.destination_id = <destino buscado>; este teste exercita
-- exatamente esse predicado (lpt ativo ⋈ location por destination_id). Transação com rollback.

begin;
select plan(4);

-- ── fixtures (como postgres; RLS não se aplica a superuser) ──────────────────
-- Dois destinos remotos (Atlântico Sul) p/ não colidir com seed/baseline.
do $$
declare
  cmp  uuid := gen_random_uuid();
  pt   uuid := gen_random_uuid();
  cpt  uuid := gen_random_uuid();
  d1   uuid := gen_random_uuid();   -- destino da página
  d2   uuid := gen_random_uuid();   -- outro destino (não deve aparecer)
  lA   uuid := gen_random_uuid();   -- lote ancorado a d1
  lB   uuid := gen_random_uuid();   -- lote ancorado a d1
  lC   uuid := gen_random_uuid();   -- lote ancorado a d2
begin
  insert into public.company(id, name, slug) values (cmp, 'Co Teste SDF', 'co-teste-sdf');
  insert into public.parking_type(id, code, name) values (pt, 'sdf_covered', 'Coberto SDF');
  insert into public.company_parking_type(id, company_id, parking_type_id, base_price, default_capacity)
    values (cpt, cmp, pt, 100.00, 10);

  insert into public.destination(id, code, name, slug, type, city, country, latitude, longitude, is_published)
  values
    (d1, 'SDF1', 'Destino SDF 1', 'destino-sdf-1', 'airport', 'X', 'BR', -50.0000, -30.0000, true),
    (d2, 'SDF2', 'Destino SDF 2', 'destino-sdf-2', 'airport', 'Y', 'BR', -40.0000, -30.0000, true);

  -- Override explícito do destination_id (a trigger só age quando vem nulo); geo só p/ consistência.
  insert into public.location(id, company_id, name, slug, latitude, longitude, destination_id, status)
  values
    (lA, cmp, 'Lote A (d1)', 'lote-a-sdf', -50.0100, -30.0100, d1, 'active'),
    (lB, cmp, 'Lote B (d1)', 'lote-b-sdf', -50.0200, -30.0200, d1, 'active'),
    (lC, cmp, 'Lote C (d2)', 'lote-c-sdf', -40.0100, -30.0100, d2, 'active');

  insert into public.location_parking_type(id, location_id, company_parking_type_id, capacity, is_active)
  values
    (gen_random_uuid(), lA, cpt, 10, true),
    (gen_random_uuid(), lB, cpt, 10, true),
    (gen_random_uuid(), lC, cpt, 10, true);

  perform set_config('test.d1', d1::text, false);
  perform set_config('test.d2', d2::text, false);
end $$;

-- Predicado do Edge `search`: candidatos = lpt ativo, filtrado por location.destination_id.
create or replace function pg_temp.candidates(p_dest uuid)
returns bigint language sql stable as $$
  select count(*)
  from public.location_parking_type lpt
  join public.location l on l.id = lpt.location_id
  where lpt.is_active
    and l.deleted_at is null
    and l.destination_id = p_dest;
$$;

-- ── 1) destino d1 → só os 2 lotes ancorados a d1 (NÃO lista tudo) ───────────
select is(
  pg_temp.candidates(current_setting('test.d1')::uuid),
  2::bigint,
  'busca por d1 retorna só os lotes ancorados a d1 (2), não todos');

-- ── 2) destino d2 → só o lote ancorado a d2 ─────────────────────────────────
select is(
  pg_temp.candidates(current_setting('test.d2')::uuid),
  1::bigint,
  'busca por d2 retorna só o lote ancorado a d2 (1)');

-- ── 3) lote de d2 não vaza na página de d1 ──────────────────────────────────
select is_empty(
  $$select 1
    from public.location_parking_type lpt
    join public.location l on l.id = lpt.location_id
    where lpt.is_active
      and l.destination_id = current_setting('test.d1')::uuid
      and l.slug = 'lote-c-sdf'$$,
  'lote de outro destino (lote-c-sdf) não aparece na busca de d1');

-- ── 4) sem o filtro, os 3 lotes do fixture entrariam (prova que o filtro é o que separa) ──
select cmp_ok(
  (select count(*) from public.location_parking_type lpt
     join public.location l on l.id = lpt.location_id
     where lpt.is_active and l.slug like 'lote-_-sdf'),
  '=', 3::bigint,
  'sem filtro por destino haveria 3 candidatos — é o destination_id que separa');

select * from finish();
rollback;
