-- pgTAP: dica de e-mail do checkout (16/09/2026). Guarda em preferences, keyed em auth.uid(),
-- normaliza, recusa lixo, nunca toca em auth.users (não é credencial).
-- Transação com rollback.

begin;
select plan(6);

do $$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, phone, created_at, updated_at)
    values (u,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','5541999990000',now(),now());
  -- O perfil nasce por gatilho junto com auth.users; a dica de telefone entra por update.
  insert into public.profiles(id, role) values (u,'customer') on conflict (id) do nothing;
  update public.profiles set preferences = '{"unverified_phone_hint":"+5541999990000"}'::jsonb where id = u;
  perform set_config('test.u', u::text, false);
end $$;

set local role anon;
select throws_ok($$select public.set_email_hint('a@b.co')$$, '42501', null, 'anon não grava dica');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.u'), 'role', 'authenticated')::text, true);
select lives_ok($$select public.set_email_hint('  Kallef.Alexandre@Gmail.com ')$$, 'cliente grava a própria dica');
select is((select preferences ->> 'unverified_email_hint' from public.profiles where id = current_setting('test.u')::uuid),
  'kallef.alexandre@gmail.com', 'e-mail normalizado (minúsculas, sem espaços)');
select is((select preferences ->> 'unverified_phone_hint' from public.profiles where id = current_setting('test.u')::uuid),
  '+5541999990000', 'a dica de telefone continua lá (jsonb_set não sobrescreve as outras chaves)');
select throws_ok($$select public.set_email_hint('nao-e-email')$$, '22023', null, 'lixo é recusado');
reset role;

select is((select email from auth.users where id = current_setting('test.u')::uuid), null,
  'auth.users.email continua nulo: dica não é credencial');

select * from finish();
rollback;
