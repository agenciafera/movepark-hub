-- Faxina (13/10/2026): as RPCs da aba "Pelo seu site", que saiu na fase 2 das reservas unificadas
-- (09/10/2026). A leitura das reservas do site é a lista única (`bookings_list_page`, com o mesmo
-- recorte por empresa e o escopo `wl-bookings:read` via `wl_visible_company_ids`). Nenhuma tela usa
-- estas duas desde então. Spec: reservas-unificadas-hub-wl.md § 10.

drop function if exists public.operator_wl_bookings(uuid, text, text, timestamptz, timestamptz, integer);
drop function if exists public.operator_wl_bookings_count(uuid);
