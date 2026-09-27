-- pgTAP: carteira Movepark sem validade enquanto o débito no checkout não existe (27/09/2026).
--
-- A chave `app_setting.wallet_debit_enabled` decide se o crédito novo ganha `expires_at`:
--   * 'false' (estado atual): cashback e indicação nascem com `expires_at` nulo, o saldo conta
--     esses créditos e `get_my_wallet` não anuncia "expira em";
--   * 'true' (quando o débito entrar): crédito novo volta a ganhar `now() + wallet_expiry_days`,
--     sem retroagir sobre o que já existia.
-- Cobre os dois estados na mesma transação (a chave é lida na hora do crédito).
--
-- Roda com: supabase test db. Ver README.md.

begin;
select plan(17);

-- ── Estrutura ────────────────────────────────────────────────────────────────
select is(
  (select value from public.app_setting where key = 'wallet_debit_enabled'),
  'false', 'wallet_debit_enabled nasce em false (não há débito no checkout)'
);
select has_function('public', 'wallet_credit_expires_at', 'wallet_credit_expires_at existe');
select ok(
  not has_function_privilege('anon', 'public.wallet_credit_expires_at()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.wallet_credit_expires_at()', 'EXECUTE'),
  'wallet_credit_expires_at é interna (anon e authenticated não executam)'
);
select ok(
  public.wallet_credit_expires_at() is null,
  'com a chave em false, a validade calculada é nula'
);

