-- Varredura de hardening: revoga EXECUTE de `anon` em TODAS as RPCs privilegiadas
-- (SECURITY DEFINER com guarda interna de autorização) que ainda estavam expostas.
--
-- Mesma causa-raiz de 20260724000000: o baseline tem
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
-- então toda função criada depois ganhou um grant DIRETO de EXECUTE para `anon`, que o
-- `revoke ... from public` das migrations NÃO removia. Resultado: RPCs de operador/empresa/
-- KYC/chaves-de-API/reviews ficavam chamáveis por `anon` (a barreira real era só o check
-- interno is_hub_admin()/member_has_scope()/assert). Aqui fechamos a superfície.
--
-- IMPORTANTE — o que NÃO é revogado: os helpers usados DENTRO de policies RLS
-- (is_hub_admin, current_company_ids, member_has_scope) precisam de EXECUTE para `anon`,
-- senão SELECTs anônimos no catálogo público (company/location/...) quebram com
-- "permission denied for function". Esses três ficam intactos de propósito.
--
-- `authenticated` e `service_role` mantêm o EXECUTE (grant explícito das migrations
-- originais + default privileges). Ver ADR-005 (docs/specs/permissions.md) e
-- [[anon-grant-default-privileges]]. Regressão coberta em tests/anon_privileged_rpcs.test.sql.

revoke all on function public.addon_assert_company_access(p_company_id uuid) from anon;
revoke all on function public.api_create_booking(p_company_id uuid, p_api_key_id uuid, p_location_parking_type_id uuid, p_check_in_at timestamp with time zone, p_check_out_at timestamp with time zone, p_customer_name text, p_customer_email text, p_customer_phone text, p_passenger_count integer, p_has_pcd boolean, p_add_on_ids uuid[], p_coupon_code text, p_idempotency_key text, p_origin text, p_fare_tier fare_tier) from anon;
revoke all on function public.company_list_members(p_company_id uuid) from anon;
revoke all on function public.company_remove_member(p_company_id uuid, p_profile_id uuid) from anon;
revoke all on function public.company_set_member_role(p_company_id uuid, p_profile_id uuid, p_role company_role) from anon;
revoke all on function public.coupon_assert_company_access(p_company_id uuid) from anon;
revoke all on function public.current_member_scopes(p_company_id uuid) from anon;
revoke all on function public.discount_assert_company_access(p_company_id uuid) from anon;
revoke all on function public.is_company_owner(p_company_id uuid) from anon;
revoke all on function public.onboarding_upsert_payout_account(p_company_id uuid, p_account jsonb) from anon;
revoke all on function public.operator_api_usage(p_company_id uuid, p_limit integer, p_since timestamp with time zone) from anon;
revoke all on function public.operator_create_api_key(p_company_id uuid, p_name text, p_environment text, p_scopes text[], p_expires_at timestamp with time zone) from anon;
revoke all on function public.operator_delete_addon(p_add_on_service_id uuid) from anon;
revoke all on function public.operator_delete_coupon(p_coupon_id uuid) from anon;
revoke all on function public.operator_delete_discount(p_discount_rule_id uuid) from anon;
revoke all on function public.operator_list_api_keys(p_company_id uuid) from anon;
revoke all on function public.operator_location_occupancy(p_location_id uuid, p_from date, p_to date) from anon;
revoke all on function public.operator_respond_review(p_review_id uuid, p_response text) from anon;
revoke all on function public.operator_revoke_api_key(p_api_key_id uuid) from anon;
revoke all on function public.operator_rotate_api_key(p_api_key_id uuid) from anon;
revoke all on function public.operator_set_coupon_active(p_coupon_id uuid, p_is_active boolean) from anon;
revoke all on function public.operator_set_discount_active(p_discount_rule_id uuid, p_is_active boolean) from anon;
revoke all on function public.operator_set_location_addon(p_add_on_service_id uuid, p_location_id uuid, p_is_active boolean, p_price_override numeric) from anon;
revoke all on function public.operator_set_unit_fare(p_location_parking_type_id uuid, p_tier fare_tier, p_enabled boolean, p_price_cents integer) from anon;
revoke all on function public.operator_update_api_key_scopes(p_api_key_id uuid, p_scopes text[]) from anon;
revoke all on function public.operator_upsert_addon(p_company_id uuid, p_id uuid, p_code text, p_name text, p_description text, p_base_price numeric, p_is_active boolean, p_sort_order integer) from anon;
revoke all on function public.operator_upsert_coupon(p_company_id uuid, p_id uuid, p_code text, p_description text, p_discount_type text, p_discount_value numeric, p_valid_from timestamp with time zone, p_valid_until timestamp with time zone, p_max_uses integer, p_is_active boolean, p_sort_order integer, p_per_user_limit integer, p_min_amount numeric, p_min_days integer, p_parking_type_ids uuid[]) from anon;
revoke all on function public.operator_upsert_discount(p_company_id uuid, p_id uuid, p_location_id uuid, p_name text, p_description text, p_discount_type text, p_discount_value numeric, p_valid_from timestamp with time zone, p_valid_until timestamp with time zone, p_min_days integer, p_min_amount numeric, p_advance_days integer, p_allow_coupon_stack boolean, p_priority integer, p_is_active boolean, p_sort_order integer, p_parking_type_ids uuid[]) from anon;
revoke all on function public.submit_review(p_booking_id uuid, p_rating integer, p_comment text, p_cleanliness integer, p_service integer, p_value integer, p_access integer) from anon;
