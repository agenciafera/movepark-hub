-- pgTAP: as tabelas que guardam segredo de sessão e saldo.
--
-- Por que estas três primeiro: `identifier_otp` guarda o hash do OTP que anexa
-- um identificador à conta, e `checkout_handoff` guarda o token de uso único que
-- loga direto no checkout. Ler qualquer uma das duas de outro usuário não é
-- "ver dado demais", é entrar na conta dele. O `wallet_ledger` é o outro eixo:
-- escrever nele cunha saldo.
--
-- As três estão hoje com RLS ligado e ZERO policy, que em Postgres nega tudo a
-- quem não tem BYPASSRLS. É o desenho certo (só service_role e as funções
-- SECURITY DEFINER tocam nelas), e este teste existe para travá-lo: a hora
-- perigosa é a migration futura que adiciona uma policy "só para o dono ler",
-- porque OTP e token de sessão não devem ser legíveis nem pelo dono.
--
-- Roda em transação com rollback.

begin;
select plan(15);

-- ── fixtures (como postgres; RLS não se aplica a superuser) ────────────────
do $$
declare
  u1 uuid := gen_random_uuid();   -- dono dos segredos e do cartão
  u2 uuid := gen_random_uuid();   -- o vizinho: outro customer, não um estranho
  ua uuid := gen_random_uuid();   -- hub_admin
  v_loc uuid;
  v_booking uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (u1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','sec-u1@ex.com',now(),now()),
    (u2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','sec-u2@ex.com',now(),now()),
    (ua,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','sec-admin@ex.com',now(),now());
  insert into public.profiles(id, role) values
    (u1,'customer'),(u2,'customer'),(ua,'hub_admin') on conflict (id) do nothing;

  select id into v_loc from public.location limit 1;
  insert into public.booking(code, profile_id, location_id, check_in_at, check_out_at)
    values ('SEC-TEST-1', u1, v_loc, now() + interval '1 day', now() + interval '3 day')
    returning id into v_booking;

  -- OTP pedido PELO u1: o caso mais favorável possível para vazar.
  insert into public.identifier_otp(channel, identifier, code_hash, requested_by, expires_at)
    values ('email','sec-u1@ex.com','hash-do-otp-secreto', u1, now() + interval '10 minutes');

  -- Handoff de checkout do próprio u1, com os tokens de sessão dentro.
  insert into public.checkout_handoff(token_prefix, token_hash, profile_id, booking_id, access_token, refresh_token, expires_at)
    values ('mp_ho','hash-do-token', u1, v_booking, 'access-secreto', 'refresh-secreto', now() + interval '15 minutes');

  insert into public.wallet_ledger(profile_id, amount_cents, kind)
    values (u1, 5000, 'cashback');

  insert into public.payment_method(profile_id, brand, last4)
    values (u1, 'visa', '4242');

  perform set_config('test.u1', u1::text, false);
  perform set_config('test.u2', u2::text, false);
  perform set_config('test.ua', ua::text, false);
end $$;

create or replace function pg_temp.as_user(p_uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid)::text, true);
end $$;

-- ── o contrato estrutural: fail-closed ─────────────────────────────────────
-- Sem policy nenhuma, RLS nega tudo. Se alguém adicionar uma policy a estas
-- tabelas, este teste quebra e força a revisão, que é exatamente o que se quer.
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public'
      and tablename in ('identifier_otp','checkout_handoff','wallet_ledger')),
  0,
  'identifier_otp, checkout_handoff e wallet_ledger seguem sem policy nenhuma (fail-closed)'
);

select is(
  (select count(*)::int from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('identifier_otp','checkout_handoff','wallet_ledger')
      and c.relrowsecurity),
  3,
  'as três seguem com RLS ligado'
);

-- ── anon não lê nada ───────────────────────────────────────────────────────
set local role anon;
select is_empty('select 1 from public.identifier_otp',  'anon NÃO lê identifier_otp');
select is_empty('select 1 from public.checkout_handoff','anon NÃO lê checkout_handoff');
select is_empty('select 1 from public.wallet_ledger',   'anon NÃO lê wallet_ledger');
reset role;

-- ── nem o DONO lê o próprio segredo ────────────────────────────────────────
-- Este é o ponto do arquivo. Para booking e cartão, "o dono lê o próprio" é a
-- regra certa. Para OTP e token de sessão, não: quem precisa deles é a Edge
-- Function com service_role, nunca o navegador.
set local role authenticated;
select pg_temp.as_user(current_setting('test.u1'));
select is_empty('select 1 from public.identifier_otp',
  'nem o próprio requisitante lê o hash do OTP dele');
select is_empty('select 1 from public.checkout_handoff',
  'nem o dono lê o token de sessão do handoff dele');
select is_empty('select 1 from public.wallet_ledger',
  'o dono não lê o ledger direto (o saldo sai por get_my_wallet)');
reset role;

-- ── o vizinho também não ───────────────────────────────────────────────────
set local role authenticated;
select pg_temp.as_user(current_setting('test.u2'));
select is_empty('select 1 from public.identifier_otp',   'outro customer NÃO lê OTP alheio');
select is_empty('select 1 from public.checkout_handoff', 'outro customer NÃO lê handoff alheio');
reset role;

-- ── ninguém cunha saldo pela tabela ────────────────────────────────────────
set local role authenticated;
select pg_temp.as_user(current_setting('test.u2'));
select throws_ok(
  format('insert into public.wallet_ledger(profile_id, amount_cents, kind) values (%L, 999999, %L)',
         current_setting('test.u2'), 'cashback'),
  '42501',
  null,
  'customer NÃO insere no wallet_ledger (não cunha saldo)'
);
reset role;

-- ── payment_method: aqui a regra é "o dono lê o próprio" ───────────────────
set local role authenticated;
select pg_temp.as_user(current_setting('test.u1'));
select isnt_empty('select 1 from public.payment_method', 'o dono vê o PRÓPRIO cartão');
reset role;

set local role authenticated;
select pg_temp.as_user(current_setting('test.u2'));
select is_empty('select 1 from public.payment_method', 'outro customer NÃO vê cartão alheio');
select throws_ok(
  format('insert into public.payment_method(profile_id, brand, last4) values (%L, %L, %L)',
         current_setting('test.u1'), 'visa', '1111'),
  '42501',
  null,
  'customer NÃO cadastra cartão no nome de outro (with_check da policy)'
);
reset role;

set local role authenticated;
select pg_temp.as_user(current_setting('test.ua'));
select isnt_empty('select 1 from public.payment_method', 'hub_admin vê cartão de qualquer um (suporte)');
reset role;

select * from finish();
rollback;
