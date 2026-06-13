-- OPS-05 — Estrutura de Storage (Supabase Storage). Três buckets com política
-- de acesso explícita. Decisão (jun/2026): ficar no Supabase Storage agora
-- (100 GB no Pro, CDN + image transform embutidos, RLS = mesma policy do banco,
-- API S3-compatível → migrar p/ Cloudflare R2 depois, se o egress pesar, é trivial).
--
-- Buckets:
--   assets-public   — PÚBLICO (CDN + transform). Fotos de estacionamento, logo da
--                     empresa, imagens de destino (heros) e blog. Leitura pública;
--                     escrita = hub_admin (qualquer prefixo) ou operador no prefixo
--                     <company_id>/ da sua própria empresa.
--   vouchers        — PRIVADO. Já criado em 20260615000000 (PII: placa/nome). Upload
--                     via service_role na edge `voucher-pdf` + signed URL. Mantido aqui
--                     idempotente, reforçando privado + limites. SEM policies (o
--                     service_role bypassa RLS; signed URLs são pré-autorizadas).
--   partner-uploads — PRIVADO. Uploads da extranet (documentos etc.), RLS por
--                     company_id (1º segmento do path). SEM leitura pública.
--
-- Convenção de path:
--   assets-public/<company_id>/...      fotos/logo da empresa  (operador escreve)
--   assets-public/destinations/<slug>/… heros de destino       (hub_admin)
--   assets-public/blog/...              imagens do blog        (hub_admin)
--   partner-uploads/<company_id>/...    uploads privados da empresa
--
-- Privacidade (LGPD): voucher e uploads da extranet NÃO vão em bucket público —
-- bucket público é enumerável e voucher tem dado pessoal.

-- ── assets-public ────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'assets-public', 'assets-public', true,
  10485760, -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/svg+xml']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Leitura: pública (bucket public=true → servida pelo CDN sem RLS).
-- Escrita: hub_admin em qualquer prefixo; operador só sob <company_id>/ da sua empresa.
drop policy if exists assets_public_owner_insert on storage.objects;
create policy assets_public_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'assets-public'
    and (
      public.is_hub_admin()
      or (storage.foldername(name))[1] in (select c.id::text from public.current_company_ids() c(id))
    )
  );

drop policy if exists assets_public_owner_update on storage.objects;
create policy assets_public_owner_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'assets-public'
    and (
      public.is_hub_admin()
      or (storage.foldername(name))[1] in (select c.id::text from public.current_company_ids() c(id))
    )
  )
  with check (
    bucket_id = 'assets-public'
    and (
      public.is_hub_admin()
      or (storage.foldername(name))[1] in (select c.id::text from public.current_company_ids() c(id))
    )
  );

drop policy if exists assets_public_owner_delete on storage.objects;
create policy assets_public_owner_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'assets-public'
    and (
      public.is_hub_admin()
      or (storage.foldername(name))[1] in (select c.id::text from public.current_company_ids() c(id))
    )
  );

-- ── vouchers (já existe; reforça privado + limites) ──────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vouchers', 'vouchers', false, 5242880, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── partner-uploads ──────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'partner-uploads', 'partner-uploads', false,
  20971520, -- 20 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'application/pdf']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- RLS por company_id (1º segmento do path). hub_admin acessa tudo. Sem leitura pública.
drop policy if exists partner_uploads_company_select on storage.objects;
create policy partner_uploads_company_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'partner-uploads'
    and (
      public.is_hub_admin()
      or (storage.foldername(name))[1] in (select c.id::text from public.current_company_ids() c(id))
    )
  );

drop policy if exists partner_uploads_company_insert on storage.objects;
create policy partner_uploads_company_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'partner-uploads'
    and (
      public.is_hub_admin()
      or (storage.foldername(name))[1] in (select c.id::text from public.current_company_ids() c(id))
    )
  );

drop policy if exists partner_uploads_company_update on storage.objects;
create policy partner_uploads_company_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'partner-uploads'
    and (
      public.is_hub_admin()
      or (storage.foldername(name))[1] in (select c.id::text from public.current_company_ids() c(id))
    )
  )
  with check (
    bucket_id = 'partner-uploads'
    and (
      public.is_hub_admin()
      or (storage.foldername(name))[1] in (select c.id::text from public.current_company_ids() c(id))
    )
  );

drop policy if exists partner_uploads_company_delete on storage.objects;
create policy partner_uploads_company_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'partner-uploads'
    and (
      public.is_hub_admin()
      or (storage.foldername(name))[1] in (select c.id::text from public.current_company_ids() c(id))
    )
  );

-- ── Convergência: aposenta o bucket legado `partner-assets` ──────────────────
-- Era público e usado pelo onboarding p/ logo/fotos; estava vazio e fora das
-- migrations (criado direto no banco vivo). É substituído por `assets-public`
-- (mesma convenção de path + RLS); o wizardApi passou a usar `assets-public`.
-- O Supabase proíbe `delete from storage.buckets` via SQL (trigger protect_delete),
-- então não removemos a linha do bucket aqui — apenas tiramos as policies de
-- escrita para o bucket ficar inerte (vazio e sem novas gravações). A remoção
-- definitiva, se desejada, é feita pela Storage API (dashboard/CLI).
drop policy if exists partner_assets_owner_insert on storage.objects;
drop policy if exists partner_assets_owner_update on storage.objects;
drop policy if exists partner_assets_owner_delete on storage.objects;
