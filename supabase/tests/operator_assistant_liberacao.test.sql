-- Mia para operadores: liberação por empresa (migration 20261204130000).
-- Quem decide se a bolinha aparece e se a Edge atende é `operator_assistant_liberado`.
begin;
select plan(12);

-- Fixture: operador da empresa A, operador da empresa B e um hub_admin. Tudo some no rollback.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000a501', 'mia-lib-a@example.com'),
  ('00000000-0000-0000-0000-00000000a502', 'mia-lib-b@example.com'),
  ('00000000-0000-0000-0000-00000000a503', 'mia-lib-admin@example.com');
insert into public.profiles (id, role) values
  ('00000000-0000-0000-0000-00000000a501', 'company_operator'),
  ('00000000-0000-0000-0000-00000000a502', 'company_operator'),
  ('00000000-0000-0000-0000-00000000a503', 'hub_admin')
  on conflict (id) do update set role = excluded.role;
insert into public.company (id, name, slug) values
  ('00000000-0000-0000-0000-00000000c501', 'MiaLib A', 'mia-lib-a'),
  ('00000000-0000-0000-0000-00000000c502', 'MiaLib B', 'mia-lib-b');
insert into public.profile_company (profile_id, company_id, role) values
  ('00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-00000000c501', 'operator'),
  ('00000000-0000-0000-0000-00000000a502', '00000000-0000-0000-0000-00000000c502', 'operator');
update public.app_setting set value = '{"enabled": true}' where key = 'operator_assistant';

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a501', true);

select is(public.operator_assistant_liberado('00000000-0000-0000-0000-00000000c501'), false,
  'empresa fora da lista: a bolinha não aparece');

-- Operador não liga a própria empresa: só hub_admin escreve na lista.
select throws_ok(
  $$ insert into public.operator_assistant_company (company_id) values ('00000000-0000-0000-0000-00000000c501') $$,
  '42501', null, 'operador não consegue se liberar'
);

reset role;
insert into public.operator_assistant_company (company_id) values ('00000000-0000-0000-0000-00000000c501');
set local role authenticated;

select is(public.operator_assistant_liberado('00000000-0000-0000-0000-00000000c501'), true,
  'empresa liberada: o operador dela vê a Mia');
select is((select count(*)::int from public.operator_assistant_company), 0,
  'o operador não lê a lista de empresas liberadas');

-- Operador da empresa B perguntando pela A.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a502', true);
select is(public.operator_assistant_liberado('00000000-0000-0000-0000-00000000c501'), false,
  'quem não é da empresa recebe falso, mesmo liberada');
select is(public.operator_assistant_liberado('00000000-0000-0000-0000-00000000c502'), false,
  'a empresa B continua sem a Mia');

-- hub_admin: vale a lista, sem precisar de vínculo.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a503', true);
select is(public.operator_assistant_liberado('00000000-0000-0000-0000-00000000c501'), true,
  'hub_admin impersonando a empresa liberada vê a Mia');
select is(public.operator_assistant_liberado('00000000-0000-0000-0000-00000000c502'), false,
  'hub_admin impersonando empresa não liberada não vê');
select lives_ok(
  $$ insert into public.operator_assistant_company (company_id) values ('00000000-0000-0000-0000-00000000c502') $$,
  'hub_admin libera uma empresa pela lista'
);
select is(public.operator_assistant_liberado('00000000-0000-0000-0000-00000000c502'), true,
  'liberada pelo hub_admin, a empresa B passa a ter a Mia');

-- A chave global desliga todo mundo; JSON torto não desliga.
reset role;
update public.app_setting set value = '{"enabled": false}' where key = 'operator_assistant';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a501', true);
select is(public.operator_assistant_liberado('00000000-0000-0000-0000-00000000c501'), false,
  'chave global desligada: ninguém vê, nem empresa liberada');

reset role;
update public.app_setting set value = '{torto' where key = 'operator_assistant';
set local role authenticated;
select is(public.operator_assistant_liberado('00000000-0000-0000-0000-00000000c501'), true,
  'config torta vale o padrão (ligada), como na Edge');

select * from finish();
rollback;
