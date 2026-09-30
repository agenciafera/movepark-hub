-- pgTAP: crédito da carteira desligado enquanto o Clube não é lançado (30/09/2026).
--
-- Com `app_setting.wallet_credit_enabled = 'false'` (estado de produção), reserva concluída não
-- gera cashback nem paga indicação, mas o nível do Clube continua sendo recalculado. O caminho
-- ligado é coberto por wallet.test.sql e wallet_no_expiry.test.sql.
--
-- Roda com: supabase test db. Ver README.md.

begin;
select plan(8);

-- ── Estrutura ────────────────────────────────────────────────────────────────
select is(
  (select value from public.app_setting where key = 'wallet_credit_enabled'),
  'false', 'wallet_credit_enabled nasce em false (Clube fora do ar)'
);
select ok(not public.wallet_credit_enabled(), 'wallet_credit_enabled() devolve false');
select ok(
  not has_function_privilege('anon', 'public.wallet_credit_enabled()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.wallet_credit_enabled()', 'EXECUTE'),
  'wallet_credit_enabled é interna (anon e authenticated não executam)'
);

-- ── Fixture ──────────────────────────────────────────────────────────────────
-- u_ref indica u_new; u_new conclui a primeira reserva com a chave desligada.
do $$
declare
  u_ref uuid := gen_random_uuid();
  u_new uuid := gen_random_uuid();
  v_lpt uuid;
  v_code text;
  r jsonb;
  b1 uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (u_ref,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','wcd-ref@ex.com',now(),now()),
    (u_new,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','wcd-new@ex.com',now(),now());

  insert into public.profiles(id, role, first_name, last_name) values
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

  update public.app_setting set value = 'false' where key = 'wallet_credit_enabled';

  perform set_config('request.jwt.claims', json_build_object('sub', u_ref::text)::text, true);
  v_code := public.get_or_create_referral_code();
  perform set_config('request.jwt.claims', json_build_object('sub', u_new::text)::text, true);
  perform public.redeem_referral_code(v_code);
  perform set_config('request.jwt.claims', '', true);

  r  := public.create_booking_atomic(u_new, v_lpt, '2027-05-10T12:00:00Z', '2027-05-12T12:00:00Z');
  b1 := (r ->> 'booking_id')::uuid;
  update public.booking set total_amount = 100, status = 'completed' where id = b1;

  perform set_config('wcd.u_ref', u_ref::text, true);
  perform set_config('wcd.u_new', u_new::text, true);
  perform set_config('wcd.b1',    b1::text,    true);
end $$;

-- ── Chave em false: nada entra na carteira ───────────────────────────────────
select is(
  (select count(*)::int from public.wallet_ledger where booking_id = current_setting('wcd.b1')::uuid),
  0, 'reserva concluída não gera cashback'
);
select is(
  (select count(*)::int from public.wallet_ledger
     where kind = 'referral'
       and profile_id in (current_setting('wcd.u_ref')::uuid, current_setting('wcd.u_new')::uuid)),
  0, 'indicação não credita nenhum dos dois lados'
);
select is(
  (select status::text from public.referral where referred_profile_id = current_setting('wcd.u_new')::uuid),
  'pending', 'a indicação fica pending (não é marcada como recompensada)'
);
select ok(
  exists (select 1 from public.membership where profile_id = current_setting('wcd.u_new')::uuid),
  'o nível do Clube continua sendo recalculado'
);

select set_config('request.jwt.claims', json_build_object('sub', current_setting('wcd.u_new'))::text, true);
select is(
  ((public.get_my_wallet()) ->> 'balance_cents')::int,
  0, 'saldo do indicado segue zerado'
);
select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
