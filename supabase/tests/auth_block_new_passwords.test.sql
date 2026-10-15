-- pgTAP: nenhuma senha nova é gravada em auth.users (pré-sequestro de conta).
-- O Hub é passwordless (ADR-006). Uma senha gravada só serve a quem cadastra o
-- e-mail de outra pessoa: quando o dono confirma pelo código, a senha plantada
-- passa a valer. O gatilho apaga a senha de conta nova e de troca de senha, e
-- preserva as senhas antigas (decisão de 15/10/2026: não mexer nas existentes).
-- Roda com: supabase test db (stack local, ver README.md). Transação + rollback.

begin;
select plan(6);

select has_trigger('auth', 'users', 'block_new_password', 'gatilho existe em auth.users');

-- Conta nova com senha (o que o /auth/v1/signup grava): nasce sem senha.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values (
  '00000000-0000-4000-8000-0000000a0001', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'tap-senha-nova@movepark.co',
  '$2a$10$7EqJtq98hPqEX7fNZaFWoOhi5BWX4Z3nQn3T6xYdAbCdEfGhIjKlm', now(), now()
);
select is(
  (select encrypted_password from auth.users where id = '00000000-0000-4000-8000-0000000a0001'),
  '',
  'conta nova nasce sem senha'
);

-- Conta nova sem senha (OAuth, código) continua sem senha.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values (
  '00000000-0000-4000-8000-0000000a0002', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'tap-sem-senha@movepark.co', '', now(), now()
);
select is(
  (select encrypted_password from auth.users where id = '00000000-0000-4000-8000-0000000a0002'),
  '',
  'conta sem senha continua sem senha'
);

-- Troca de senha numa conta (o que o PUT /auth/v1/user grava): a senha nova é apagada.
update auth.users
   set encrypted_password = '$2a$10$Zz9Yy8Xx7Ww6Vv5Uu4Tt3Ss2Rr1Qq0Pp9Oo8Nn7Mm6Ll5Kk4Jj3Ii'
 where id = '00000000-0000-4000-8000-0000000a0002';
select is(
  (select encrypted_password from auth.users where id = '00000000-0000-4000-8000-0000000a0002'),
  '',
  'senha nova numa conta existente é apagada'
);

-- Conta antiga que já tem senha: um update que regrava a linha inteira com a mesma
-- senha (como o GoTrue faz ao registrar login) não pode apagá-la.
with antes as (
  select id, encrypted_password
    from auth.users
   where coalesce(encrypted_password, '') <> ''
   order by created_at
   limit 1
), depois as (
  update auth.users a
     set encrypted_password = a.encrypted_password, updated_at = now()
    from antes
   where a.id = antes.id
  returning a.encrypted_password
)
select is(
  (select encrypted_password from depois),
  (select encrypted_password from antes),
  'senha antiga é preservada quando o valor não muda'
);

select ok(
  not has_function_privilege('anon', 'public.auth_block_new_password()', 'execute')
  and not has_function_privilege('authenticated', 'public.auth_block_new_password()', 'execute'),
  'anon e authenticated não executam a função do gatilho'
);

select * from finish();
rollback;
