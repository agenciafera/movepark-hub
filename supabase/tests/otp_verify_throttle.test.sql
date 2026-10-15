-- pgTAP: freio da VERIFICAÇÃO do código de login (OTP) do MCP de cliente.
-- Cobre otp_verify_allowed(): 5 tentativas por identificador em 15 minutos, a recusada
-- também conta, a janela expira, identificadores não se misturam, só service_role executa
-- e ninguém lê o log pela API. Motivo: no ataque de 14/10/2026 passaram 1.708 tentativas
-- por verify_login_otp sem nenhuma barrada (ver docs/specs/mcp.md).
-- Roda com: supabase test db (stack local, ver README.md). Transação + rollback.

begin;
select plan(15);

select has_function('public', 'otp_verify_allowed', array['text', 'text'], 'otp_verify_allowed existe');
select ok(
  not has_function_privilege('anon', 'public.otp_verify_allowed(text, text)', 'execute'),
  'anon não executa o freio'
);
select ok(
  not has_function_privilege('authenticated', 'public.otp_verify_allowed(text, text)', 'execute'),
  'authenticated não executa o freio'
);

-- 5 tentativas cabem; a 6ª é recusada.
select is(public.otp_verify_allowed(repeat('a', 64), '203.0.113.7'), true, '1ª tentativa passa');
select is(public.otp_verify_allowed(repeat('a', 64), '203.0.113.7'), true, '2ª tentativa passa');
select is(public.otp_verify_allowed(repeat('a', 64), '203.0.113.8'), true, '3ª tentativa passa, mesmo de outro IP');
select is(public.otp_verify_allowed(repeat('a', 64), null), true, '4ª tentativa passa, mesmo sem IP');
select is(public.otp_verify_allowed(repeat('a', 64), '203.0.113.7'), true, '5ª tentativa passa');
select is(public.otp_verify_allowed(repeat('a', 64), '203.0.113.9'), false, '6ª tentativa é recusada, trocar de IP não ajuda');

-- Outro identificador não herda o bloqueio.
select is(public.otp_verify_allowed(repeat('b', 64), '203.0.113.7'), true, 'outro identificador segue livre');

-- A recusada também fica registrada: parar um instante não zera a janela.
select is(
  (select count(*)::int from public.otp_verify_log where identifier_hash = repeat('a', 64)),
  6,
  'a tentativa recusada também é registrada'
);

-- Fora da janela, libera de novo.
update public.otp_verify_log
   set created_at = now() - interval '16 minutes'
 where identifier_hash = repeat('a', 64);
select is(public.otp_verify_allowed(repeat('a', 64), null), true, 'tentativas fora da janela de 15 min não contam');

select throws_ok(
  $$ select public.otp_verify_allowed('curto', null) $$,
  'P0001',
  'Identificador inválido.',
  'hash fora do formato SHA-256 é recusado'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.otp_verify_log'::regclass),
  'RLS ligada no log'
);
select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'otp_verify_log'),
  0,
  'sem policy: ninguém lê o log pela API'
);

select * from finish();
rollback;
