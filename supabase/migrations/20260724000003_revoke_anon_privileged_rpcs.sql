-- Hardening de grants: revoga EXECUTE do papel `anon` em RPCs privilegiadas.
--
-- Contexto (bug latente de produção): o baseline tem
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
-- então toda função criada depois recebe um grant DIRETO de EXECUTE para `anon`. As migrations
-- dessas RPCs fizeram apenas `revoke all ... from public`, que NÃO remove o grant direto ao
-- `anon` — logo `anon` continuava podendo executar (a barreira real era o check interno
-- is_hub_admin()/gating, mas a superfície ficava exposta e contrariava ADR-005 + hardening).
--
-- Aqui removemos o EXECUTE de `anon` nas três RPCs cobertas por teste. `authenticated` e
-- `service_role` mantêm o grant explícito dado nas migrations originais.
-- Ver docs/specs/permissions.md (ADR-005) e docs/security/.

revoke all on function public.set_company_take_rate(uuid, integer) from anon;
revoke all on function public.booking_attribution(timestamptz, timestamptz) from anon;
revoke all on function public.wl_company_config(uuid) from anon;
