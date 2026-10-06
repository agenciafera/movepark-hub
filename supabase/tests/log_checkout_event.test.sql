-- pgTAP: rastro do checkout no navegador (migration 20261128170000, 06/10/2026). O dono da reserva
-- grava `client:*` no rastro; outro cliente não grava; kind fora da allowlist é ignorado; anon não
-- executa; o teto por reserva segura um loop. Transação com rollback.

begin;
select plan(8);

select has_function('public', 'log_checkout_event', array['text', 'text', 'integer', 'jsonb'], 'log_checkout_event existe');
select ok(not has_function_privilege('anon', 'public.log_checkout_event(text, text, integer, jsonb)', 'execute'), 'anon não executa');

do $$
declare
  dono uuid := gen_random_uuid(); outro uuid := gen_random_uuid();
  cid uuid := gen_random_uuid(); loc uuid := gen_random_uuid(); bk uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (dono,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','ck-dono@ex.com',now(),now()),
           (outro,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','ck-outro@ex.com',now(),now());
  insert into public.profiles(id, role) values (dono,'customer'), (outro,'customer') on conflict (id) do nothing;
  insert into public.company(id, name, slug) values (cid, 'Ck Empresa', 'ck-empresa');
  insert into public.location(id, company_id, name, slug) values (loc, cid, 'Ck Loc', 'ck-loc');
  insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount)
    values (bk,'MP-CKLOG',dono,loc,now() + interval '2 days',now() + interval '3 days','pending',50);
  perform set_config('test.dono', dono::text, false);
  perform set_config('test.outro', outro::text, false);
  perform set_config('test.bk', bk::text, false);
end $$;

-- Outro cliente não grava na reserva alheia.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.outro'), 'role', 'authenticated')::text, true);
select public.log_checkout_event('MP-CKLOG', 'client:card_tokenize_failed', 422, '{"message":"x"}');
reset role;
select is((select count(*) from public.payment_gateway_event where booking_id = current_setting('test.bk')::uuid), 0::bigint,
  'cliente de outra conta não grava na reserva');

-- Dono grava, com status, detalhe e a mensagem na nota.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.dono'), 'role', 'authenticated')::text, true);
select public.log_checkout_event('MP-CKLOG', 'client:card_tokenize_failed', 422,
  '{"message":"The request is invalid.","fields":["card.number"]}');
-- kind fora da allowlist é ignorado (o cliente não forja `charge_created`).
select public.log_checkout_event('MP-CKLOG', 'charge_created', 200, '{"message":"forjado"}');
reset role;

select is((select count(*) from public.payment_gateway_event where booking_id = current_setting('test.bk')::uuid), 1::bigint,
  'só o evento permitido entrou');
select is((select kind || '|' || http_status || '|' || note from public.payment_gateway_event
            where booking_id = current_setting('test.bk')::uuid),
  'client:card_tokenize_failed|422|The request is invalid.', 'kind, status e mensagem gravados');
select is((select request -> 'fields' ->> 0 from public.payment_gateway_event
            where booking_id = current_setting('test.bk')::uuid),
  'card.number', 'detalhe gravado em request');

-- Teto de 60 eventos client:* por reserva.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.dono'), 'role', 'authenticated')::text, true);
select public.log_checkout_event('MP-CKLOG', 'client:card_attempt', null, null) from generate_series(1, 80);
reset role;
select is((select count(*) from public.payment_gateway_event where booking_id = current_setting('test.bk')::uuid), 60::bigint,
  'teto de 60 eventos por reserva');

-- A view do funil herda a RLS: cliente não lê.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.dono'), 'role', 'authenticated')::text, true);
select is((select count(*) from public.checkout_card_funnel where booking_code = 'MP-CKLOG'), 0::bigint,
  'cliente não lê o funil');
reset role;

select * from finish();
rollback;
