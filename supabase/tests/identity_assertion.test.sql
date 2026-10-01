-- Identidade afirmada por chamador confiável (`identity:assert`).
--
-- A tool `assert_verified_identity` cria sessão de cliente sem OTP. O que segura
-- isso no banco:
--   1. o escopo é de plataforma: só a Movepark o coloca numa chave;
--   2. as RPCs só rodam como service_role (a Edge), nunca por anon/authenticated;
--   3. o código capturado pelo hook é lido UMA vez e não sobra guardado;
--   4. o hook só captura para afirmação aberta e dentro do prazo, então um OTP
--      comum de login segue sendo enviado;
--   5. o freio por telefone recusa e registra a recusa.
--
-- Ver docs/specs/customer/agent-booking.md §4.

begin;
select plan(17);

-- Fixture: uma chave da Movepark (sem empresa).
insert into public.api_key (id, company_id, name, key_prefix, key_hash, environment, scopes)
values ('00000000-0000-4000-8000-0000000000a1', null, 'pgtap-bot', 'mp_test_pgtapia1',
        repeat('b', 64), 'test', array['identity:assert']);

-- ── 1. Catálogo ─────────────────────────────────────────────────────────────

select is(
  (select is_platform_scope from public.api_scope where scope = 'identity:assert'),
  true,
  'identity:assert é escopo de plataforma'
);

select throws_ok(
  $$ insert into public.api_key
       (company_id, name, key_prefix, key_hash, environment, scopes)
     values
       ((select id from public.company limit 1), 'pgtap-assert', 'mp_test_pgtapia2',
        repeat('c', 64), 'test', array['identity:assert']) $$,
  '42501',
  null,
  'chave de empresa não pode carregar identity:assert'
);

-- ── 2. Grants ───────────────────────────────────────────────────────────────

select is_empty(
  $$ select routine_name, grantee from information_schema.role_routine_grants
      where routine_name in ('identity_assertion_begin', 'identity_assertion_capture',
                             'identity_assertion_take', 'identity_assertion_finish',
                             'cron_prune_identity_assertion')
        and grantee in ('anon', 'authenticated', 'PUBLIC') $$,
  'nenhuma RPC de afirmação é executável por anon ou authenticated'
);

select is(
  (select count(*)::int from pg_policies where tablename = 'identity_assertion'),
  0,
  'identity_assertion sem policy: ninguém lê pela API'
);

-- ── 3. Ciclo feliz ──────────────────────────────────────────────────────────

create temp table _ia (id uuid);
insert into _ia select public.identity_assertion_begin(
  '00000000-0000-4000-8000-0000000000a1', repeat('1', 64), '10.0.0.1');

select isnt((select id from _ia), null, 'begin devolve o id da afirmação');

select is(public.identity_assertion_capture(repeat('1', 64), '654321'), true,
  'o hook captura o código da afirmação aberta');

select is(public.identity_assertion_capture(repeat('2', 64), '111111'), false,
  'telefone sem afirmação aberta: o hook envia normalmente');

select is(public.identity_assertion_capture(repeat('1', 64), '999999'), false,
  'afirmação já capturada não captura um segundo código');

select is(public.identity_assertion_take((select id from _ia)), '654321',
  'take devolve o código');

select is(public.identity_assertion_take((select id from _ia)), null,
  'take é de uso único');

select is((select otp from public.identity_assertion where id = (select id from _ia)), null,
  'o código não fica guardado depois da leitura');

select lives_ok(
  $$ select public.identity_assertion_finish((select id from _ia), true,
       null, true, null) $$,
  'finish registra o resultado'
);

select is((select status from public.identity_assertion where id = (select id from _ia)), 'succeeded',
  'a trilha guarda o sucesso');

-- ── 4. Prazo ────────────────────────────────────────────────────────────────

insert into _ia select public.identity_assertion_begin(
  '00000000-0000-4000-8000-0000000000a1', repeat('3', 64), null);
update public.identity_assertion set expires_at = now() - interval '1 second'
 where phone_hash = repeat('3', 64);

select is(public.identity_assertion_capture(repeat('3', 64), '222222'), false,
  'afirmação vencida não captura: o OTP comum segue sendo enviado');

-- ── 5. Uma aberta por telefone ──────────────────────────────────────────────

select public.identity_assertion_begin('00000000-0000-4000-8000-0000000000a1', repeat('4', 64), null);
select public.identity_assertion_begin('00000000-0000-4000-8000-0000000000a1', repeat('4', 64), null);

select is(
  (select count(*)::int from public.identity_assertion
    where phone_hash = repeat('4', 64) and status in ('pending', 'captured')),
  1,
  'a afirmação nova encerra a anterior do mesmo telefone'
);

-- ── 6. Freio ────────────────────────────────────────────────────────────────

select public.identity_assertion_begin('00000000-0000-4000-8000-0000000000a1', repeat('5', 64), null)
  from generate_series(1, 10);

select is(
  public.identity_assertion_begin('00000000-0000-4000-8000-0000000000a1', repeat('5', 64), null),
  null,
  'a 11ª afirmação do mesmo telefone na hora é recusada'
);

select is(
  (select count(*)::int from public.identity_assertion
    where phone_hash = repeat('5', 64) and status = 'rate_limited'),
  1,
  'a recusa fica registrada'
);

select * from finish();
rollback;
