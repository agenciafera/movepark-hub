-- E0.6 · Scan de segurança #1 — correções P0/P1 (Supabase security advisors).
--
-- P0 (Broken Access Control): as funções api_* são SECURITY DEFINER que CONFIAM no gateway
-- (recebem company_id por parâmetro, sem checar auth.uid()). Elas estavam com EXECUTE para
-- `anon` e `authenticated` — ou seja, qualquer um com a anon key (pública, vai no front) podia
-- chamar /rest/v1/rpc/api_upsert_coupon, api_update_parking_type, api_list_bookings, etc. com
-- QUALQUER company_id, burlando o sistema de chaves/escopo (escrita de catálogo, leitura de
-- reservas/PII, cancelamento). O gateway chama essas funções com service_role — então revogar
-- anon/authenticated preserva 100% do funcionamento. (api_set_pricing/api_set_date_blocked já
-- estavam corretas; este loop as deixa idempotentes.)
do $$
declare r record;
begin
  for r in
    select 'public.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'api\_%'
  loop
    execute format('revoke execute on function %s from anon, authenticated', r.sig);
  end loop;
end $$;

-- P1 (search_path mutável): funções SECURITY DEFINER sem search_path fixo são vulneráveis a
-- sequestro de resolução de nome. Fixa nas 4 sinalizadas (ALTER não toca a lógica).
alter function public._apply_pricing(
  p_strategy text, p_tiers jsonb, p_source_strategy text, p_source_tiers jsonb,
  p_surcharge_multiplier double precision, p_days integer
) set search_path = 'public', 'pg_temp';

alter function public._apply_pricing(
  p_strategy text, p_tiers jsonb, p_source_strategy text, p_source_tiers jsonb,
  p_surcharge_multiplier double precision, p_days integer,
  p_inc_one_day double precision, p_inc_two_days double precision, p_inc_base double precision,
  p_inc_mult double precision, p_monthly_fixed double precision, p_monthly_daily double precision,
  p_hourly_daily double precision
) set search_path = 'public', 'pg_temp';

alter function public.get_pricing_data(p_company text, p_location text, p_parking_type text)
  set search_path = 'public', 'pg_temp';

alter function public.min_stay_satisfied(
  p_unit minimum_stay_unit, p_value integer, p_total_minutes numeric, p_days integer
) set search_path = 'public', 'pg_temp';
