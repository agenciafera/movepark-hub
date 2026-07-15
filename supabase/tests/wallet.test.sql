-- pgTAP: Motor de Crescimento, carteira Movepark (base de CRÉDITO).
--
-- Blinda a carteira ANTES de mexer em cancelamento/reembolso/alteração de data, que
-- vão passar a debitar e estornar MoveCoins. Cobre o que já existe hoje:
--   * cashback na conclusão da reserva (valor por bps do nível + idempotência);
--   * guarda de valor (total 0 não credita);
--   * indicação: crédito dos dois lados + status `rewarded` + guardas do redeem;
--   * saldo/expiração em get_my_wallet (crédito expirado não conta);
--   * RLS trancada (0 policies) e hardening (anon não executa get_my_wallet/redeem).
--
-- Valores esperados validados contra o banco vivo (transação + rollback).
-- Roda com: supabase test db. Ver README.md.

begin;
select plan(21);

-- ── Estrutura + hardening ────────────────────────────────────────────────────
select has_table('public', 'wallet_ledger', 'wallet_ledger existe');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.wallet_ledger'::regclass),
  'wallet_ledger com RLS habilitada'
);
select is(
  (select count(*)::int from pg_policy where polrelid = 'public.wallet_ledger'::regclass),
  0, 'ledger trancada (0 policies, acesso só via RPC/trigger SECURITY DEFINER)'
);
select has_index(
  'public', 'wallet_ledger', 'wallet_cashback_once',
  'índice de idempotência (no máximo um cashback por reserva)'
);
select ok(
  not has_function_privilege('anon', 'public.get_my_wallet()', 'EXECUTE'),
  'anon NÃO executa get_my_wallet (hardening E0.6)'
);
select ok(
  not has_function_privilege('anon', 'public.redeem_referral_code(text)', 'EXECUTE'),
  'anon NÃO executa redeem_referral_code (hardening E0.6)'
);
select ok(
  has_function_privilege('authenticated', 'public.get_my_wallet()', 'EXECUTE'),
  'authenticated executa get_my_wallet'
);

