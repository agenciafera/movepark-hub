-- pgTAP: disponibilidade + regras (check_availability / availability_batch /
-- operator_location_occupancy). Roda em transação com rollback.

begin;
select plan(8);

-- ── fixture: um tipo de vaga ativo do seed, capacidade = 2 ──────────────────
do $$
declare v_lpt uuid; v_company text; v_location text; v_ptype text; v_loc_id uuid;
begin
  select lpt.id, c.slug, l.slug, pt.code, l.id
    into v_lpt, v_company, v_location, v_ptype, v_loc_id
  from public.location_parking_type lpt
  join public.location l on l.id = lpt.location_id and l.deleted_at is null
  join public.company c on c.id = l.company_id
  join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
  join public.parking_type pt on pt.id = cpt.parking_type_id
  where lpt.is_active limit 1;

  update public.location_parking_type
     set capacity = 2, has_minimum_stay = false, has_minimum_date = false,
         near_capacity_threshold = null
   where id = v_lpt;

  perform set_config('t.lpt', v_lpt::text, false);
  perform set_config('t.company', v_company, false);
  perform set_config('t.location', v_location, false);
  perform set_config('t.ptype', v_ptype, false);
  perform set_config('t.loc_id', v_loc_id::text, false);
end $$;

-- ── 1) período livre → ok, não esgotado, remaining = 2 ─────────────────────
select is(
  (public.check_availability(current_setting('t.company'), current_setting('t.location'),
    current_setting('t.ptype'), '2026-10-10T12:00:00Z', '2026-10-12T12:00:00Z') ->> 'sold_out')::boolean,
  false, 'período livre não está esgotado');

select is(
  (public.check_availability(current_setting('t.company'), current_setting('t.location'),
    current_setting('t.ptype'), '2026-10-10T12:00:00Z', '2026-10-12T12:00:00Z') ->> 'remaining')::int,
  2, 'remaining = capacity quando nada reservado');

-- ── 2) uma data cheia (booked = capacity) → esgotado p/ o período ──────────
insert into public.location_parking_availability (location_parking_type_id, date, booked_count)
values (current_setting('t.lpt')::uuid, '2026-10-11', 2)
on conflict (location_parking_type_id, date) do update set booked_count = 2;

select is(
  (public.check_availability(current_setting('t.company'), current_setting('t.location'),
    current_setting('t.ptype'), '2026-10-10T12:00:00Z', '2026-10-12T12:00:00Z') ->> 'sold_out')::boolean,
  true, 'uma data cheia esgota o período inteiro');

-- ── 3) availability_batch reflete o esgotado ───────────────────────────────
select is(
  (select sold_out from public.availability_batch(
     array[current_setting('t.lpt')::uuid], '2026-10-10T12:00:00Z', '2026-10-12T12:00:00Z')),
  true, 'availability_batch marca sold_out');

-- ── 4) quase-lotação: threshold = 1, libera 1 vaga (booked = 1) ────────────
update public.location_parking_type set near_capacity_threshold = 1 where id = current_setting('t.lpt')::uuid;
update public.location_parking_availability set booked_count = 1
  where location_parking_type_id = current_setting('t.lpt')::uuid and date = '2026-10-11';

select is(
  (public.check_availability(current_setting('t.company'), current_setting('t.location'),
    current_setting('t.ptype'), '2026-10-10T12:00:00Z', '2026-10-12T12:00:00Z') ->> 'near_capacity')::boolean,
  true, 'near_capacity quando remaining <= threshold');

-- ── 5) estadia mínima: 5 diárias exigidas, período de 2 → min_stay_ok false ─
update public.location_parking_type
   set has_minimum_stay = true, minimum_stay_value = 5, minimum_stay_unit = 'days',
       near_capacity_threshold = null
 where id = current_setting('t.lpt')::uuid;
delete from public.location_parking_availability where location_parking_type_id = current_setting('t.lpt')::uuid;

select is(
  (public.check_availability(current_setting('t.company'), current_setting('t.location'),
    current_setting('t.ptype'), '2026-10-10T12:00:00Z', '2026-10-12T12:00:00Z') ->> 'min_stay_ok')::boolean,
  false, 'min_stay_ok false quando abaixo da estadia mínima');

-- ── 6) data mínima: minimum_date no futuro → min_date_ok false ─────────────
update public.location_parking_type
   set has_minimum_stay = false, has_minimum_date = true, minimum_date = '2027-01-01'
 where id = current_setting('t.lpt')::uuid;

select is(
  (public.check_availability(current_setting('t.company'), current_setting('t.location'),
    current_setting('t.ptype'), '2026-10-10T12:00:00Z', '2026-10-12T12:00:00Z') ->> 'min_date_ok')::boolean,
  false, 'min_date_ok false antes da data mínima');

-- ── 7) guard de ocupação: usuário sem vínculo → 42501 ──────────────────────
do $$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (u,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','occ@ex.com',now(),now());
  insert into public.profiles(id, role) values (u,'customer') on conflict (id) do nothing;
  perform set_config('request.jwt.claims', json_build_object('sub', u::text, 'role','authenticated')::text, true);
end $$;

select throws_ok(
  format($q$ select * from public.operator_location_occupancy(%L::uuid, '2026-10-10'::date, '2026-10-12'::date) $q$,
    current_setting('t.loc_id')),
  '42501', NULL,
  'operator_location_occupancy bloqueia usuário fora da empresa');

select * from finish();
rollback;
