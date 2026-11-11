-- pgTAP: set_my_ui_preference() grava a preferência de tela do próprio usuário.
-- Cobre: grava em preferences.ui.<chave>; preserva as outras chaves de preferences (a dica de
-- telefone do checkout não some); null apaga só a chave; chave inválida e sem sessão recusam;
-- anon não executa. Transação + rollback.

begin;
select plan(8);

do $$
declare
  u1 uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (u1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','uipref-u1@ex.com',now(),now());
  insert into public.profiles(id, role, preferences) values
    (u1,'company_operator','{"unverified_phone_hint":"+5511999990000","ui":{"outra":1}}'::jsonb)
  on conflict (id) do update set preferences = excluded.preferences;
  perform set_config('test.u1', u1::text, true);
end $$;

select is(
  (select prosecdef from pg_proc where proname = 'set_my_ui_preference'),
  true,
  'set_my_ui_preference é SECURITY DEFINER'
);

select ok(
  not has_function_privilege('anon', 'public.set_my_ui_preference(text, jsonb)', 'execute'),
  'anon não executa set_my_ui_preference'
);

select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.u1'))::text, true);
select set_my_ui_preference('bookings_table.operator', '{"columns":[{"id":"status","visible":true}]}'::jsonb);

select is(
  (select preferences#>>'{ui,bookings_table.operator,columns,0,id}' from public.profiles where id = current_setting('test.u1')::uuid),
  'status',
  'grava em preferences.ui.<chave>'
);

select is(
  (select preferences->>'unverified_phone_hint' from public.profiles where id = current_setting('test.u1')::uuid),
  '+5511999990000',
  'preserva as outras chaves de preferences'
);

select is(
  (select (preferences#>>'{ui,outra}')::int from public.profiles where id = current_setting('test.u1')::uuid),
  1,
  'preserva as outras preferências de tela'
);

select set_my_ui_preference('bookings_table.operator', null);
select ok(
  (select not (preferences->'ui' ? 'bookings_table.operator') from public.profiles where id = current_setting('test.u1')::uuid),
  'null apaga só a chave'
);

select throws_ok(
  $$ select set_my_ui_preference('ui,../x', '{}'::jsonb) $$,
  '22023',
  null,
  'chave fora do alfabeto é recusada'
);

select set_config('request.jwt.claims', '{}', true);
select throws_ok(
  $$ select set_my_ui_preference('bookings_table.operator', '{}'::jsonb) $$,
  '42501',
  null,
  'sem sessão é recusado'
);

select * from finish();
rollback;