-- ── Fixture ──────────────────────────────────────────────────────────────────
-- u1 conclui uma reserva de R$100 com a chave desligada; u_ref indica u_new (recompensa dos
-- dois lados, também sem validade). Depois a chave liga e u1 conclui outra reserva.
do $$
declare
  u1    uuid := gen_random_uuid();
  u_ref uuid := gen_random_uuid();
  u_new uuid := gen_random_uuid();
  v_lpt uuid;
  v_code text;
  r jsonb;
  b1 uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (u1,   '00000000-0000-0000-0000-000000000000','authenticated','authenticated','wne-u1@ex.com', now(),now()),
    (u_ref,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','wne-ref@ex.com',now(),now()),
    (u_new,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','wne-new@ex.com',now(),now());

  insert into public.profiles(id, role, first_name, last_name) values
    (u1,   'customer','U','One'),
    (u_ref,'customer','Ref','Erson'),
    (u_new,'customer','New','Bie')
  on conflict (id) do nothing;

  -- Unidade vendável pelo Hub (create_booking_atomic recusa unidade externa e tipo sem preço).
  select lpt.id into v_lpt
    from public.location_parking_type lpt
    join public.location l on l.id = lpt.location_id
    join public.company c on c.id = l.company_id
    join public.pricing_rule pr on pr.location_parking_type_id = lpt.id
   where l.checkout_mode = 'hub' and lpt.is_active and lpt.capacity > 0 and l.status = 'active'
     and c.status = 'active' and c.onboarding_status = 'active' and pr.strategy = 'uniform_by_duration'
   order by c.name, lpt.capacity desc limit 1;
  update public.location set is_listed = true
   where id = (select location_id from public.location_parking_type where id = v_lpt);
  update public.location_parking_type
     set capacity = 10, has_minimum_stay = false, has_minimum_date = false
   where id = v_lpt;

  update public.app_setting set value = 'false' where key = 'wallet_debit_enabled';

  r  := public.create_booking_atomic(u1, v_lpt, '2027-03-10T12:00:00Z', '2027-03-12T12:00:00Z');
  b1 := (r ->> 'booking_id')::uuid;
  update public.booking set total_amount = 100, status = 'completed' where id = b1;

  perform set_config('request.jwt.claims', json_build_object('sub', u_ref::text)::text, true);
  v_code := public.get_or_create_referral_code();
  perform set_config('request.jwt.claims', json_build_object('sub', u_new::text)::text, true);
  perform public.redeem_referral_code(v_code);
  perform set_config('request.jwt.claims', '', true);

  r := public.create_booking_atomic(u_new, v_lpt, '2027-04-10T12:00:00Z', '2027-04-12T12:00:00Z');
  update public.booking set total_amount = 100, status = 'completed'
   where id = (r ->> 'booking_id')::uuid;

  perform set_config('wne.u1',    u1::text,    true);
  perform set_config('wne.u_ref', u_ref::text, true);
  perform set_config('wne.u_new', u_new::text, true);
  perform set_config('wne.b1',    b1::text,    true);
  perform set_config('wne.lpt',   v_lpt::text, true);
end $$;

-- ── Chave em false: crédito nasce sem validade e conta no saldo ──────────────
select is(
  (select amount_cents from public.wallet_ledger
     where booking_id = current_setting('wne.b1')::uuid and kind = 'cashback'),
  200, 'cashback creditado (2% de R$100)'
);
select ok(
  (select expires_at from public.wallet_ledger
     where booking_id = current_setting('wne.b1')::uuid and kind = 'cashback') is null,
  'cashback nasce sem expires_at com a chave em false'
);
select is(
  (select count(*)::int from public.wallet_ledger
     where kind = 'referral'
       and profile_id in (current_setting('wne.u_ref')::uuid, current_setting('wne.u_new')::uuid)
       and expires_at is null),
  2, 'os dois créditos da indicação nascem sem expires_at'
);

select set_config('request.jwt.claims', json_build_object('sub', current_setting('wne.u_new'))::text, true);
select is(
  ((public.get_my_wallet()) ->> 'balance_cents')::int,
  2700, 'saldo soma crédito sem validade (200 cashback + 2500 indicação)'
);
select is(
  ((public.get_my_wallet()) ->> 'expiring_cents')::int,
  0, 'nada "expira em": expiring_cents = 0'
);
select ok(
  ((public.get_my_wallet()) ->> 'expiring_at') is null,
  'expiring_at nulo quando nenhum crédito tem data'
);
select set_config('request.jwt.claims', '', true);

-- ── Chave em true: crédito novo volta a ganhar validade; o antigo não retroage ─
update public.app_setting set value = 'true' where key = 'wallet_debit_enabled';
update public.app_setting set value = '90' where key = 'wallet_expiry_days';

select ok(
  public.wallet_credit_expires_at() between now() + interval '89 days' and now() + interval '91 days',
  'com a chave em true, a validade é now() + wallet_expiry_days (90)'
);

do $$
declare r jsonb;
begin
  r := public.create_booking_atomic(current_setting('wne.u1')::uuid, current_setting('wne.lpt')::uuid,
                                    '2027-06-10T12:00:00Z', '2027-06-12T12:00:00Z');
  update public.booking set total_amount = 100, status = 'completed'
   where id = (r ->> 'booking_id')::uuid;
  perform set_config('wne.b2', r ->> 'booking_id', true);
end $$;

select ok(
  (select expires_at from public.wallet_ledger
     where booking_id = current_setting('wne.b2')::uuid and kind = 'cashback')
    between now() + interval '89 days' and now() + interval '91 days',
  'cashback novo ganha expires_at em ~90 dias com a chave em true'
);
select ok(
  (select expires_at from public.wallet_ledger
     where booking_id = current_setting('wne.b1')::uuid and kind = 'cashback') is null,
  'crédito anterior continua sem validade (não retroage)'
);

-- Com validade de volta, a leitura passa a anunciar o que vence em até 60 dias? Não: 90 > 60.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('wne.u1'))::text, true);
-- A 2ª reserva concluída pode subir o nível (e o bps), então o valor do 2º cashback é lido do
-- ledger em vez de cravado.
select is(
  ((public.get_my_wallet()) ->> 'balance_cents')::int,
  (select 200 + amount_cents from public.wallet_ledger
     where booking_id = current_setting('wne.b2')::uuid and kind = 'cashback')::int,
  'saldo soma o crédito sem validade e o com validade futura'
);
select is(
  ((public.get_my_wallet()) ->> 'expiring_cents')::int,
  0, 'crédito que vence em 90 dias ainda não entra na janela de 60 dias'
);

-- Crédito vencido continua fora do saldo (a chave não muda essa regra).
select lives_ok(
  $$ insert into public.wallet_ledger(profile_id, amount_cents, kind, note, expires_at)
     values (current_setting('wne.u1')::uuid, 9999, 'adjust', 'expirado', now() - interval '1 day') $$,
  'insere um crédito já expirado'
);
select is(
  ((public.get_my_wallet()) ->> 'balance_cents')::int,
  (select 200 + amount_cents from public.wallet_ledger
     where booking_id = current_setting('wne.b2')::uuid and kind = 'cashback')::int,
  'crédito expirado segue fora do saldo'
);

select * from finish();
rollback;
