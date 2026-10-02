-- `quote_booking` devolve o que `create_booking` gravaria, e não deixa rastro.
--
-- A cotação roda o próprio `_create_booking_core` numa subtransação desfeita.
-- O que este arquivo segura:
--   1. o total da cotação é idêntico ao da reserva, na Básica e na Flex;
--   2. a cotação não cria reserva nenhuma;
--   3. sem sessão ela recusa, e anon nem executa;
--   4. erro de verdade do motor (check-out antes do check-in) sobe como está;
--   5. `my_booking_notifications` só devolve aviso de reserva do próprio usuário.
--
-- Fixture: uma unidade criada aqui com a mesma cara da unidade de teste da
-- Agência Fera (rascunho, `checkout_mode = hub`, tolerância de 60 min, pré-voo
-- cumprido, R$ 27 a diária) e um usuário marcado como testador, para enxergar o
-- rascunho. A fixture é própria porque o seed do CI não tem a Agência Fera, e
-- o arquivo nasceu buscando a unidade pelo nome: no CI `test.lpt` ficava vazio e
-- a suíte caía com `invalid input syntax for type uuid: ""`.
-- Ver docs/specs/customer/agent-booking.md §5.1.

begin;
select plan(15);

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'pgtap-quote@example.test', now(), now()),
       ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'pgtap-quote-outro@example.test', now(), now());
insert into public.profiles (id, role) values ('00000000-0000-4000-8000-0000000000b1', 'customer'),
  ('00000000-0000-4000-8000-0000000000b3', 'customer') on conflict (id) do nothing;
insert into public.tester_user (user_id) values ('00000000-0000-4000-8000-0000000000b1');

do $$
declare
  cid uuid := gen_random_uuid(); loc uuid := gen_random_uuid(); pt uuid := gen_random_uuid();
  cpt uuid := gen_random_uuid(); lpt uuid := gen_random_uuid();
begin
  insert into public.company(id, name, slug, status, onboarding_status, contract_accepted_at, gateway_split_enabled)
    values (cid, 'Cotação Empresa', 'cotacao-empresa', 'active', 'active', now(), true);
  insert into public.payout_recipient(company_id, provider, external_recipient_id, status)
    values (cid, 'pagarme', 're_cotacao', 'active');
  insert into public.location(id, company_id, name, slug, status, photos, is_draft, checkout_mode, tolerance_minutes)
    values (loc, cid, 'Cotação Unidade', 'cotacao-unidade', 'active',
            '["/Estacionamentos/seed/foto-de-teste.webp"]'::jsonb, true, 'hub', 60);
  insert into public.parking_type(id, code, name) values (pt, 'cotacao_coberta', 'Cotação Coberta');
  insert into public.company_parking_type(id, company_id, parking_type_id, base_price, default_capacity)
    values (cpt, cid, pt, 27, 10);
  insert into public.location_parking_type(id, location_id, company_parking_type_id, capacity, is_active)
    values (lpt, loc, cpt, 10, true);
  insert into public.pricing_rule(location_parking_type_id, strategy) values (lpt, 'uniform_by_duration');
  perform public.wl_mirror_apply_pricing(
    lpt, '{"strategy":"uniform_by_duration","old_price_strategy":"none"}'::jsonb,
    '[{"from_day":1,"to_day":null,"unit_price":27,"is_old_price":false}]'::jsonb, 27, '[]'::jsonb, 1);
  perform set_config('test.lpt', lpt::text, false);
end $$;
select set_config('test.in', to_char(date_trunc('day', now()) + interval '20 days 10 hours', 'YYYY-MM-DD"T"HH24:MI:SSOF'), true);
select set_config('test.out', to_char(date_trunc('day', now()) + interval '23 days 10 hours 30 minutes', 'YYYY-MM-DD"T"HH24:MI:SSOF'), true);

-- ── 3. Sem sessão ───────────────────────────────────────────────────────────

select is_empty(
  $$ select grantee from information_schema.role_routine_grants
      where routine_name in ('quote_booking', 'my_booking_notifications')
        and grantee in ('anon', 'PUBLIC') $$,
  'anon não executa quote_booking nem my_booking_notifications'
);

select throws_ok(
  format($$ select public.quote_booking(%L::uuid, %L::timestamptz, %L::timestamptz) $$,
         current_setting('test.lpt'), current_setting('test.in'), current_setting('test.out')),
  '42501', null,
  'sem sessão a cotação recusa'
);

-- ── Sessão do testador ──────────────────────────────────────────────────────

select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000000b1')::text, true);
set local role authenticated;

create temp table _q as
select public.quote_booking(current_setting('test.lpt')::uuid,
         current_setting('test.in')::timestamptz, current_setting('test.out')::timestamptz) as basica,
       public.quote_booking(current_setting('test.lpt')::uuid,
         current_setting('test.in')::timestamptz, current_setting('test.out')::timestamptz, 'flex') as flex;

-- ── 2. Sem rastro ───────────────────────────────────────────────────────────

