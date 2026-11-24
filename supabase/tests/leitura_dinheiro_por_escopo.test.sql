-- pgTAP: a leitura de dinheiro de reserva e pagamento é por escopo (finance:read), no servidor.
-- Migrations 20261206140000 (RPCs do balcão) e 20261206140100 (policies). ADR-005, permissions.md
-- "Dinheiro da reserva".
--
-- ANTES (medido em 23/11/2026): `booking_select` e `payment_select` liberavam toda linha da empresa a
-- qualquer membro. Quem era Operação (sem finance:read) lia total_amount, price_breakdown,
-- payment.amount, split, taxa do gateway, estorno e antecipação direto pelo PostgREST, mesmo com a
-- tela escondendo. RLS escolhe linha e não coluna: a saída foi só deixar a linha para quem tem o
-- escopo e servir o balcão por RPC definer que nunca devolve valor.
--
-- O que trava aqui, nos dois lados:
--   1. Operação não lê booking nem payment pela tabela. Dono, Gerente e Financeiro leem, o hub_admin
--      lê tudo, o cliente lê a própria, e o membro de OUTRA empresa não lê a alheia.
--   2. As RPCs do balcão acham a reserva da própria empresa e nunca devolvem dinheiro: os campos de
--      valor voltam nulos e o pagamento só traz situação e forma.
--   3. Marcar a reserva (check-in etc.) sem ler a tabela exige bookings:write ou bookings:checkin.
--   4. `bookings_list_page`, agora definer, segue recortando por empresa e só soma o dinheiro de
--      quem tem finance:read.
--   5. Anon não executa nada disto.

begin;
select plan(46);

