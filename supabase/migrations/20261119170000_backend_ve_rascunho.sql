-- O backend enxerga rascunho (16/09/2026). Fecha o "Preço indisponível para essa configuração"
-- na primeira compra de teste da Agência Fera.
--
-- `is_tester()` decidia só por `auth.uid()`. As Edges que fecham reserva e mudam data
-- (`create-booking`, `change-booking-dates`, `change-booking-dates-paid`, `api`) chamam o banco
-- com a service role, sem sessão de usuário: `auth.uid()` é nulo, `is_tester()` dá falso, e o
-- `simulate_price` dentro de `_create_booking_core` esconde a unidade em rascunho do próprio
-- comprador que a busca acabou de mostrar. O testador via o preço na ficha (JWT dele) e
-- perdia na hora de reservar (service role).
--
-- Service role é o nosso backend, não o público: o que decide o que o visitante vê é a RLS e
-- as tools de leitura do chat e do MCP, que correm com a anon key e o JWT do usuário. Então a
-- service role passa a contar como testador. Anon e cliente comum seguem sem ver nada.

create or replace function public.is_tester() returns boolean
  language sql stable security definer
  set search_path = public, pg_temp
as $$
  select coalesce(auth.role(), '') = 'service_role'
      or public.is_hub_admin()
      or exists (select 1 from public.tester_user where user_id = auth.uid());
$$;