select is(
  (select count(*)::int from public.booking where profile_id = '00000000-0000-4000-8000-0000000000b1'),
  0,
  'a cotação não deixa reserva'
);

select ok((select (basica ->> 'quote')::boolean and not (basica ? 'code') and not (basica ? 'booking_id') from _q),
  'a cotação não traz código, id nem validade de reserva');

-- 3 dias e 30 min com tolerância de 60 min: 3 diárias, como a reserva conta.
select is((select (basica ->> 'days')::int from _q), 3, 'diárias contadas com a tolerância da unidade');

-- ── 1. Mesmo total da reserva ───────────────────────────────────────────────

create temp table _b as
select public.create_booking_atomic('00000000-0000-4000-8000-0000000000b1', current_setting('test.lpt')::uuid,
         current_setting('test.in')::timestamptz, current_setting('test.out')::timestamptz) as r;

select is((select (r ->> 'total_amount')::numeric from _b), (select (basica ->> 'total_amount')::numeric from _q),
  'Básica: o total da cotação é o total que a reserva grava');

select is(
  (select total_amount from public.booking where code = (select r ->> 'code' from _b)),
  (select (basica ->> 'total_amount')::numeric from _q),
  'Básica: e é o que fica em booking.total_amount'
);

select is(
  (select (flex ->> 'total_amount')::numeric - (basica ->> 'total_amount')::numeric from _q),
  (select (flex ->> 'fare_price')::numeric from _q),
  'Flex: a diferença para a Básica é o preço da tarifa'
);

-- ── 4. Erro do motor sobe como está ─────────────────────────────────────────

select throws_ok(
  format($$ select public.quote_booking(%L::uuid, %L::timestamptz, %L::timestamptz) $$,
         current_setting('test.lpt'), current_setting('test.out'), current_setting('test.in')),
  'P0001', 'Check-out precisa ser após o check-in',
  'erro do motor chega ao agente com a mesma mensagem'
);

-- ── 5. Aviso só da própria reserva ──────────────────────────────────────────

reset role;
insert into public.notification_log (booking_id, event, channel, destination, status)
select id, 'confirmed', 'whatsapp', 'x', 'sent' from public.booking where code = (select r ->> 'code' from _b);
-- Reserva de outra pessoa, também com aviso: o código dela vai junto no pedido.
select set_config('test.alheia', (select public.create_booking_atomic('00000000-0000-4000-8000-0000000000b3',
  current_setting('test.lpt')::uuid, current_setting('test.in')::timestamptz,
  current_setting('test.out')::timestamptz) ->> 'code'), true);
insert into public.notification_log (booking_id, event, channel, destination, status)
select id, 'confirmed', 'whatsapp', 'x', 'sent' from public.booking where code = current_setting('test.alheia');
set local role authenticated;

select is(
  (select count(*)::int from public.my_booking_notifications(
     array[(select r ->> 'code' from _b), current_setting('test.alheia')])),
  1,
  'my_booking_notifications só devolve aviso de reserva do próprio usuário'
);

-- ── 6. Cotação sem conta, para agente confiável ─────────────────────────────

reset role;
insert into public.api_key (id, company_id, name, key_prefix, key_hash, environment, scopes)
values ('00000000-0000-4000-8000-0000000000b2', null, 'pgtap-quote-bot', 'mp_test_pgtapqb2',
        repeat('d', 64), 'test', array['identity:assert']);
select set_config('test.n_antes', (select count(*)::text from public.booking), true);

select is(
  (select (public.quote_booking_for_agent('00000000-0000-4000-8000-0000000000b2',
     current_setting('test.lpt')::uuid, current_setting('test.in')::timestamptz,
     current_setting('test.out')::timestamptz) ->> 'total_amount')::numeric),
  (select (basica ->> 'total_amount')::numeric from _q),
  'sem conta: mesmo total da cotação com sessão (sem cupom)'
);

select is((select count(*)::text from public.booking), current_setting('test.n_antes'),
  'sem conta: a cotação não deixa reserva');

select throws_ok(
  format($$ select public.quote_booking_for_agent(%L::uuid, %L::uuid, %L::timestamptz, %L::timestamptz) $$,
         gen_random_uuid(), current_setting('test.lpt'), current_setting('test.in'), current_setting('test.out')),
  '42501', null,
  'id que não é chave da Movepark é recusado'
);

update public.api_key set revoked_at = now() where id = '00000000-0000-4000-8000-0000000000b2';
select throws_ok(
  format($$ select public.quote_booking_for_agent('00000000-0000-4000-8000-0000000000b2', %L::uuid, %L::timestamptz, %L::timestamptz) $$,
         current_setting('test.lpt'), current_setting('test.in'), current_setting('test.out')),
  '42501', null,
  'chave revogada é recusada'
);

select is_empty(
  $$ select grantee from information_schema.role_routine_grants
      where routine_name in ('quote_booking_for_agent', '_quote_booking')
        and grantee in ('anon', 'authenticated', 'PUBLIC') $$,
  'só service_role executa a cotação sem conta'
);

select * from finish();
rollback;
