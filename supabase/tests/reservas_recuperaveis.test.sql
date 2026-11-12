-- pgTAP: lista de reservas não concluídas que ainda dá para recuperar
-- (`operator_recoverable_bookings`, 20261203130000).
--
-- O que trava:
--   1. recuperável = expired com entrada no futuro; expirada com data passada fica fora;
--   2. uma linha por pessoa, a tentativa mais recente, com a contagem de tentativas;
--   3. quem comprou depois sai, casando por conta, e-mail ou telefone (só dígitos, sem DDI);
--   4. contato que falta no snapshot vem do auth.users, e "onde parou" é derivado;
--   5. isolamento: a empresa vê só as próprias, e a outra empresa é recusada;
--   6. escopo: Operação não tem `bookings:recovery` e é recusada; Dono passa;
--   7. exportar registra quem, quando e quantas linhas;
--   8. compra em OUTRA empresa só tira a pessoa da lista quando é a mesma conta. Casar por
--      e-mail ou telefone digitado (snapshot) virava oráculo: o parceiro criava uma reserva-isca
--      com o contato de alguém e descobria, pelo sumiço da linha, se e quando ela comprou fora.
--
-- `created_at` é explícito em toda reserva: dentro da transação `now()` é constante, e a regra
-- "comprou depois" compara justamente o momento de criação.
-- Transação com rollback.

begin;
select plan(17);