-- ── Fixture ──────────────────────────────────────────────────────────────────
-- u1: conclui uma reserva de R$100 (nível Ignição, 200 bps → 200 cents de cashback)
--     + uma reserva de R$0 (não deve creditar).
-- u_ref indica u_new; a 1ª reserva concluída de u_new recompensa os dois (R$25 cada).
do $$
declare
  u1    uuid := gen_random_uuid();
  u_ref uuid := gen_random_uuid();
  u_new uuid := gen_random_uuid();
  v_lpt uuid;
  v_code text;
  r jsonb;
  b1 uuid;
  b0 uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (u1,   '00000000-0000-0000-0000-000000000000','authenticated','authenticated','mc-u1@ex.com', now(),now()),
    (u_ref,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','mc-ref@ex.com',now(),now()),
    (u_new,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','mc-new@ex.com',now(),now());

  insert into public.profiles(id, role, first_name, last_name) values
    (u1,   'customer','U','One'),
    (u_ref,'customer','Ref','Erson'),
    (u_new,'customer','New','Bie')
  on conflict (id) do nothing;

  select id into v_lpt from public.location_parking_type where capacity > 0 and is_active limit 1;
  update public.location_parking_type
     set capacity = 10, has_minimum_stay = false, has_minimum_date = false
   where id = v_lpt;

  -- u1: reserva faturável concluída → cashback
  r  := public.create_booking_atomic(u1, v_lpt, '2027-03-10T12:00:00Z', '2027-03-12T12:00:00Z');
  b1 := (r ->> 'booking_id')::uuid;
  update public.booking set total_amount = 100, status = 'completed' where id = b1;

  -- u1: reserva de valor 0 concluída → NÃO credita
  r  := public.create_booking_atomic(u1, v_lpt, '2027-05-10T12:00:00Z', '2027-05-12T12:00:00Z');
  b0 := (r ->> 'booking_id')::uuid;
  update public.booking set total_amount = 0, status = 'completed' where id = b0;

  -- indicação: u_ref gera código, u_new resgata
  perform set_config('request.jwt.claims', json_build_object('sub', u_ref::text)::text, true);
  v_code := public.get_or_create_referral_code();
  perform set_config('request.jwt.claims', json_build_object('sub', u_new::text)::text, true);
  perform public.redeem_referral_code(v_code);

  -- 1ª reserva concluída de u_new dispara a recompensa dos dois lados
  perform set_config('request.jwt.claims', '', true);
  r := public.create_booking_atomic(u_new, v_lpt, '2027-04-10T12:00:00Z', '2027-04-12T12:00:00Z');
  update public.booking set total_amount = 100, status = 'completed'
   where id = (r ->> 'booking_id')::uuid;

  perform set_config('mc.u1',    u1::text,    true);
  perform set_config('mc.u_ref', u_ref::text, true);
  perform set_config('mc.u_new', u_new::text, true);
  perform set_config('mc.b1',    b1::text,    true);
  perform set_config('mc.b0',    b0::text,    true);
  perform set_config('mc.code',  v_code,      true);
end $$;

-- ── Cashback ─────────────────────────────────────────────────────────────────
select is(
  (select amount_cents from public.wallet_ledger
     where booking_id = current_setting('mc.b1')::uuid and kind = 'cashback'),
  200, 'cashback = 2% de R$100 (Ignição, 200 bps)'
);
select isnt(
  (select expires_at from public.wallet_ledger
     where booking_id = current_setting('mc.b1')::uuid and kind = 'cashback'),
  null, 'crédito de cashback tem validade (expires_at)'
);
select is(
  (select count(*)::int from public.wallet_ledger where booking_id = current_setting('mc.b0')::uuid),
  0, 'reserva de valor 0 não credita cashback'
);

-- Idempotência: re-tocar a reserva já concluída não duplica o cashback.
select lives_ok(
  $$ update public.booking set notes = 'toque' where id = current_setting('mc.b1')::uuid $$,
  'update numa reserva já concluída roda sem erro'
);
select is(
  (select count(*)::int from public.wallet_ledger
     where booking_id = current_setting('mc.b1')::uuid and kind = 'cashback'),
  1, 'idempotência: continua exatamente 1 cashback'
);
-- O índice parcial barra um 2º cashback manual pra mesma reserva.
select throws_ok(
  $$ insert into public.wallet_ledger(profile_id, amount_cents, kind, booking_id)
     values (current_setting('mc.u1')::uuid, 50, 'cashback', current_setting('mc.b1')::uuid) $$,
  '23505', null, 'índice wallet_cashback_once barra 2º cashback pra mesma reserva'
);

-- ── Indicação ────────────────────────────────────────────────────────────────
select is(
  (select status from public.referral where referred_profile_id = current_setting('mc.u_new')::uuid),
  'rewarded', 'indicação fecha como rewarded na 1ª reserva concluída'
);
select is(
  (select coalesce(sum(amount_cents), 0)::int from public.wallet_ledger
     where profile_id = current_setting('mc.u_ref')::uuid and kind = 'referral'),
  2500, 'quem indica recebe R$25'
);
select is(
  (select coalesce(sum(amount_cents), 0)::int from public.wallet_ledger
     where profile_id = current_setting('mc.u_new')::uuid and kind = 'referral'),
  2500, 'indicado recebe R$25 de boas-vindas'
);

-- Guardas do redeem (avaliadas como u_ref).
select set_config('request.jwt.claims', json_build_object('sub', current_setting('mc.u_ref'))::text, true);
select is(
  (public.redeem_referral_code(current_setting('mc.code')) ->> 'error'),
  'self', 'não se indica a si mesmo'
);
select is(
  (public.redeem_referral_code('ZZ999999') ->> 'error'),
  'not_found', 'código inexistente retorna not_found'
);

-- ── Saldo + expiração (get_my_wallet, como u_new) ────────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', current_setting('mc.u_new'))::text, true);
select is(
  ((public.get_my_wallet()) ->> 'balance_cents')::int,
  2700, 'saldo soma créditos válidos (200 cashback + 2500 indicação)'
);
select lives_ok(
  $$ insert into public.wallet_ledger(profile_id, amount_cents, kind, note, expires_at)
     values (current_setting('mc.u_new')::uuid, 9999, 'adjust', 'expirado', now() - interval '1 day') $$,
  'insere um crédito já expirado'
);
select is(
  ((public.get_my_wallet()) ->> 'balance_cents')::int,
  2700, 'crédito expirado não entra no saldo'
);

select finish();
rollback;
