-- pgTAP: comissão por empresa (take_rate) — set_company_take_rate. Ver payment-split.md / ADR-005.
-- Escrita server-authoritative: só hub_admin altera; valida faixa 0..10000 bps. Transação + rollback.

begin;
select plan(7);

-- ── existência + grants ──────────────────────────────────────────────────────
select has_function('public', 'set_company_take_rate', 'set_company_take_rate existe');
select ok(
  has_function_privilege('authenticated', 'public.set_company_take_rate(uuid,integer)', 'execute'),
  'authenticated executa set_company_take_rate'
);
select ok(
  not has_function_privilege('anon', 'public.set_company_take_rate(uuid,integer)', 'execute'),
  'anon NÃO executa set_company_take_rate'
);

-- ── fixture: uma empresa do seed ─────────────────────────────────────────────
do $$
declare v_company uuid;
begin
  select id into v_company from public.company where deleted_at is null limit 1;
  perform set_config('test.company', v_company::text, false);
end $$;

-- ── como hub_admin: altera a comissão ────────────────────────────────────────
-- is_hub_admin() lê o JWT; simulamos um hub_admin via GUC do PostgREST.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'user_role', 'hub_admin')::text,
  true
);

select lives_ok(
  format($q$ select public.set_company_take_rate(%L::uuid, 1200) $q$, current_setting('test.company')),
  'hub_admin altera a comissão'
);
select is(
  (select take_rate_bps from public.company where id = current_setting('test.company')::uuid),
  1200,
  'take_rate_bps persistido (12%)'
);

-- ── faixa inválida → P0001 ───────────────────────────────────────────────────
select throws_ok(
  format($q$ select public.set_company_take_rate(%L::uuid, 10001) $q$, current_setting('test.company')),
  'P0001', NULL, 'rejeita comissão > 100%'
);

-- ── não-admin → 42501 ────────────────────────────────────────────────────────
select set_config(
  'request.jwt.claims',
  json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'user_role', 'customer')::text,
  true
);
select throws_ok(
  format($q$ select public.set_company_take_rate(%L::uuid, 800) $q$, current_setting('test.company')),
  '42501', NULL, 'não-admin não pode alterar comissão'
);

select * from finish();
rollback;
