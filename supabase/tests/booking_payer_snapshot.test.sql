-- pgTAP: snapshot do pagador no booking (migration 20260806000000).
-- Colunas novas customer_tax_id + passenger_first_name/last_name/phone existem e guardam o snapshot.
-- O trigger booking_reconcile_customer_name segue reconciliando o nome do TITULAR (customer_*).
-- Roda com: supabase test db. Transação + rollback.

begin;
select plan(5);

select has_column('public', 'booking', 'customer_tax_id', 'booking.customer_tax_id existe');
select has_column('public', 'booking', 'passenger_first_name', 'booking.passenger_first_name existe');
select has_column('public', 'booking', 'passenger_phone', 'booking.passenger_phone existe');

do $$
declare
  v_loc uuid;
  v_uid uuid := gen_random_uuid();
  v_id  uuid;
begin
  select id into v_loc from public.location where deleted_at is null limit 1;
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (v_uid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','payer-snap@ex.com',now(),now());
  insert into public.profiles(id, role) values (v_uid, 'customer') on conflict (id) do nothing;

  -- Titular (customer_*) + passageiro (passenger_*) + documento.
  insert into public.booking (
    code, profile_id, location_id, check_in_at, check_out_at,
    customer_first_name, customer_last_name, customer_phone, customer_email, customer_tax_id,
    passenger_first_name, passenger_last_name, passenger_phone
  ) values (
    'MP-PAYER-A', v_uid, v_loc, '2027-04-01T12:00:00Z', '2027-04-03T12:00:00Z',
    'Pedro', 'Araujo', '+5511999990000', 'pedro@ex.com', '04810388417',
    'Maria', 'Souza', '+5511988887777'
  ) returning id into v_id;
  perform set_config('test.a', v_id::text, true);
end $$;

-- Titular no snapshot (customer_name recomposto pelo trigger).
select is((select customer_name from public.booking where id = current_setting('test.a')::uuid),
          'Pedro Araujo', 'titular: customer_name recomposto do first/last');
select is(
  (select customer_tax_id || '|' || passenger_first_name || ' ' || passenger_last_name
     from public.booking where id = current_setting('test.a')::uuid),
  '04810388417|Maria Souza',
  'documento do titular e nome do passageiro guardados no snapshot');

select * from finish();
rollback;
