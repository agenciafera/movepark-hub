-- pgTAP: rastro do gateway (E0.3.9, 17/09/2026). Só hub_admin lê a tabela e a RPC; a RPC traz os
-- pagamentos com os ids do gateway e os eventos da reserva. Transação com rollback.

begin;
select plan(7);

select has_table('public', 'payment_gateway_event', 'payment_gateway_event existe');
select has_function('public', 'booking_gateway_trail', array['uuid'], 'booking_gateway_trail(uuid) existe');

do $$
declare
  adm uuid := gen_random_uuid(); cust uuid := gen_random_uuid();
  cid uuid := gen_random_uuid(); loc uuid := gen_random_uuid(); bk uuid := gen_random_uuid(); pay uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (adm,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','tr-adm@ex.com',now(),now()),
           (cust,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','tr-cust@ex.com',now(),now());
  insert into public.profiles(id, role) values (adm,'hub_admin') on conflict (id) do update set role='hub_admin';
  insert into public.profiles(id, role) values (cust,'customer') on conflict (id) do nothing;
  insert into public.company(id, name, slug) values (cid, 'Trail Empresa', 'trail-empresa');
  insert into public.location(id, company_id, name, slug) values (loc, cid, 'Trail Loc', 'trail-loc');
  insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount)
    values (bk,'MP-TRAIL',cust,loc,now() + interval '2 days',now() + interval '3 days','confirmed',18);
  insert into public.payment(id, booking_id, provider, method, kind, amount, status, paid_at, provider_payment_id, provider_charge_id)
    values (pay, bk,'pagarme','pix','booking',18,'paid',now(),'or_x','ch_x');
  insert into public.payment_gateway_event(payment_id, booking_id, kind, http_status, request, response, created_at)
    values (pay, bk, 'charge_created', 200, '{"amount":1800}', '{"id":"or_x","charges":[{"id":"ch_x"}]}', now() - interval '1 minute'),
           (pay, bk, 'webhook:charge.paid', 200, null, '{"type":"charge.paid"}', now());
  perform set_config('test.adm', adm::text, false);
  perform set_config('test.cust', cust::text, false);
  perform set_config('test.bk', bk::text, false);
end $$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.cust'), 'role', 'authenticated')::text, true);
select is((select count(*) from public.payment_gateway_event where booking_id = current_setting('test.bk')::uuid), 0::bigint, 'cliente não lê o rastro pela tabela');
select is(public.booking_gateway_trail(current_setting('test.bk')::uuid), null, 'cliente recebe nulo da RPC');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.adm'), 'role', 'authenticated')::text, true);
select is(jsonb_array_length(public.booking_gateway_trail(current_setting('test.bk')::uuid) -> 'events'), 2, 'hub_admin vê os dois eventos');
select is(public.booking_gateway_trail(current_setting('test.bk')::uuid) -> 'payments' -> 0 ->> 'provider_charge_id', 'ch_x', 'o pagamento traz o charge do gateway');
select is(public.booking_gateway_trail(current_setting('test.bk')::uuid) -> 'events' -> 0 ->> 'kind', 'webhook:charge.paid', 'eventos do mais novo para o mais velho');
reset role;

select * from finish();
rollback;
