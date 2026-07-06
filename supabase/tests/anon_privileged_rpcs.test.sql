-- pgTAP: hardening de grants — `anon` não executa RPCs privilegiadas, mas MANTÉM os
-- helpers usados em policies RLS. Ver 20260724000000 + 20260725000000 e ADR-005.

begin;
select plan(13);

-- ── Helpers usados DENTRO de policies RLS: anon PRECISA manter EXECUTE ────────
-- (senão SELECT anônimo no catálogo público quebra com "permission denied for function")
select ok(has_function_privilege('anon', 'public.is_hub_admin()', 'execute'),
  'anon mantém EXECUTE em is_hub_admin (usado em RLS)');
select ok(has_function_privilege('anon', 'public.current_company_ids()', 'execute'),
  'anon mantém EXECUTE em current_company_ids (usado em RLS)');
select ok(has_function_privilege('anon', 'public.member_has_scope(uuid, text)', 'execute'),
  'anon mantém EXECUTE em member_has_scope (usado em RLS)');

-- ── RPCs privilegiadas: anon NÃO executa (amostra representativa) ─────────────
select ok(not has_function_privilege('anon', 'public.set_company_take_rate(uuid, integer)', 'execute'),
  'anon NÃO executa set_company_take_rate');
select ok(not has_function_privilege('anon', 'public.booking_attribution(timestamptz, timestamptz)', 'execute'),
  'anon NÃO executa booking_attribution');
select ok(not has_function_privilege('anon', 'public.wl_company_config(uuid)', 'execute'),
  'anon NÃO executa wl_company_config');
select ok(not has_function_privilege('anon', 'public.company_set_member_role(uuid, uuid, company_role)', 'execute'),
  'anon NÃO executa company_set_member_role');
select ok(not has_function_privilege('anon', 'public.operator_create_api_key(uuid, text, text, text[], timestamptz)', 'execute'),
  'anon NÃO executa operator_create_api_key');
select ok(not has_function_privilege('anon', 'public.onboarding_upsert_payout_account(uuid, jsonb)', 'execute'),
  'anon NÃO executa onboarding_upsert_payout_account (KYC)');
select ok(not has_function_privilege('anon', 'public.submit_review(uuid, integer, text, integer, integer, integer, integer)', 'execute'),
  'anon NÃO executa submit_review');
-- Estas duas vinham de grant a PUBLIC (não do grant direto) — regressão fácil de reintroduzir
select ok(not has_function_privilege('anon', 'public.is_company_owner(uuid)', 'execute'),
  'anon NÃO executa is_company_owner (grant de PUBLIC removido)');
select ok(not has_function_privilege('anon', 'public.current_member_scopes(uuid)', 'execute'),
  'anon NÃO executa current_member_scopes (grant de PUBLIC removido)');

-- ── authenticated CONTINUA executando (não trancamos os operadores) ──────────
select ok(has_function_privilege('authenticated', 'public.operator_create_api_key(uuid, text, text, text[], timestamptz)', 'execute'),
  'authenticated mantém EXECUTE em operator_create_api_key');

select * from finish();
rollback;
