-- pgTAP: portão do pedido de código de login (otp_request_gate).
-- Regressão 18/10/2026: dois pedidos simultâneos do mesmo telefone viravam 500 no GoTrue.
-- Cobre: o primeiro pedido envia, o repetido em menos de 30 s não chama o GoTrue de novo,
-- depois da janela volta a enviar, o freio de custo segue valendo e só service_role executa.
-- Roda com: supabase test db (stack local, ver README.md). Transação + rollback.

begin;
select plan(8);

select has_function('public', 'otp_request_gate', array['text', 'text'], 'otp_request_gate existe');
select ok(
  not has_function_privilege('anon', 'public.otp_request_gate(text, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.otp_request_gate(text, text)', 'execute'),
  'cliente não executa o portão'
);

select is(public.otp_request_gate(repeat('c', 64), '203.0.113.7'), 'send', '1º pedido envia');
select is(public.otp_request_gate(repeat('c', 64), '203.0.113.7'), 'recent', 'pedido repetido em menos de 30 s não envia de novo');
select is(public.otp_request_gate(repeat('d', 64), '203.0.113.7'), 'send', 'outro identificador não é afetado');

-- Passados os 30 s, envia de novo (o GoTrue ainda segura os primeiros 60 s por conta própria).
update public.otp_request_log set created_at = now() - interval '31 seconds' where identifier_hash = repeat('c', 64);
select is(public.otp_request_gate(repeat('c', 64), null), 'send', 'depois da janela, envia de novo');

-- O freio de custo continua: 5 por identificador por hora.
update public.otp_request_log set created_at = now() - interval '31 seconds' where identifier_hash = repeat('c', 64);
insert into public.otp_request_log (identifier_hash, created_at)
select repeat('c', 64), now() - interval '10 minutes' from generate_series(1, 5);
select is(public.otp_request_gate(repeat('c', 64), null), 'blocked', 'estourado o freio de custo, recusa');

select throws_ok(
  $$ select public.otp_request_gate('curto', null) $$,
  'P0001',
  'Identificador inválido.',
  'hash fora do formato SHA-256 é recusado'
);

select * from finish();
rollback;
