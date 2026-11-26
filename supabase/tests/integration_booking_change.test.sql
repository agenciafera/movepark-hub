-- pgTAP: troca de data ou de placa antes da entrada chega à cancela (migration 20261208140000).
--
-- O que trava aqui:
--   1. Trocar a saída de reserva confirmada, com código ativo e antes da entrada, enfileira uma
--      reserva nova, com a janela e a placa anteriores no payload e o alerta em 15 minutos.
--   2. Com entrega pendente, outra troca não duplica: a pendente lê a reserva na hora de enviar.
--   3. O código novo aposenta o anterior (`block_pending`) numa transação; retentativa, código
--      igual e entrega inicial que perdeu a corrida não mexem em nada.
--   4. Não enfileira: extensão no pátio (entrada igual e passada), entrada registrada, conexão
--      desligada, reserva sem código ativo.
--   5. Troca de placa leva a placa antiga no payload.
--   6. Só o service_role grava o código.
--   0. A entrega da confirmação, que passou a gravar pela mesma RPC, grava o primeiro código.

begin;
select plan(20);

-- Reserva criada pelo caminho real numa unidade sem integração, que ganha uma conexão de teste.
do $$
declare u uuid := gen_random_uuid(); v_lpt uuid; v_loc uuid; v_company uuid; v_conn uuid; r jsonb;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'troca-cloudpark@ex.com', now(), now());
  insert into public.profiles(id, role) values (u, 'customer') on conflict (id) do nothing;
  select lpt.id, l.id, l.company_id into v_lpt, v_loc, v_company
  from public.location_parking_type lpt join public.location l on l.id = lpt.location_id
  where lpt.capacity > 0 and lpt.is_active and l.deleted_at is null
    and not exists (select 1 from public.integration_connection c where c.location_id = l.id)
  order by (l.checkout_mode::text = 'hub') desc, (l.is_listed is true) desc, lpt.created_at limit 1;
  update public.location_parking_type set capacity = 100000, has_minimum_stay = false where id = v_lpt;

  insert into public.integration_connection (company_id, location_id, provider, enabled, config, secret_id, send_hub_bookings)
  values (v_company, v_loc, 'cloudpark', true, '{"base_url": "https://sandbox.cloudpark.com.br"}', gen_random_uuid(), true)
  returning id into v_conn;

  insert into public.vehicle (profile_id, license_plate) values (u, 'AAA1A11');
  insert into public.vehicle (profile_id, license_plate) values (u, 'BBB2B22');

  r := public.create_booking_atomic(u, v_lpt, '2027-03-10T12:00:00Z', '2027-03-15T12:00:00Z');
  perform set_config('test.bid', r ->> 'booking_id', false);
  perform set_config('test.conn', v_conn::text, false);
  perform set_config('test.uid', u::text, false);
end $$;

-- Confirmada e já enviada: a entrega inicial (nascida do trigger da confirmação) foi entregue com
-- o código CODE-A, e o carro tem a placa AAA1A11.
update public.booking
   set status = 'confirmed',
       vehicle_id = (select id from public.vehicle where license_plate = 'AAA1A11' and profile_id = current_setting('test.uid')::uuid)
 where id = current_setting('test.bid')::uuid;
select is(
  public.integration_store_access_code(
    (select id from public.integration_delivery where booking_id = current_setting('test.bid')::uuid), 'CODE-A') - 'code_id',
  '{"stored": true, "previous_code": null}'::jsonb, 'entrega da confirmação grava o primeiro código');
update public.integration_delivery set status = 'delivered', delivered_at = now()
 where booking_id = current_setting('test.bid')::uuid;

select is(
  (select count(*)::int from public.integration_delivery where booking_id = current_setting('test.bid')::uuid),
  1, 'fixture: só a entrega inicial, já entregue');

-- ── 1. Troca de data enfileira ────────────────────────────────────────────────────────────
update public.booking set check_out_at = '2027-03-17T12:00:00Z' where id = current_setting('test.bid')::uuid;

select is(
  (select count(*)::int from public.integration_delivery
    where booking_id = current_setting('test.bid')::uuid and status = 'pending' and payload ->> 'reason' = 'change'),
  1, 'trocar a saída antes da entrada enfileira uma reserva nova');
select is(
  (select (payload -> 'previous' ->> 'check_out_at')::timestamptz from public.integration_delivery
    where booking_id = current_setting('test.bid')::uuid and status = 'pending'),
  '2027-03-15T12:00:00Z'::timestamptz, 'o payload guarda a saída que a cancela tem');
select is(
  (select payload -> 'previous' ->> 'plate' from public.integration_delivery
    where booking_id = current_setting('test.bid')::uuid and status = 'pending'),
  'AAA1A11', 'e a placa que a cancela tem');
select ok(
  (select hold_until between now() + interval '14 minutes' and now() + interval '16 minutes'
     from public.integration_delivery where booking_id = current_setting('test.bid')::uuid and status = 'pending'),
  'o alerta de demora sai em 15 minutos, como na confirmação');

-- ── 2. Sem duplicar ───────────────────────────────────────────────────────────────────────
update public.booking set check_out_at = '2027-03-18T12:00:00Z' where id = current_setting('test.bid')::uuid;
select is(
  (select count(*)::int from public.integration_delivery
    where booking_id = current_setting('test.bid')::uuid and status = 'pending'),
  1, 'com entrega pendente, outra troca não duplica');

