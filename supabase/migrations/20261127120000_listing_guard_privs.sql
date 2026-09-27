-- O trigger `location_listing_guard` nasceu SECURITY DEFINER com o grant padrão do schema
-- (executável por anon e authenticated), e os inventários `rls_inventory`/funções-trigger do CI
-- reprovaram. Trigger dispara sem EXECUTE do chamador; ninguém precisa chamá-lo por RPC.
revoke all on function public.location_listing_guard() from public, anon, authenticated;
