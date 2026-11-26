-- pgTAP: tabela de dias a mais da reserva (migration 20261208110000).
--
-- O balcão cobra no portão quem sai depois do combinado e precisa do preço de cada dia a mais. A
-- conta é a da troca de datas: diferença entre as durações pela tabela da compra
-- (`booking.price_by_days`). O que trava aqui:
--   1. Com a tabela da compra, devolve a estadia reservada e os dias seguintes dela, e só eles.
--   2. Operação (sem finance:read, que não lê `booking` desde 23/11/2026) chama e recebe a tabela.
--   3. Membro de outra empresa e anon não chamam.
--   4. Reserva sem tabela da compra e sem preço de hoje volta sem tabela (fonte nula), e as diárias
--      reservadas saem da conta com a tolerância da unidade.

begin;
select plan(12);

-- ── Fixture ────────────────────────────────────────────────────────────────────────────────
insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-4000-9200-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dam-admin@exemplo.test'),
  ('00000000-0000-4000-9200-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dam-operacao@exemplo.test'),
  ('00000000-0000-4000-9200-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dam-vizinho@exemplo.test'),
  ('00000000-0000-4000-9200-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dam-cliente@exemplo.test');

insert into public.profiles (id, role) values
  ('00000000-0000-4000-9200-000000000001', 'hub_admin'),
  ('00000000-0000-4000-9200-000000000002', 'company_operator'),
  ('00000000-0000-4000-9200-000000000003', 'company_operator'),
  ('00000000-0000-4000-9200-000000000004', 'customer')
on conflict (id) do update set role = excluded.role;

insert into public.company (id, name, slug) values
  ('00000000-0000-4000-9200-0000000000c1', 'DAM Estacionamentos', 'dam-estacionamentos'),
  ('00000000-0000-4000-9200-0000000000c2', 'DAM Vizinha', 'dam-vizinha');

insert into public.location (id, company_id, name, slug, tolerance_minutes) values
  ('00000000-0000-4000-9200-0000000000a1', '00000000-0000-4000-9200-0000000000c1', 'Unidade DAM', 'dam-unidade', 60);

insert into public.profile_company (profile_id, company_id, role) values
  ('00000000-0000-4000-9200-000000000002', '00000000-0000-4000-9200-0000000000c1', 'operator'),
  ('00000000-0000-4000-9200-000000000003', '00000000-0000-4000-9200-0000000000c2', 'owner');

-- B1: 3 diárias, com a tabela da compra cobrindo de 1 a 6 dias (o snapshot real vai a +30).
-- B2: sem snapshot e sem breakdown; 3 dias e 30 minutos com tolerância de 60 min = 3 diárias.
insert into public.booking (id, code, profile_id, location_id, check_in_at, check_out_at, status, customer_name) values
  ('00000000-0000-4000-9200-0000000000b1', 'MP-DAM001', '00000000-0000-4000-9200-000000000004',
   '00000000-0000-4000-9200-0000000000a1', '2026-12-10T10:00:00Z', '2026-12-13T10:00:00Z', 'confirmed', 'Cliente DAM'),
  ('00000000-0000-4000-9200-0000000000b2', 'MP-DAM002', '00000000-0000-4000-9200-000000000004',
   '00000000-0000-4000-9200-0000000000a1', '2026-12-10T10:00:00Z', '2026-12-13T10:30:00Z', 'confirmed', 'Cliente DAM');

update public.booking
   set price_breakdown = '{"days":3,"line_items":[{"kind":"parking","subtotal":56.7}]}'::jsonb,
       price_by_days = '{"captured_at":"2026-11-26T12:00:00Z","max_days":6,
                         "prices":{"1":18.9,"2":37.8,"3":56.7,"4":75.6,"5":94.5,"6":null}}'::jsonb
 where code = 'MP-DAM001';

-- ── 1. Tabela da compra (Operação, o balcão) ──────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-9200-000000000002","role":"authenticated"}', true);

select is(
  public.booking_extra_days_table('00000000-0000-4000-9200-0000000000b1') ->> 'price_source', 'compra',
  'Operação recebe a tabela, e ela é a da compra'
);
select is(
  (public.booking_extra_days_table('00000000-0000-4000-9200-0000000000b1') ->> 'booked_days')::int, 3,
  'diárias reservadas saem do snapshot de preço da reserva'
);
select is(
  public.booking_extra_days_table('00000000-0000-4000-9200-0000000000b1') -> 'prices',
  '{"3":56.7,"4":75.6,"5":94.5,"6":null}'::jsonb,
  'devolve da estadia reservada em diante, até onde a tabela da compra vai (duração sem preço vem nula)'
);
select is(
  (public.booking_extra_days_table('00000000-0000-4000-9200-0000000000b1') ->> 'tolerance_minutes')::int, 60,
  'leva a tolerância da unidade, para a tela contar a saída real com a mesma regra'
);
select ok(
  not (public.booking_extra_days_table('00000000-0000-4000-9200-0000000000b1') ? 'total_amount'),
  'não devolve o que a reserva pagou, só preço de tabela'
);

-- ── 2. Reserva sem tabela da compra e sem preço de hoje ────────────────────────────────────
select is(
  public.booking_extra_days_table('00000000-0000-4000-9200-0000000000b2') ->> 'price_source', null,
  'sem tabela da compra e sem preço de hoje, volta sem fonte'
);
select is(
  public.booking_extra_days_table('00000000-0000-4000-9200-0000000000b2') -> 'prices', '{}'::jsonb,
  'e sem preço nenhum'
);
select is(
  (public.booking_extra_days_table('00000000-0000-4000-9200-0000000000b2') ->> 'booked_days')::int, 3,
  'sem snapshot, as diárias saem das datas com a tolerância (3 dias e 30 min, tolerância de 60 = 3)'
);

-- ── 3. Quem não chama ───────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-9200-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$ select public.booking_extra_days_table('00000000-0000-4000-9200-0000000000b1') $$,
  '42501', null,
  'membro de outra empresa não vê a tabela da reserva alheia'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-9200-000000000004","role":"authenticated"}', true);
select throws_ok(
  $$ select public.booking_extra_days_table('00000000-0000-4000-9200-0000000000b1') $$,
  '42501', null,
  'o cliente não chama a tabela do balcão'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-9200-000000000001","role":"authenticated"}', true);
select is(
  public.booking_extra_days_table('00000000-0000-4000-9200-0000000000b1') ->> 'price_source', 'compra',
  'hub_admin vê a tabela de qualquer empresa'
);

reset role;
select ok(
  not has_function_privilege('anon', 'public.booking_extra_days_table(uuid)', 'execute'),
  'anon não executa a função'
);

select * from finish();
rollback;