insert into auth.users (id, instance_id, aud, role, email, phone)
values
  ('00000000-0000-4000-9100-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rec-dono@exemplo.test', null),
  ('00000000-0000-4000-9100-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rec-operacao@exemplo.test', null),
  ('00000000-0000-4000-9100-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rec-dono2@exemplo.test', null),
  -- clientes
  ('00000000-0000-4000-9100-0000000000a1', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ana@exemplo.test', null),
  ('00000000-0000-4000-9100-0000000000b1', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'bia@exemplo.test', null),
  ('00000000-0000-4000-9100-0000000000c1', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'caio@exemplo.test', null),
  ('00000000-0000-4000-9100-0000000000c2', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'caio-outra-conta@exemplo.test', null),
  ('00000000-0000-4000-9100-0000000000d1', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'davi@exemplo.test', null),
  ('00000000-0000-4000-9100-0000000000e1', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'eva-conta@exemplo.test', '5511977776666');

insert into public.profiles (id, role) values
  ('00000000-0000-4000-9100-000000000001', 'company_operator'),
  ('00000000-0000-4000-9100-000000000002', 'company_operator'),
  ('00000000-0000-4000-9100-000000000003', 'company_operator'),
  ('00000000-0000-4000-9100-0000000000a1', 'customer'),
  ('00000000-0000-4000-9100-0000000000b1', 'customer'),
  ('00000000-0000-4000-9100-0000000000c1', 'customer'),
  ('00000000-0000-4000-9100-0000000000c2', 'customer'),
  ('00000000-0000-4000-9100-0000000000d1', 'customer'),
  ('00000000-0000-4000-9100-0000000000e1', 'customer')
on conflict (id) do update set role = excluded.role;

insert into public.company (id, name, slug) values
  ('00000000-0000-4000-9100-0000000000f1', 'Rec Um', 'rec-um'),
  ('00000000-0000-4000-9100-0000000000f2', 'Rec Dois', 'rec-dois');

insert into public.location (id, company_id, name, slug) values
  ('00000000-0000-4000-9100-0000000001a1', '00000000-0000-4000-9100-0000000000f1', 'Rec Um GRU', 'rec-um-gru'),
  ('00000000-0000-4000-9100-0000000001a2', '00000000-0000-4000-9100-0000000000f2', 'Rec Dois GRU', 'rec-dois-gru');

insert into public.profile_company (profile_id, company_id, role) values
  ('00000000-0000-4000-9100-000000000001', '00000000-0000-4000-9100-0000000000f1', 'owner'),
  ('00000000-0000-4000-9100-000000000002', '00000000-0000-4000-9100-0000000000f1', 'operator'),
  ('00000000-0000-4000-9100-000000000003', '00000000-0000-4000-9100-0000000000f2', 'owner');

insert into public.booking
  (code, profile_id, location_id, status, check_in_at, check_out_at, created_at, total_amount,
   customer_name, customer_email, customer_phone, origin, price_breakdown)
values
  -- Ana: duas tentativas, as duas com viagem futura. Fica a mais recente, com 2 tentativas.
  ('REC-ANA-1', '00000000-0000-4000-9100-0000000000a1', '00000000-0000-4000-9100-0000000001a1',
   'expired', now() + interval '5 days', now() + interval '9 days', now() - interval '3 hours', 88.5,
   'Ana', 'ana@exemplo.test', '11911112222', 'hub_direct', '{"days": 4}'),
  ('REC-ANA-2', '00000000-0000-4000-9100-0000000000a1', '00000000-0000-4000-9100-0000000001a1',
   'expired', now() + interval '5 days', now() + interval '9 days', now() - interval '2 hours', 92.5,
   'Ana', 'ana@exemplo.test', '11911112222', 'whatsapp-bot', '{"days": 4}'),
  -- Bia: abandonou e pagou minutos depois na mesma empresa. Sai.
  ('REC-BIA-1', '00000000-0000-4000-9100-0000000000b1', '00000000-0000-4000-9100-0000000001a1',
   'expired', now() + interval '6 days', now() + interval '8 days', now() - interval '3 hours', 50,
   'Bia', 'bia@exemplo.test', '11922223333', 'hub_direct', '{"days": 2}'),
  ('REC-BIA-2', '00000000-0000-4000-9100-0000000000b1', '00000000-0000-4000-9100-0000000001a1',
   'confirmed', now() + interval '6 days', now() + interval '8 days', now() - interval '2 hours', 50,
   'Bia', 'bia@exemplo.test', '11922223333', 'hub_direct', '{"days": 2}'),
  -- Caio: abandonou e comprou depois com OUTRA conta, mesmo telefone em outro formato. Sai.
  ('REC-CAIO-1', '00000000-0000-4000-9100-0000000000c1', '00000000-0000-4000-9100-0000000001a1',
   'expired', now() + interval '7 days', now() + interval '9 days', now() - interval '3 hours', 70,
   'Caio', 'caio@exemplo.test', '+55 (11) 93333-4444', 'hub_direct', '{"days": 2}'),
  ('REC-CAIO-2', '00000000-0000-4000-9100-0000000000c2', '00000000-0000-4000-9100-0000000001a1',
   'confirmed', now() + interval '7 days', now() + interval '9 days', now() - interval '1 hour', 70,
   'Caio', 'caio-outra-conta@exemplo.test', '11933334444', 'hub_direct', '{"days": 2}'),
  -- Davi: expirada com entrada no passado. Não é recuperável.
  ('REC-DAVI-1', '00000000-0000-4000-9100-0000000000d1', '00000000-0000-4000-9100-0000000001a1',
   'expired', now() - interval '1 day', now() + interval '2 days', now() - interval '3 days', 60,
   'Davi', 'davi@exemplo.test', '11944445555', 'hub_direct', '{"days": 3}'),
  -- Eva: parou antes do passo 1 (snapshot vazio). O contato vem do auth.users.
  ('REC-EVA-1', '00000000-0000-4000-9100-0000000000e1', '00000000-0000-4000-9100-0000000001a1',
   'expired', now() + interval '20 days', now() + interval '25 days', now() - interval '1 day', 107.4,
   null, null, null, 'hub_destino', '{"days": 5}'),
  -- Isca: reserva na empresa dois com o contato da Gabi (cliente da empresa um, sem conta aqui).
  ('REC-ISCA-1', '00000000-0000-4000-9100-000000000003', '00000000-0000-4000-9100-0000000001a2',
   'expired', now() + interval '30 days', now() + interval '33 days', now() - interval '5 hours', 90,
   'Gabi', 'gabi@exemplo.test', '11955556666', 'hub_direct', '{"days": 3}'),
  ('REC-GABI-1', '00000000-0000-4000-9100-0000000000d1', '00000000-0000-4000-9100-0000000001a1',
   'confirmed', now() + interval '30 days', now() + interval '33 days', now() - interval '4 hours', 90,
   'Gabi', 'gabi@exemplo.test', '11955556666', 'hub_direct', '{"days": 3}'),
  -- Na outra empresa: não pode aparecer para a primeira.
  ('REC-OUTRA-1', '00000000-0000-4000-9100-0000000000d1', '00000000-0000-4000-9100-0000000001a2',
   'expired', now() + interval '10 days', now() + interval '12 days', now() - interval '1 day', 40,
   'Davi', 'davi@exemplo.test', '11944445555', 'hub_direct', '{"days": 2}');

-- A expiração grava deleted_at; a RPC tem que ler apesar disso.
update public.booking set deleted_at = now() - interval '1 hour'
 where code like 'REC-%' and status = 'expired';

-- ── Dono da empresa um ──────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-9100-000000000001","role":"authenticated"}', true);

select is(
  (select array_agg(code order by check_in_at)
     from public.operator_recoverable_bookings('00000000-0000-4000-9100-0000000000f1')),
  array['REC-ANA-2', 'REC-EVA-1']::text[],
  'lista só as expiradas com entrada futura, uma por pessoa, sem quem comprou depois e sem outra empresa'
);

select is(
  (select attempts from public.operator_recoverable_bookings('00000000-0000-4000-9100-0000000000f1')
    where code = 'REC-ANA-2'),
  2,
  'conta as duas tentativas da mesma pessoa'
);

select is(
  (select origin from public.operator_recoverable_bookings('00000000-0000-4000-9100-0000000000f1')
    where code = 'REC-ANA-2'),
  'whatsapp-bot',
  'a origem da tentativa mais recente sai crua (o front marca "falou com a Mia")'
);

select is(
  (select stopped_at from public.operator_recoverable_bookings('00000000-0000-4000-9100-0000000000f1')
    where code = 'REC-ANA-2'),
  'veiculo',
  'tentativa sem veículo parou antes do passo 2'
);

select is(
  (select stopped_at from public.operator_recoverable_bookings('00000000-0000-4000-9100-0000000000f1')
    where code = 'REC-EVA-1'),
  'dados',
  'snapshot sem contato parou antes do passo 1'
);

select is(
  (select customer_email || '|' || customer_phone
     from public.operator_recoverable_bookings('00000000-0000-4000-9100-0000000000f1')
    where code = 'REC-EVA-1'),
  'eva-conta@exemplo.test|5511977776666',
  'contato que falta no snapshot vem do auth.users'
);

select is(
  (select days from public.operator_recoverable_bookings('00000000-0000-4000-9100-0000000000f1')
    where code = 'REC-EVA-1'),
  5,
  'diárias saem do price_breakdown'
);

select is(
  (select count(*)::int from public.booking_recovery_export
    where company_id = '00000000-0000-4000-9100-0000000000f1'),
  0,
  'só olhar a lista não registra exportação'
);

select is(
  (select count(*)::int
     from public.operator_recoverable_bookings('00000000-0000-4000-9100-0000000000f1', true)),
  2,
  'exportar devolve a mesma lista'
);

select is(
  (select row_count || '|' || exported_by::text from public.booking_recovery_export
    where company_id = '00000000-0000-4000-9100-0000000000f1'),
  '2|00000000-0000-4000-9100-000000000001',
  'exportar registra quem e quantas linhas'
);

select throws_ok(
  $$ select * from public.operator_recoverable_bookings('00000000-0000-4000-9100-0000000000f2') $$,
  '42501', null,
  'o dono de uma empresa não lê a lista de outra'
);

select throws_ok(
  $$ insert into public.booking_recovery_export (company_id, exported_by, row_count)
     values ('00000000-0000-4000-9100-0000000000f1', '00000000-0000-4000-9100-000000000001', 0) $$,
  '42501', null,
  'ninguém escreve o registro de exportação direto: só a RPC'
);

-- ── Operação da empresa um: sem o escopo ─────────────────────────────────────
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-9100-000000000002","role":"authenticated"}', true);

select throws_ok(
  $$ select * from public.operator_recoverable_bookings('00000000-0000-4000-9100-0000000000f1') $$,
  '42501', null,
  'papel Operação não tem bookings:recovery e é recusado'
);

select is_empty(
  $$ select id from public.booking_recovery_export $$,
  'papel Operação não lê o registro de exportação'
);

-- ── Dono da empresa dois: vê a própria ──────────────────────────────────────
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-9100-000000000003","role":"authenticated"}', true);

select is(
  (select array_agg(code order by check_in_at) from public.operator_recoverable_bookings('00000000-0000-4000-9100-0000000000f2')),
  array['REC-OUTRA-1', 'REC-ISCA-1']::text[],
  'a outra empresa vê só a dela, e a compra de outra empresa com o mesmo e-mail não tira a isca da lista'
);

-- ── Escopo fora do alcance de chave de API ──────────────────────────────────
reset role;
select is(
  (select assignable_to_api_key::text || '|' || is_platform_scope::text
     from public.api_scope where scope = 'bookings:recovery'),
  'false|false',
  'bookings:recovery é interno: não vai para chave de API e não é de plataforma'
);

select * from finish();
rollback;
