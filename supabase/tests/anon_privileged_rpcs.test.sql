-- pgTAP: hardening de grants — `anon` não executa RPCs privilegiadas, mas MANTÉM os
-- helpers usados em policies RLS. Ver 20260724000000 + 20260725000000 e ADR-005.

begin;
select plan(31);

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

-- ── Leva 20260726000000: triggers/crons/mutações de booking — anon NÃO executa ─
-- triggers (nunca chamáveis via RPC)
select ok(not has_function_privilege('anon', 'public.coupon_bump_on_payment()', 'execute'),
  'anon NÃO executa coupon_bump_on_payment (trigger)');
select ok(not has_function_privilege('anon', 'public.handle_auth_user_updated()', 'execute'),
  'anon NÃO executa handle_auth_user_updated (trigger)');
select ok(not has_function_privilege('anon', 'public.review_bump_location_rating()', 'execute'),
  'anon NÃO executa review_bump_location_rating (trigger)');
select ok(not has_function_privilege('anon', 'public.wl_enqueue_delivery()', 'execute'),
  'anon NÃO executa wl_enqueue_delivery (trigger)');
select ok(not has_function_privilege('anon', 'public.wps_enqueue_booking_event()', 'execute'),
  'anon NÃO executa wps_enqueue_booking_event (trigger)');
-- crons (mutação de estado)
select ok(not has_function_privilege('anon', 'public.cron_complete_bookings()', 'execute'),
  'anon NÃO executa cron_complete_bookings');
select ok(not has_function_privilege('anon', 'public.cron_expire_pending_bookings()', 'execute'),
  'anon NÃO executa cron_expire_pending_bookings');
select ok(not has_function_privilege('anon', 'public.cron_prune_api_request_log()', 'execute'),
  'anon NÃO executa cron_prune_api_request_log');
-- mutações de booking (callers usam service_role/authenticated)
select ok(not has_function_privilege('anon', 'public._create_booking_core(uuid, uuid, text, text, text, uuid, timestamptz, timestamptz, integer, boolean, uuid, uuid[], text, text, fare_tier)', 'execute'),
  'anon NÃO executa _create_booking_core');
select ok(not has_function_privilege('anon', 'public.create_booking_atomic(uuid, uuid, timestamptz, timestamptz, integer, boolean, uuid, uuid[], text, text, fare_tier)', 'execute'),
  'anon NÃO executa create_booking_atomic');
select ok(not has_function_privilege('anon', 'public.apply_fare_upgrade(uuid, fare_tier)', 'execute'),
  'anon NÃO executa apply_fare_upgrade');
select ok(not has_function_privilege('anon', 'public.change_booking_dates(uuid, timestamptz, timestamptz)', 'execute'),
  'anon NÃO executa change_booking_dates');
select ok(not has_function_privilege('anon', 'public.extend_booking_flight_delay(uuid, timestamptz, text, text)', 'execute'),
  'anon NÃO executa extend_booking_flight_delay');
select ok(not has_function_privilege('anon', 'public.release_booking_capacity(uuid)', 'execute'),
  'anon NÃO executa release_booking_capacity');
select ok(not has_function_privilege('anon', 'public.review_recompute_location(uuid)', 'execute'),
  'anon NÃO executa review_recompute_location');
select ok(not has_function_privilege('anon', 'public.wl_reconcile_apply(uuid, jsonb)', 'execute'),
  'anon NÃO executa wl_reconcile_apply');

-- ── authenticated CONTINUA executando (não trancamos os operadores) ──────────
select ok(has_function_privilege('authenticated', 'public.operator_create_api_key(uuid, text, text, text[], timestamptz)', 'execute'),
  'authenticated mantém EXECUTE em operator_create_api_key');
-- o caller real de create_booking_atomic é o client service_role da Edge — deve manter EXECUTE
select ok(has_function_privilege('service_role', 'public.create_booking_atomic(uuid, uuid, timestamptz, timestamptz, integer, boolean, uuid, uuid[], text, text, fare_tier)', 'execute'),
  'service_role mantém EXECUTE em create_booking_atomic (caller real da Edge)');

-- ── Invariante gateway-only: NENHUMA função api_* é chamável por anon/authenticated ──────────
-- Elas são SECURITY DEFINER que confiam no company_id do gateway (sem auth.uid()); só service_role
-- as chama. Assertion agregada (assinatura-agnóstica) pega qualquer regressão futura, inclusive
-- funções api_* novas ou recriadas que reganhem o grant default. Regressão real: api_create_booking
-- reabriu para `authenticated` ao ser recriada em 20260717 (fechada em 20260807000000).
select is(
  (select count(*)::int
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'api\_%'
      and (has_function_privilege('anon', p.oid, 'execute')
        or has_function_privilege('authenticated', p.oid, 'execute'))),
  0,
  'nenhuma função api_* é executável por anon ou authenticated (gateway-only, service_role)');

select * from finish();
rollback;
