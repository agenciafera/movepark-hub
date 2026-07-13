-- pgTAP: quebra de booking.customer_name em customer_first_name / customer_last_name via trigger
-- de reconciliação bidirecional (migration 20260805000000).
--   - escrever customer_name → fatia em first/last;
--   - escrever first/last → recompõe customer_name;
--   - customer_name = null (anonimização) → zera first/last.
-- Roda com: supabase test db. Transação + rollback.

begin;
select plan(6);

do $$
declare
  v_loc uuid;
  v_uid uuid := gen_random_uuid();
  v_id  uuid;
begin
  select id into v_loc from public.location where deleted_at is null limit 1;

  -- Booking exige um "actor" (booking_actor_check): usamos um consumidor.
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (v_uid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','split-bk@ex.com',now(),now());
  insert into public.profiles(id, role) values (v_uid, 'customer') on conflict (id) do nothing;

  -- (A) Insert com customer_name (caminho API/RPC) → trigger fatia.
  insert into public.booking (code, profile_id, location_id, check_in_at, check_out_at, customer_name)
  values ('MP-SPLIT-A', v_uid, v_loc, '2027-03-01T12:00:00Z', '2027-03-03T12:00:00Z', 'João da Silva')
  returning id into v_id;
  perform set_config('test.a', v_id::text, true);

  -- (B) Insert só com first/last (caminho checkout) → trigger recompõe customer_name.
  insert into public.booking (code, profile_id, location_id, check_in_at, check_out_at,
                              customer_first_name, customer_last_name)
  values ('MP-SPLIT-B', v_uid, v_loc, '2027-03-01T12:00:00Z', '2027-03-03T12:00:00Z', 'Maria', 'Souza')
  returning id into v_id;
  perform set_config('test.b', v_id::text, true);
end $$;

-- (A) customer_name fatiado
select is((select customer_first_name from public.booking where id = current_setting('test.a')::uuid),
          'João', 'insert customer_name → first_name fatiado');
select is((select customer_last_name from public.booking where id = current_setting('test.a')::uuid),
          'da Silva', 'insert customer_name → last_name fatiado');

-- (B) customer_name recomposto a partir de first/last
select is((select customer_name from public.booking where id = current_setting('test.b')::uuid),
          'Maria Souza', 'insert first/last → customer_name recomposto');

-- update de first/last recompõe customer_name
update public.booking set customer_first_name = 'Ana', customer_last_name = 'Prado'
 where id = current_setting('test.a')::uuid;
select is((select customer_name from public.booking where id = current_setting('test.a')::uuid),
          'Ana Prado', 'update first/last → customer_name recomposto');

-- customer_name = null (anonimização) zera first/last
update public.booking set customer_name = null where id = current_setting('test.a')::uuid;
select is((select customer_first_name from public.booking where id = current_setting('test.a')::uuid),
          null::text, 'customer_name null → first_name zerado');
select is((select customer_last_name from public.booking where id = current_setting('test.a')::uuid),
          null::text, 'customer_name null → last_name zerado');

select * from finish();
rollback;
