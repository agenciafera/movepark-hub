-- Por que o MCP filtra por dono, se a RLS existe.
--
-- A policy `booking_select` é `TO public` e permite
-- `is_hub_admin() OR profile_id = auth.uid() OR location_id IN (unidades da empresa)`.
-- Ela foi escrita para o painel do operador, onde a tela limita o que se pede: o
-- operador vê a agenda da própria unidade, e é isso que ele precisa ver.
--
-- O MCP `/customer` não tem tela. Os handlers `get_booking`, `get_booking_status`,
-- `list_my_bookings`, `set_booking_customer` e `set_booking_vehicle` consultavam
-- só por `code`, herdando essa policy. Medido no banco vivo em 11/08/2026: o JWT
-- de um membro de empresa parceira, sem escopo nenhum, lia CPF e telefone de
-- reserva de terceiro passando o código, e `list_my_bookings` devolvia a agenda
-- inteira da empresa como se fosse dele (3 reservas, nenhuma dele).
--
-- Estes testes travam os dois lados da decisão:
--   1. a policy continua larga de propósito, porque o painel depende dela;
--   2. por isso quem estreita é o handler, com `.eq("profile_id", <dono>)`.
--
-- Se alguém estreitar a policy, o teste 3 falha e a conversa acontece antes do
-- painel do operador quebrar em produção. Se alguém tirar o filtro do handler, o
-- teste 4 explica o que volta a vazar.
--
-- O papel escolhido na fixture é `finance`, o de menor alcance operacional, para
-- deixar claro que nem papel nem escopo entram na conta: basta pertencer à
-- empresa.
--
-- Ver docs/specs/mcp.md e supabase/functions/mcp/index.ts (`callCustomerTxn`).

begin;
select plan(6);

-- ── Fixture ────────────────────────────────────────────────────────────────
-- O dono da reserva não é membro da empresa, e o membro não é dono da reserva.
-- É o par que a produção tinha.
--
-- Os `profiles` são criados aqui, à mão, e não pelo trigger `on_auth_user_created`:
-- ele existe no banco vivo, mas NÃO no stack local, porque o dump do baseline não leva
-- o schema `auth`. Escrito contra o vivo, este arquivo morria no CI com violação de FK
-- em `profile_company` antes de rodar uma asserção sequer.

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-4000-9000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'pgtap-membro@exemplo.test'),
  ('00000000-0000-4000-9000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'pgtap-cliente@exemplo.test');

insert into public.profiles (id, role)
values
  ('00000000-0000-4000-9000-000000000001', 'company_operator'),
  ('00000000-0000-4000-9000-000000000002', 'customer')
on conflict (id) do update set role = excluded.role;

insert into public.company (id, name, slug)
values ('00000000-0000-4000-9000-0000000000c1', 'PgTAP Estacionamentos', 'pgtap-estacionamentos');

insert into public.location (id, company_id, name, slug)
values ('00000000-0000-4000-9000-0000000000a1', '00000000-0000-4000-9000-0000000000c1',
        'Unidade PgTAP', 'unidade-pgtap');

insert into public.profile_company (profile_id, company_id, role)
values ('00000000-0000-4000-9000-000000000001', '00000000-0000-4000-9000-0000000000c1', 'finance');

insert into public.booking
  (id, code, profile_id, location_id, check_in_at, check_out_at,
   customer_email, customer_phone, customer_tax_id)
values
  ('00000000-0000-4000-9000-0000000000b1', 'MP-PGTAP1',
   '00000000-0000-4000-9000-000000000002', '00000000-0000-4000-9000-0000000000a1',
   now() + interval '1 day', now() + interval '3 days',
   'cliente@exemplo.test', '+5511999999999', '39053344705');

-- ── 1 e 2. Anônimo não enxerga nada ─────────────────────────────────────────

set local role anon;

select is_empty(
  $$ select code from public.booking where code = 'MP-PGTAP1' $$,
  'anon não lê a reserva nem sabendo o código'
);

select is_empty(
  $$ select code from public.booking $$,
  'anon não lista a tabela de reservas'
);

-- ── 3 e 4. A policy larga é intencional, e por isso não protege o PII ───────

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-9000-000000000001","role":"authenticated"}',
  true
);

select isnt_empty(
  $$ select code from public.booking where code = 'MP-PGTAP1' $$,
  'membro de empresa alcança a reserva da unidade pela RLS (o painel do operador depende disto)'
);

select is(
  (select customer_tax_id from public.booking where code = 'MP-PGTAP1'),
  '39053344705',
  'sem filtro de dono, o membro lê o CPF do cliente: a RLS não é a defesa aqui'
);

-- ── 5 e 6. O filtro do handler é o que fecha, na leitura e na escrita ──────

select is_empty(
  $$ select code from public.booking
      where code = 'MP-PGTAP1'
        and profile_id = '00000000-0000-4000-9000-000000000001' $$,
  'com o filtro por dono que o MCP aplica, o membro não alcança a reserva alheia'
);

select is(
  (with tentativa as (
     update public.booking set customer_phone = '+5511000000000'
      where code = 'MP-PGTAP1'
        and profile_id = '00000000-0000-4000-9000-000000000001'
     returning code
   )
   select count(*)::int from tentativa),
  0,
  'com o filtro por dono, o membro não reescreve o contato de reserva alheia'
);

select * from finish();
rollback;
