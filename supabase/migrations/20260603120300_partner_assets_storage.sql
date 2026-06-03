-- Partner Onboarding — bucket de Storage para logo (empresa) e fotos (unidade)
-- Convenção de path: "<company_id>/<arquivo>" — o primeiro segmento é a empresa dona.

insert into storage.buckets (id, name, public)
values ('partner-assets', 'partner-assets', true)
on conflict (id) do nothing;

-- leitura pública (logos/fotos aparecem no site)
create policy partner_assets_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'partner-assets');

-- escrita restrita à empresa dona do path (operador) ou hub_admin
create policy partner_assets_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'partner-assets'
    and (
      public.is_hub_admin()
      or (storage.foldername(name))[1] in (
        select c.id::text from public.current_company_ids() c(id)
      )
    )
  );

create policy partner_assets_owner_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'partner-assets'
    and (
      public.is_hub_admin()
      or (storage.foldername(name))[1] in (
        select c.id::text from public.current_company_ids() c(id)
      )
    )
  );

create policy partner_assets_owner_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'partner-assets'
    and (
      public.is_hub_admin()
      or (storage.foldername(name))[1] in (
        select c.id::text from public.current_company_ids() c(id)
      )
    )
  );
