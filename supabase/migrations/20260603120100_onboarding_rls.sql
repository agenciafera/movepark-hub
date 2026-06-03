-- Partner Onboarding — RLS
-- Reaproveita os helpers existentes is_hub_admin() / current_company_ids().

-- 1. company_onboarding
alter table public.company_onboarding enable row level security;

-- hub_admin: acesso total (triagem, aprovação, recusa, notas)
create policy company_onboarding_admin_all on public.company_onboarding
  for all to authenticated
  using (public.is_hub_admin())
  with check (public.is_hub_admin());

-- operador: lê e atualiza apenas a própria empresa (progresso do wizard)
-- INSERT/DELETE não são expostos: a linha nasce via Edge Function (service_role).
create policy company_onboarding_operator_select on public.company_onboarding
  for select to authenticated
  using (company_id in (select public.current_company_ids()));

create policy company_onboarding_operator_update on public.company_onboarding
  for update to authenticated
  using (company_id in (select public.current_company_ids()))
  with check (company_id in (select public.current_company_ids()));

grant select, update on public.company_onboarding to authenticated;

-- 2. Defesa em profundidade no catálogo público de company:
--    além de status='active', exige onboarding_status='active' para nunca vazar
--    parceiro pendente caso o status operacional fique inconsistente.
drop policy if exists catalog_read_company on public.company;
create policy catalog_read_company on public.company
  for select to anon, authenticated
  using (deleted_at is null and status = 'active' and onboarding_status = 'active');

-- 3. Leitura pelo operador dos próprios serviços adicionais (mesmo inativos),
--    necessária para o Step 5 do wizard reexibir o que já cadastrou.
create policy add_on_service_operator_select on public.add_on_service
  for select to authenticated
  using (public.is_hub_admin() or company_id in (select public.current_company_ids()));

create policy location_add_on_service_operator_select on public.location_add_on_service
  for select to authenticated
  using (
    public.is_hub_admin()
    or location_id in (
      select id from public.location
      where company_id in (select public.current_company_ids())
    )
  );
