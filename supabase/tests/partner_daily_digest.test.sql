-- pgTAP: resumo diário do parceiro (partner_daily_digest e partner_digest_recipients, 20/10/2026).
-- Cobre: entra hoje, sai hoje, reserva nova paga desde o último resumo, cancelada fora, reserva
-- antiga fora, empresa sem movimento fora, quem recebe (escopo bookings:read, banido fora) e
-- que só o servidor executa.
-- Roda com: supabase test db (stack local, ver README.md). Transação + rollback.

begin;
select plan(14);

select has_function('public', 'partner_daily_digest', array['date'], 'partner_daily_digest existe');
select ok(
  not has_function_privilege('authenticated', 'public.partner_daily_digest(date)', 'execute')
  and not has_function_privilege('anon', 'public.partner_daily_digest(date)', 'execute')
  and not has_function_privilege('authenticated', 'public.partner_digest_recipients(uuid)', 'execute'),
  'cliente e parceiro não chamam as funções do resumo'
);

do $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  dono uuid := gen_random_uuid(); op uuid := gen_random_uuid(); banido uuid := gen_random_uuid();
  cli uuid := gen_random_uuid();
  cid uuid := gen_random_uuid(); cid2 uuid := gen_random_uuid();
  loc uuid := gen_random_uuid(); loc2 uuid := gen_random_uuid();
  veh uuid; pt uuid; bnova uuid := gen_random_uuid(); bvelha uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at, banned_until) values
    (dono, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'Resumo-Dono@ex.com', now(), now(), null),
    (op, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'resumo-op@ex.com', now(), now(), null),
    (banido, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'resumo-banido@ex.com', now(), now(), now() + interval '1 year'),
    (cli, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'resumo-cli@ex.com', now(), now(), null);
  insert into public.profiles(id, role) values (dono, 'company_operator'), (op, 'company_operator'),
    (banido, 'company_operator'), (cli, 'customer') on conflict (id) do nothing;

  insert into public.company(id, name, slug) values (cid, 'Resumo Park', 'resumo-park'), (cid2, 'Parado Park', 'parado-park');
  insert into public.location(id, company_id, name, slug, timezone) values
    (loc, cid, 'Resumo Unidade', 'resumo-unidade', 'America/Sao_Paulo'),
    (loc2, cid2, 'Parado Unidade', 'parado-unidade', 'America/Sao_Paulo');
  insert into public.profile_company(profile_id, company_id, role) values
    (dono, cid, 'owner'), (op, cid, 'operator'), (banido, cid, 'operator');

  insert into public.vehicle(profile_id, license_plate, model, color) values (cli, 'RSM1A23', 'Onix', 'prata') returning id into veh;
  select id into pt from public.parking_type order by created_at limit 1;

  -- entra hoje às 10h, sai em 3 dias
  insert into public.booking(code, profile_id, location_id, vehicle_id, check_in_at, check_out_at, status, total_amount,
                             customer_first_name, customer_last_name, passenger_count, has_pcd, flight_number)
    values ('RSM-ENTRA', cli, loc, veh, (hoje + time '10:00') at time zone 'America/Sao_Paulo',
            (hoje + 3 + time '18:00') at time zone 'America/Sao_Paulo', 'confirmed', 100, 'Ana', 'Souza', 2, true, 'G3 1234');
  insert into public.booking_item(booking_id, item_type, parking_type_id, quantity, unit_price, subtotal)
    select b.id, 'parking', pt, 1, 100, 100 from public.booking b where b.code = 'RSM-ENTRA' and pt is not null;
  -- entrou há 4 dias, sai hoje às 22h
  insert into public.booking(code, profile_id, location_id, check_in_at, check_out_at, status, total_amount, customer_name)
    values ('RSM-SAI', cli, loc, (hoje - 4 + time '08:00') at time zone 'America/Sao_Paulo',
            (hoje + time '22:00') at time zone 'America/Sao_Paulo', 'confirmed', 100, 'Bruno Lima');
  -- nova: paga agora, para daqui a 5 dias
  insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount, customer_name)
    values (bnova, 'RSM-NOVA', cli, loc, (hoje + 5 + time '09:00') at time zone 'America/Sao_Paulo',
            (hoje + 7 + time '09:00') at time zone 'America/Sao_Paulo', 'confirmed', 100, 'Carla Dias');
  insert into public.payment(booking_id, provider, method, kind, amount, status, paid_at)
    values (bnova, 'pagarme', 'pix', 'booking', 100, 'paid', now());
  -- antiga: paga há 10 dias, para daqui a 5 dias (já foi avisada antes)
  insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount, customer_name, created_at)
    values (bvelha, 'RSM-VELHA', cli, loc, (hoje + 5 + time '09:00') at time zone 'America/Sao_Paulo',
            (hoje + 6 + time '09:00') at time zone 'America/Sao_Paulo', 'confirmed', 100, 'Davi Rocha', now() - interval '10 days');
  insert into public.payment(booking_id, provider, method, kind, amount, status, paid_at)
    values (bvelha, 'pagarme', 'pix', 'booking', 100, 'paid', now() - interval '10 days');
  -- cancelada que entraria hoje
  insert into public.booking(code, profile_id, location_id, check_in_at, check_out_at, status, total_amount, customer_name)
    values ('RSM-CANC', cli, loc, (hoje + time '11:00') at time zone 'America/Sao_Paulo',
            (hoje + 2 + time '11:00') at time zone 'America/Sao_Paulo', 'cancelled', 100, 'Eva Reis');
  -- outra empresa só com reserva antiga, sem movimento hoje
  insert into public.booking(code, profile_id, location_id, check_in_at, check_out_at, status, total_amount, customer_name, created_at)
    values ('RSM-PARADO', cli, loc2, (hoje + 9 + time '09:00') at time zone 'America/Sao_Paulo',
            (hoje + 10 + time '09:00') at time zone 'America/Sao_Paulo', 'confirmed', 100, 'Fábio Luz', now() - interval '10 days');

  perform set_config('test.cid', cid::text, false);
  perform set_config('test.cid2', cid2::text, false);
  perform set_config('test.hoje', hoje::text, false);
