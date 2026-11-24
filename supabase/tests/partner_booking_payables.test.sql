-- pgTAP: recebíveis da reserva para o estacionamento (24/11/2026). Spec: docs/specs/taxas-da-reserva.md
-- Quem tem finance:read na empresa da reserva (Dono, Gerente, Financeiro) ou hub_admin lê; o papel
-- Operação, o cliente e o Dono de outra empresa recebem 42501. Sai o último evento com recebível,
-- com o recebedor como movepark/partner e sem o id na Pagar.me. Valores inventados (repo público).
-- Transação com rollback.

begin;
select plan(14);

select has_function('public', 'partner_booking_payables', array['uuid'], 'partner_booking_payables(uuid) existe');
select ok(not has_function_privilege('anon', 'public.partner_booking_payables(uuid)', 'execute'), 'anon não executa');

do $$
declare
  dono uuid := gen_random_uuid(); oper uuid := gen_random_uuid(); cli uuid := gen_random_uuid();
  outro uuid := gen_random_uuid();
  cid uuid := gen_random_uuid(); cid2 uuid := gen_random_uuid();
  loc uuid := gen_random_uuid(); bk uuid := gen_random_uuid(); pay uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (dono, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','pbp-dono@ex.com',now(),now()),
           (oper, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','pbp-oper@ex.com',now(),now()),
           (cli,  '00000000-0000-0000-0000-000000000000','authenticated','authenticated','pbp-cli@ex.com',now(),now()),
           (outro,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','pbp-outro@ex.com',now(),now());
  insert into public.profiles(id, role) values (dono,'company_operator') on conflict (id) do update set role = 'company_operator';
  insert into public.profiles(id, role) values (oper,'company_operator') on conflict (id) do update set role = 'company_operator';
  insert into public.profiles(id, role) values (outro,'company_operator') on conflict (id) do update set role = 'company_operator';
  insert into public.profiles(id, role) values (cli,'customer') on conflict (id) do update set role = 'customer';
  insert into public.company(id, name, slug) values (cid, 'PBP Empresa', 'pbp-empresa'), (cid2, 'PBP Outra', 'pbp-outra');
  insert into public.profile_company(profile_id, company_id, role)
    values (dono, cid, 'owner'), (oper, cid, 'operator'), (outro, cid2, 'owner');
  insert into public.app_setting(key, value) values ('pagarme_movepark_recipient_id', 're_pbp_mp')
    on conflict (key) do update set value = excluded.value;

  insert into public.location(id, company_id, name, slug) values (loc, cid, 'PBP Loc', 'pbp-loc');
  insert into public.booking(id, code, profile_id, location_id, check_in_at, check_out_at, status, total_amount)
    values (bk, 'MP-PBP001', cli, loc, now() + interval '2 days', now() + interval '3 days', 'confirmed', 100);
  insert into public.payment(id, booking_id, provider, method, kind, amount, status, paid_at, installments, provider_payment_id, provider_charge_id)
    values (pay, bk, 'pagarme', 'card', 'booking', 100, 'paid', now(), 2, 'or_pbp1', 'ch_pbp1');
  -- A leitura com recebível, e depois uma releitura com erro da Pagar.me (sem recebível).
  insert into public.payment_gateway_event(payment_id, booking_id, kind, http_status, request, response, created_at)
    values (pay, bk, 'payables', 200, '{}',
            '{"data":[{"id":"pay_pbp_991","type":"credit","recipient_id":"re_pbp_parceiro","amount":4000,"fee":0,"anticipation_fee":40,"installment":2,"payment_date":"2026-12-01","original_payment_date":"2027-01-01","gateway_id":"gw_secreto"},
                      {"id":"pay_pbp_992","type":"credit","recipient_id":"re_pbp_mp","amount":1000,"fee":120,"installment":1,"payment_date":"2026-12-01"}]}',
            now() - interval '2 hours'),
           (pay, bk, 'payables', 500, '{}', '{"message":"erro"}', now() - interval '1 hour');

  perform set_config('test.dono', dono::text, false);
  perform set_config('test.oper', oper::text, false);
  perform set_config('test.cli', cli::text, false);
  perform set_config('test.outro', outro::text, false);
  perform set_config('test.bk', bk::text, false);
end $$;

-- ── quem não pode ───────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.cli'), 'role', 'authenticated')::text, true);
select throws_ok(format($$select public.partner_booking_payables(%L)$$, current_setting('test.bk')), '42501', null, 'cliente recebe 42501');
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.oper'), 'role', 'authenticated')::text, true);
select throws_ok(format($$select public.partner_booking_payables(%L)$$, current_setting('test.bk')), '42501', null, 'papel Operação (sem finance:read) recebe 42501');
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.outro'), 'role', 'authenticated')::text, true);
select throws_ok(format($$select public.partner_booking_payables(%L)$$, current_setting('test.bk')), '42501', null, 'Dono de outra empresa recebe 42501');
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.dono'), 'role', 'authenticated')::text, true);
select throws_ok(format($$select public.partner_booking_payables(%L)$$, gen_random_uuid()), '42501', null, 'reserva que não existe também é 42501');

-- ── o Dono lê ───────────────────────────────────────────────────────────────
select lives_ok(format($$select set_config('test.r', public.partner_booking_payables(%L)::text, false)$$, current_setting('test.bk')), 'o Dono lê os recebíveis');
reset role;

select is(jsonb_array_length(current_setting('test.r')::jsonb), 1, 'um pagamento');
select is(jsonb_array_length(current_setting('test.r')::jsonb -> 0 -> 'rows'), 2, 'a releitura com erro não apaga a leitura com recebível');
select is(current_setting('test.r')::jsonb -> 0 -> 'rows' -> 0 ->> 'recipient', 'partner', 'o recebedor do estacionamento sai como partner');
select is(current_setting('test.r')::jsonb -> 0 -> 'rows' -> 1 ->> 'recipient', 'movepark', 'o da Movepark sai como movepark');
select is((current_setting('test.r')::jsonb -> 0 -> 'rows' -> 0 ->> 'anticipation_fee')::int, 40, 'a antecipação vai');
select ok(position('re_pbp' in current_setting('test.r')) = 0, 'nenhum id de recebedor na Pagar.me sai');
select ok(position('gw_secreto' in current_setting('test.r')) = 0 and position('pay_pbp' in current_setting('test.r')) = 0,
          'campos que a conta não usa não saem');

select * from finish();
rollback;
