-- E2.5.1 · Sincronização de disponibilidade Hub ↔ white-label (mapa por tipo de vaga + config gateada).
--
-- 1) Mapa de SKU: o WL conta por (category, product). Cada location_parking_type do Hub
--    guarda a category_slug + product_slug correspondentes no WL.
-- 2) RPC wl_company_config: devolve a config WL da empresa (domínio/tenant/enabled) só pra
--    quem é hub_admin ou opera a empresa — mesmo gating da ocupação. A Edge wl-sync chama
--    isso com o JWT do usuário; o token (Bearer) é global e vive no secret do servidor.

alter table public.location_parking_type
  add column if not exists wl_category_slug text,
  add column if not exists wl_product_slug text;

comment on column public.location_parking_type.wl_category_slug is
  'Slug da category (unidade) no white-label legado — usado pra casar disponibilidade.';
comment on column public.location_parking_type.wl_product_slug is
  'Slug do product (tipo de vaga) no white-label legado — usado pra casar disponibilidade.';

create or replace function public.wl_company_config(p_company_id uuid)
returns table(wl_domain text, wl_tenant_key text, wl_sync_enabled boolean)
language plpgsql stable security definer set search_path to 'public' as $fn$
begin
  if not public.is_hub_admin()
     and not exists (
       select 1 from public.profile_company
       where profile_id = auth.uid() and company_id = p_company_id
     ) then
    raise exception 'Sem permissão para a config de integração desta empresa.' using errcode = '42501';
  end if;

  return query
    select c.wl_domain, c.wl_tenant_key, c.wl_sync_enabled
    from public.company c
    where c.id = p_company_id and c.deleted_at is null;
end; $fn$;

revoke all on function public.wl_company_config(uuid) from public;
grant execute on function public.wl_company_config(uuid) to authenticated, service_role;