-- ── 3. O código novo aposenta o anterior ─────────────────────────────────────────────────
select set_config('test.d1',
  (select id::text from public.integration_delivery where booking_id = current_setting('test.bid')::uuid and status = 'pending'),
  false);

select is(
  public.integration_store_access_code(current_setting('test.d1')::uuid, 'CODE-B') - 'code_id',
  '{"stored": true, "previous_code": "CODE-A"}'::jsonb, 'grava o código novo e devolve o anterior');
select is(
  (select string_agg(code || ':' || status, ',' order by code) from public.integration_access_code
    where booking_id = current_setting('test.bid')::uuid),
  'CODE-A:block_pending,CODE-B:active', 'o anterior fica para bloquear e o novo vale');
select is(
  public.integration_store_access_code(current_setting('test.d1')::uuid, 'CODE-B') ->> 'stored',
  'false', 'retentativa da mesma entrega não grava de novo');

update public.integration_delivery set status = 'delivered' where id = current_setting('test.d1')::uuid;
update public.booking set check_in_at = '2027-03-11T12:00:00Z' where id = current_setting('test.bid')::uuid;
select set_config('test.d2',
  (select id::text from public.integration_delivery where booking_id = current_setting('test.bid')::uuid and status = 'pending'),
  false);
select is(
  public.integration_store_access_code(current_setting('test.d2')::uuid, 'CODE-B') - 'code_id',
  '{"stored": false, "previous_code": null}'::jsonb, 'o provedor devolveu o mesmo código: nada muda');
select is(
  (select count(*)::int from public.integration_access_code where booking_id = current_setting('test.bid')::uuid),
  2, 'nenhum código a mais');

select is(
  public.integration_store_access_code(
    (select id from public.integration_delivery where booking_id = current_setting('test.bid')::uuid
      order by created_at limit 1), 'CODE-X') ->> 'stored',
  'false', 'entrega inicial que perdeu a corrida: vale o código que já está lá');
select throws_ok(
  $$ select public.integration_store_access_code(current_setting('test.d2')::uuid, '  ') $$,
  'P0001', 'Código de acesso vazio.', 'código vazio é recusado');

-- ── 4. Quando não enfileira ───────────────────────────────────────────────────────────────
update public.integration_delivery set status = 'delivered'
 where booking_id = current_setting('test.bid')::uuid and status = 'pending';

-- Preparo: leva a entrada para o passado (essa troca ainda enfileira, porque a entrada antiga era
-- futura) e dá a entrega como feita.
update public.booking set check_in_at = now() - interval '1 day', check_out_at = now() + interval '1 day'
 where id = current_setting('test.bid')::uuid;
update public.integration_delivery set status = 'delivered'
 where booking_id = current_setting('test.bid')::uuid and status = 'pending';

update public.booking set check_out_at = now() + interval '3 days' where id = current_setting('test.bid')::uuid;
select is(
  (select count(*)::int from public.integration_delivery where booking_id = current_setting('test.bid')::uuid and status = 'pending'),
  0, 'entrada igual e já passada (extensão no pátio): não manda, a portaria valida');

update public.booking set check_in_at = now() + interval '2 days', check_out_at = now() + interval '5 days',
       checked_in_at = now()
 where id = current_setting('test.bid')::uuid;
select is(
  (select count(*)::int from public.integration_delivery where booking_id = current_setting('test.bid')::uuid and status = 'pending'),
  0, 'com a entrada registrada: não manda');
update public.booking set checked_in_at = null where id = current_setting('test.bid')::uuid;

update public.integration_connection set enabled = false where id = current_setting('test.conn')::uuid;
update public.booking set check_out_at = now() + interval '6 days' where id = current_setting('test.bid')::uuid;
select is(
  (select count(*)::int from public.integration_delivery where booking_id = current_setting('test.bid')::uuid and status = 'pending'),
  0, 'conexão desligada: não manda');
update public.integration_connection set enabled = true where id = current_setting('test.conn')::uuid;

update public.integration_access_code set status = 'blocked' where booking_id = current_setting('test.bid')::uuid;
update public.booking set check_out_at = now() + interval '7 days' where id = current_setting('test.bid')::uuid;
select is(
  (select count(*)::int from public.integration_delivery where booking_id = current_setting('test.bid')::uuid and status = 'pending'),
  0, 'sem código ativo na unidade (o envio inicial falhou): não manda');
update public.integration_access_code set status = 'active'
 where booking_id = current_setting('test.bid')::uuid and code = 'CODE-B';

-- ── 5. Troca de placa ─────────────────────────────────────────────────────────────────────
update public.booking
   set vehicle_id = (select id from public.vehicle where license_plate = 'BBB2B22' and profile_id = current_setting('test.uid')::uuid)
 where id = current_setting('test.bid')::uuid;
select is(
  (select payload -> 'previous' ->> 'plate' from public.integration_delivery
    where booking_id = current_setting('test.bid')::uuid and status = 'pending'),
  'AAA1A11', 'trocar a placa manda reserva nova com a placa antiga no payload');

-- ── 6. Permissões ─────────────────────────────────────────────────────────────────────────
select ok(
  not has_function_privilege('authenticated', 'public.integration_store_access_code(uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.integration_store_access_code(uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.integration_enqueue_booking_change()', 'execute'),
  'só o service_role grava o código');

select * from finish();
rollback;