-- ── Fixture ────────────────────────────────────────────────────────────────────────────────
-- Um usuário por papel, na mesma empresa X; um membro da empresa Y (a vizinha); o cliente dono da
-- reserva. Os profiles são criados à mão (o trigger de auth.users não existe no stack local).
insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-4000-9100-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ldx-admin@exemplo.test'),
  ('00000000-0000-4000-9100-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ldx-dono@exemplo.test'),
  ('00000000-0000-4000-9100-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ldx-gerente@exemplo.test'),
  ('00000000-0000-4000-9100-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ldx-financeiro@exemplo.test'),
  ('00000000-0000-4000-9100-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ldx-operacao@exemplo.test'),
  ('00000000-0000-4000-9100-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ldx-cliente@exemplo.test'),
  ('00000000-0000-4000-9100-000000000007', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ldx-vizinho@exemplo.test');

insert into public.profiles (id, role) values
  ('00000000-0000-4000-9100-000000000001', 'hub_admin'),
  ('00000000-0000-4000-9100-000000000002', 'company_operator'),
  ('00000000-0000-4000-9100-000000000003', 'company_operator'),
  ('00000000-0000-4000-9100-000000000004', 'company_operator'),
  ('00000000-0000-4000-9100-000000000005', 'company_operator'),
  ('00000000-0000-4000-9100-000000000006', 'customer'),
  ('00000000-0000-4000-9100-000000000007', 'company_operator')
on conflict (id) do update set role = excluded.role;

insert into public.company (id, name, slug) values
  ('00000000-0000-4000-9100-0000000000c1', 'LDX Estacionamentos', 'ldx-estacionamentos'),
  ('00000000-0000-4000-9100-0000000000c2', 'LDX Vizinha', 'ldx-vizinha');

insert into public.location (id, company_id, name, slug) values
  ('00000000-0000-4000-9100-0000000000a1', '00000000-0000-4000-9100-0000000000c1', 'Unidade X', 'ldx-unidade-x'),
  ('00000000-0000-4000-9100-0000000000a2', '00000000-0000-4000-9100-0000000000c2', 'Unidade Y', 'ldx-unidade-y');

insert into public.profile_company (profile_id, company_id, role) values
  ('00000000-0000-4000-9100-000000000002', '00000000-0000-4000-9100-0000000000c1', 'owner'),
  ('00000000-0000-4000-9100-000000000003', '00000000-0000-4000-9100-0000000000c1', 'manager'),
  ('00000000-0000-4000-9100-000000000004', '00000000-0000-4000-9100-0000000000c1', 'finance'),
  ('00000000-0000-4000-9100-000000000005', '00000000-0000-4000-9100-0000000000c1', 'operator'),
  ('00000000-0000-4000-9100-000000000007', '00000000-0000-4000-9100-0000000000c2', 'owner');

-- Reserva da empresa X (do cliente) e da empresa Y (de outro cliente: o próprio vizinho).
insert into public.booking (id, code, profile_id, location_id, check_in_at, check_out_at, status, customer_name) values
  ('00000000-0000-4000-9100-0000000000b1', 'MP-LDX001', '00000000-0000-4000-9100-000000000006',
   '00000000-0000-4000-9100-0000000000a1', now() + interval '1 hour', now() + interval '3 days', 'confirmed', 'Cliente X'),
  ('00000000-0000-4000-9100-0000000000b2', 'MP-LDX002', '00000000-0000-4000-9100-000000000007',
   '00000000-0000-4000-9100-0000000000a2', now() + interval '1 hour', now() + interval '3 days', 'confirmed', 'Cliente Y');

update public.booking
   set total_amount = 123.45,
       price_breakdown = '{"days":2,"line_items":[{"kind":"parking","subtotal":100}]}'::jsonb,
       fare_price_cents = 2345
 where code = 'MP-LDX001';

insert into public.payment (booking_id, provider, method, amount, status, kind, paid_at, split, gateway_fee_cents)
values ('00000000-0000-4000-9100-0000000000b1', 'pagarme', 'pix', 123.45, 'paid', 'booking', now(),
        '[{"role":"partner","amount":10000},{"role":"movepark","amount":2345}]'::jsonb, 117);

-- Extensão de saída da proteção de voo da reserva X: o excedente que o balcão cobra.
insert into public.booking_fare_extension (booking_id, old_check_out_at, new_check_out_at, overage_cents, overage_daily_cents)
values ('00000000-0000-4000-9100-0000000000b1', now() + interval '3 days', now() + interval '4 days', 2790, 2790);

-- ── 1. Policies: Operação não lê a tabela; quem tem finance:read lê ─────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-9100-000000000005","role":"authenticated"}', true);

select is_empty(
  $$ select 1 from public.booking where code = 'MP-LDX001' $$,
  'Operação não lê a reserva da própria empresa pela tabela'
);
select is_empty(
  $$ select total_amount from public.booking $$,
  'Operação não lê total_amount de reserva nenhuma'
);
select is_empty(
  $$ select 1 from public.payment $$,
  'Operação não lê payment (valor, split, taxa, estorno, antecipação)'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-9100-000000000003","role":"authenticated"}', true);
select is(
  (select total_amount from public.booking where code = 'MP-LDX001'), 123.45,
  'Gerente lê o total da reserva da própria empresa'
);
select is(
  (select amount from public.payment where booking_id = '00000000-0000-4000-9100-0000000000b1'), 123.45,
  'Gerente lê o pagamento da própria empresa'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-9100-000000000004","role":"authenticated"}', true);
select is(
  (select total_amount from public.booking where code = 'MP-LDX001'), 123.45,
  'Financeiro lê o total da reserva da própria empresa'
);
select is(
  (select gateway_fee_cents from public.payment where booking_id = '00000000-0000-4000-9100-0000000000b1'), 117,
  'Financeiro lê a taxa do gateway do pagamento'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-9100-000000000002","role":"authenticated"}', true);
select is(
  (select total_amount from public.booking where code = 'MP-LDX001'), 123.45,
  'Dono lê o total da reserva da própria empresa'
);
select is(
  (select count(*)::int from public.booking), 1,
  'Dono só vê a reserva da própria empresa, não a da vizinha'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-9100-000000000001","role":"authenticated"}', true);
select cmp_ok(
  (select count(*)::int from public.booking where code in ('MP-LDX001', 'MP-LDX002')), '=', 2,
  'hub_admin lê as reservas das duas empresas'
);
select is(
  (select amount from public.payment where booking_id = '00000000-0000-4000-9100-0000000000b1'), 123.45,
  'hub_admin lê o pagamento'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-9100-000000000006","role":"authenticated"}', true);
select is(
  (select total_amount from public.booking where code = 'MP-LDX001'), 123.45,
  'o cliente lê o total da PRÓPRIA reserva (o checkout e a conta dele não mudam)'
);
select is(
  (select amount from public.payment where booking_id = '00000000-0000-4000-9100-0000000000b1'), 123.45,
  'o cliente lê o PRÓPRIO pagamento'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-9100-000000000007","role":"authenticated"}', true);
select is_empty(
  $$ select 1 from public.booking where code = 'MP-LDX001' $$,
  'o dono da empresa vizinha não lê a reserva da empresa X'
);
select is_empty(
  $$ select 1 from public.payment where booking_id = '00000000-0000-4000-9100-0000000000b1' $$,
  'o dono da empresa vizinha não lê o pagamento da empresa X'
);
select is_empty(
  $$ select 1 from public.booking_fare_extension where booking_id = '00000000-0000-4000-9100-0000000000b1' $$,
  'o dono da empresa vizinha não lê a extensão da empresa X'
);

reset role;
-- Sem sessão: nada de `sub` nos claims (o do teste anterior ficaria valendo para o anon).
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select is_empty($$ select 1 from public.booking $$, 'anon não lê reserva');
select is_empty($$ select 1 from public.payment $$, 'anon não lê pagamento');

-- ── 2. RPCs do balcão: a reserva da própria empresa, nunca o dinheiro ────────────────────────
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-9100-000000000005","role":"authenticated"}', true);

select is(
  jsonb_array_length(public.operator_bookings_by_ids(array['00000000-0000-4000-9100-0000000000b1', '00000000-0000-4000-9100-0000000000b2']::uuid[])), 1,
  'por ids, Operação recebe só a reserva da própria empresa (a da vizinha fica de fora)'
);
-- A extensão da proteção de voo (o excedente que o balcão cobra) segue legível pelo balcão, pela policy
-- de bookings:read, mesmo sem ele ler a reserva (20261206150000).
select is(
  (select overage_cents from public.booking_fare_extension where booking_id = '00000000-0000-4000-9100-0000000000b1'), 2790,
  'Operação lê o excedente da proteção de voo da própria empresa'
);
select is(
  (select jsonb_array_length(public.operator_bookings_by_ids(array['00000000-0000-4000-9100-0000000000b1']::uuid[]) -> 0 -> 'fare_extensions')), 1,
  'e a RPC do balcão traz a extensão junto da reserva'
);
select is(
  (public.operator_bookings_by_ids(array['00000000-0000-4000-9100-0000000000b1']::uuid[])) -> 0 ->> 'code', 'MP-LDX001',
  'a reserva do balcão traz o código'
);
select is(
  ((public.operator_bookings_by_ids(array['00000000-0000-4000-9100-0000000000b1']::uuid[])) -> 0 ->> 'paid_amount')::numeric, 123.45,
  'a lista do balcão traz só o total pago (paid_amount), para conferir a reserva'
);
select is(
  (public.operator_booking_by_code('MP-LDX001') ->> 'paid_amount'), null,
  'o detalhe do balcão segue sem nenhum valor'
);
select is(
  (select count(*)::int
     from jsonb_each(public.operator_bookings_by_ids(array['00000000-0000-4000-9100-0000000000b1']::uuid[]) -> 0) k
    where k.key in ('total_amount', 'price_breakdown', 'price_by_days', 'fare_price_cents',
                    'commission_rule_id', 'commission_channel', 'commission_take_rate_bps',
                    'commission_fee_payer', 'commission_chargeback_bearer',
                    'commission_installments_max', 'commission_installments_interest_free',
                    'commission_anticipation_payer')
      and k.value <> 'null'::jsonb),
  0,
  'nenhuma coluna de dinheiro da reserva sai com valor pela RPC do balcão'
);
select is(
  (select array_agg(k order by k)
     from jsonb_object_keys(public.operator_bookings_by_ids(array['00000000-0000-4000-9100-0000000000b1']::uuid[]) -> 0 -> 'payments' -> 0) k),
  array['created_at', 'id', 'installments', 'method', 'paid_at', 'refunded_at', 'status'],
  'o pagamento do balcão traz só situação e forma: sem amount, split, taxa nem estorno'
);
select is(
  public.operator_bookings_by_ids(array['00000000-0000-4000-9100-0000000000b1']::uuid[]) -> 0 -> 'payments' -> 0 ->> 'method', 'pix',
  'a forma de pagamento continua visível ao balcão'
);
select is(
  public.operator_booking_by_code('MP-LDX001') ->> 'code', 'MP-LDX001',
  'por código, Operação acha a reserva da própria empresa'
);
select is(
  public.operator_booking_by_code('MP-LDX002'), null::jsonb,
  'por código, a reserva da vizinha vem nula'
);
select is(
  jsonb_array_length(public.operator_day_agenda(now() - interval '1 day', now() + interval '10 days', null, array['confirmed'])), 1,
  'agenda do dia: só a reserva da própria empresa'
);
select is(
  (select count(*)::int from public.operator_booking_facts(now() - interval '1 day', null, null, null, false)), 1,
  'fatos de reserva: só os da própria empresa'
);
select is(
  public.counter_can_open_booking('MP-LDX001'), true,
  'o balcão pode abrir o voucher da própria reserva'
);
select is(
  public.counter_can_open_booking('MP-LDX002'), false,
  'o balcão não abre o voucher da reserva da vizinha'
);

-- O montador do balcão (`counter_booking_json`) usa `to_jsonb(b)` e ZERA uma lista de colunas de
-- dinheiro: coluna nova em `booking` sairia para o balcão sem ninguém decidir. Este teste obriga a
-- decisão: toda coluna da tabela precisa estar numa das duas listas abaixo. Se ele falhar, a coluna
-- nova é de dinheiro (entra em `counter_booking_json` e na lista "zerada") ou não é (entra na lista
-- "liberada", com a razão no PR).
select is(
  (select array_agg(c.column_name::text order by c.column_name)
     from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'booking'
      and c.column_name <> all (array[
        -- zeradas pela RPC do balcão (dinheiro)
        'total_amount', 'price_breakdown', 'price_by_days', 'fare_price_cents',
        'commission_rule_id', 'commission_channel', 'commission_take_rate_bps',
        'commission_fee_payer', 'commission_chargeback_bearer', 'commission_locked',
        'commission_installments_max', 'commission_installments_interest_free',
        'commission_anticipation_payer',
        -- liberadas ao balcão (não são dinheiro)
        'id', 'code', 'profile_id', 'location_id', 'vehicle_id', 'check_in_at', 'check_out_at',
        'status', 'currency', 'notes', 'created_at', 'updated_at', 'deleted_at', 'expires_at',
        'passenger_count', 'has_pcd', 'origin', 'utm_source', 'utm_medium', 'utm_campaign',
        'external_id', 'voucher_url', 'checked_in_at', 'checked_out_at', 'review_request_sent_at',
        'customer_name', 'customer_email', 'customer_phone', 'created_via_api_key_id',
        'idempotency_key', 'fare_tier', 'fare_cancel_until', 'fare_benefits',
        'confirmation_email_sent_at', 'customer_first_name', 'customer_last_name',
        'customer_tax_id', 'passenger_first_name', 'passenger_last_name', 'passenger_phone',
        'cancellation_email_sent_at', 'attribution', 'flight_number', 'wl_external_version',
        'ga_client_id', 'ga_session_id', 'ga_purchase_sent_at'
      ])),
  null::text[],
  'toda coluna de booking está classificada na RPC do balcão (dinheiro zerado ou liberada)'
);

-- ── 3. Marcar a reserva sem ler a tabela ─────────────────────────────────────────────────────
select lives_ok(
  $$ select public.operator_set_booking_status('00000000-0000-4000-9100-0000000000b1', 'checked_in', now(), null, null, false) $$,
  'Operação marca o check-in pela RPC'
);
select is(
  public.operator_booking_by_code('MP-LDX001') ->> 'status', 'checked_in',
  'a marcação valeu'
);
select throws_ok(
  $$ select public.operator_set_booking_status('00000000-0000-4000-9100-0000000000b2', 'checked_in', now(), null, null, false) $$,
  '42501', null,
  'Operação não marca a reserva da empresa vizinha'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-9100-000000000004","role":"authenticated"}', true);
select throws_ok(
  $$ select public.operator_set_booking_status('00000000-0000-4000-9100-0000000000b1', 'completed', null, now(), null, false) $$,
  '42501', null,
  'Financeiro (sem bookings:write nem bookings:checkin) não marca a reserva'
);

-- ── 4. A lista (definer) recorta por empresa e só soma dinheiro de quem tem finance:read ───────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-9100-000000000005","role":"authenticated"}', true);
select is(
  (public.bookings_list_page(p_source => 'hub', p_limit => 50, p_with_summary => true)) -> 'items' -> 0 ->> 'id',
  '00000000-0000-4000-9100-0000000000b1',
  'a lista do balcão traz a reserva da própria empresa'
);
select is(
  (public.bookings_list_page(p_source => 'hub', p_limit => 50, p_with_summary => true)) ->> 'total', '1',
  'a lista do balcão não conta a reserva da vizinha'
);
select is(
  ((public.bookings_list_page(p_source => 'hub', p_limit => 50, p_with_summary => true)) -> 'summary' -> 'hub' ->> 'paid_amount')::numeric, 0::numeric,
  'o resumo da lista não soma dinheiro para o balcão'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-9100-000000000002","role":"authenticated"}', true);
select is(
  ((public.bookings_list_page(p_source => 'hub', p_limit => 50, p_with_summary => true)) -> 'summary' -> 'hub' ->> 'paid_amount')::numeric, 123.45::numeric,
  'o resumo da lista soma o dinheiro para o Dono'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-9100-000000000007","role":"authenticated"}', true);
select is(
  (select count(*)::int
     from jsonb_array_elements((public.bookings_list_page(p_source => 'hub', p_limit => 50, p_with_summary => false)) -> 'items') i
    where i ->> 'id' = '00000000-0000-4000-9100-0000000000b1'),
  0,
  'a lista da empresa vizinha não traz a reserva da empresa X'
);

-- A busca do painel (definer, com a empresa escrita na função) continua achando a reserva do balcão.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-9100-000000000005","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.admin_search('MP-LDX', 5) where kind = 'booking'), 1,
  'a busca do balcão acha a reserva da própria empresa e não a da vizinha'
);

-- ── 5. Anon não executa nada disto ────────────────────────────────────────────────────────────
reset role;
select is(
  (select count(*)::int
     from unnest(array[
       'public.operator_bookings_by_ids(uuid[])',
       'public.operator_booking_by_code(text, boolean, boolean)',
       'public.operator_day_agenda(timestamptz, timestamptz, uuid[], text[])',
       'public.operator_booking_facts(timestamptz, timestamptz, uuid[], text[], boolean)',
       'public.operator_set_booking_status(uuid, text, timestamptz, timestamptz, text, boolean)',
       'public.counter_can_open_booking(text)',
       'public.counter_company_ids()',
       'public.finance_company_ids()',
       'public.counter_booking_json(uuid, boolean)',
       'public.counter_can_see_vehicle(uuid)',
       'public.counter_can_see_booking(uuid)'
     ]) f
    where has_function_privilege('anon', f::regprocedure, 'execute')),
  0,
  'nenhuma função nova é executável por anon'
);
select is(
  has_function_privilege('authenticated', 'public.counter_booking_json(uuid, boolean)'::regprocedure, 'execute'), false,
  'o montador interno do balcão não é chamável direto por authenticated'
);

select * from finish();
rollback;
