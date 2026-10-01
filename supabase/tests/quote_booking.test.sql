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
-- Fixture: a unidade de teste da Agência Fera (rascunho, `checkout_mode = hub`)
-- e um usuário criado aqui e marcado como testador, para enxergar o rascunho.
-- Ver docs/specs/customer/agent-booking.md §5.1.

begin;
select plan(10);

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'pgtap-quote@example.test', now(), now());
insert into public.tester_user (user_id) values ('00000000-0000-4000-8000-0000000000b1');

select set_config('test.lpt', (
  select lpt.id::text from public.location_parking_type lpt
    join public.location l on l.id = lpt.location_id
    join public.company c on c.id = l.company_id
   where c.name = 'Agência Fera' and l.deleted_at is null and lpt.is_active
   order by lpt.created_at limit 1), true);
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
select set_config('test.alheia', (select code from public.booking
  where profile_id <> '00000000-0000-4000-8000-0000000000b1' and deleted_at is null limit 1), true);
insert into public.notification_log (booking_id, event, channel, destination, status)
select id, 'confirmed', 'whatsapp', 'x', 'sent' from public.booking where code = current_setting('test.alheia');
set local role authenticated;

select is(
  (select count(*)::int from public.my_booking_notifications(
     array[(select r ->> 'code' from _b), current_setting('test.alheia')])),
  1,
  'my_booking_notifications só devolve aviso de reserva do próprio usuário'
);

select * from finish();
rollback;
