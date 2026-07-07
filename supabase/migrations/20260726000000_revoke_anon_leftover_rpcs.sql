-- Hardening de grants (E0.6) — terceira leva: revoga EXECUTE de `anon` nas RPCs
-- SECURITY DEFINER que escaparam dos sweeps 20260724000000 / 20260725000000.
--
-- Mesma causa-raiz das anteriores: o baseline tem
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
-- (default do Supabase) — toda função criada depois ganha grant DIRETO de EXECUTE para `anon`.
-- Ver [[anon-grant-default-privileges]] e docs/security/. Reverter o default privilege para
-- deny-by-default é mudança de blast-radius grande → fica na E4.2; aqui é point-revoke.
--
-- As 16 funções abaixo NÃO são reads públicos do funil — dividem-se em:
--   • triggers (5): handlers de trigger, nunca devem ser chamados via RPC direto;
--   • crons (3): mutações de estado (completar/expirar reservas, podar log) invocadas pelo
--     pg_cron no contexto do owner — `anon` poder chamá-las era bypass real;
--   • mutações de booking (8): chamadas pelas Edges via client `service_role` (admin.rpc) ou
--     pelo frontend com JWT `authenticated` — nunca por `anon`.
-- `authenticated` e `service_role` mantêm o EXECUTE (é assim que os callers reais rodam).
-- Os helpers de RLS (is_hub_admin, current_company_ids, member_has_scope, ...) continuam
-- executáveis por `anon` DE PROPÓSITO (senão SELECT anônimo no catálogo quebra) — não estão aqui.
-- Regressão coberta em supabase/tests/anon_privileged_rpcs.test.sql. Ver ADR-005.
--
-- Por que `from anon, public`: parte destas (os triggers/crons) só tinha o grant PUBLIC
-- default do Postgres (`=X/owner`) e nunca um grant direto a `anon` — então `revoke ... from
-- anon` sozinho era no-op e o anon seguia executando por herança do PUBLIC. Revogar PUBLIC
-- também fecha o buraco; `authenticated`/`service_role` têm grant explícito próprio e não
-- são afetados. Ver [[anon-grant-default-privileges]].

-- ── triggers (nunca chamáveis via RPC) ───────────────────────────────────────
revoke all on function public.coupon_bump_on_payment() from anon, public;
revoke all on function public.handle_auth_user_updated() from anon, public;
revoke all on function public.review_bump_location_rating() from anon, public;
revoke all on function public.wl_enqueue_delivery() from anon, public;
revoke all on function public.wps_enqueue_booking_event() from anon, public;

-- ── crons (mutação de estado; rodam pelo pg_cron, não por anon) ───────────────
revoke all on function public.cron_complete_bookings() from anon, public;
revoke all on function public.cron_expire_pending_bookings() from anon, public;
revoke all on function public.cron_prune_api_request_log() from anon, public;

-- ── mutações de booking (callers usam service_role/authenticated) ─────────────
revoke all on function public._create_booking_core(uuid, uuid, text, text, text, uuid, timestamptz, timestamptz, integer, boolean, uuid, uuid[], text, text, fare_tier) from anon, public;
revoke all on function public.create_booking_atomic(uuid, uuid, timestamptz, timestamptz, integer, boolean, uuid, uuid[], text, text, fare_tier) from anon, public;
revoke all on function public.apply_fare_upgrade(uuid, fare_tier) from anon, public;
revoke all on function public.change_booking_dates(uuid, timestamptz, timestamptz) from anon, public;
revoke all on function public.extend_booking_flight_delay(uuid, timestamptz, text, text) from anon, public;
revoke all on function public.release_booking_capacity(uuid) from anon, public;
revoke all on function public.review_recompute_location(uuid) from anon, public;
revoke all on function public.wl_reconcile_apply(uuid, jsonb) from anon, public;