end $$;

create temp table _d as
  select * from public.partner_daily_digest(current_setting('test.hoje')::date)
   where company_id in (current_setting('test.cid')::uuid, current_setting('test.cid2')::uuid);

select is((select count(*)::int from _d), 1, 'só a empresa com movimento aparece');
select is((select company_name from _d), 'Resumo Park', 'com o nome da empresa');
select is((select jsonb_array_length(entradas) from _d), 1, 'uma entrada hoje (a cancelada fica fora)');
select is((select entradas -> 0 ->> 'code' from _d), 'RSM-ENTRA', 'a entrada certa');
select is((select entradas -> 0 ->> 'cliente' from _d), 'Ana Souza', 'nome do cliente vem do snapshot');
select is((select entradas -> 0 ->> 'placa' from _d), 'RSM1A23', 'com a placa');
select is((select (entradas -> 0 ->> 'pcd')::boolean from _d), true, 'e o aviso de PCD');
select is((select saidas -> 0 ->> 'code' from _d), 'RSM-SAI', 'a saída de hoje');
select is((select jsonb_agg(x ->> 'code') from _d, jsonb_array_elements(novas) x), '["RSM-NOVA"]'::jsonb,
  'só a reserva paga desde o último resumo é nova (a antiga fica fora)');

-- Depois de um resumo enviado agora, a mesma reserva não volta como nova amanhã.
insert into public.partner_digest_log(company_id, digest_date, sent_at)
  values (current_setting('test.cid')::uuid, current_setting('test.hoje')::date - 1, now() + interval '1 minute');
select is(
  (select jsonb_array_length(novas) from public.partner_daily_digest(current_setting('test.hoje')::date)
    where company_id = current_setting('test.cid')::uuid),
  0, 'reserva já avisada no resumo anterior não volta como nova');

select is(
  (select array_agg(e order by e) from public.partner_digest_recipients(current_setting('test.cid')::uuid) e),
  array['resumo-dono@ex.com', 'resumo-op@ex.com'],
  'dono e operador recebem; usuário banido não; e-mail em minúsculas'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.partner_digest_log'::regclass)
  and not has_table_privilege('anon', 'public.partner_digest_log', 'select'),
  'log com RLS e fechado para anônimo'
);

select * from finish();
rollback;
