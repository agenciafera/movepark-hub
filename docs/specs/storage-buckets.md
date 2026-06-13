# Storage / Buckets (OPS-05)

> Status: ✅ Implementado — migration `20260619000000_storage_buckets_ops05.sql`.
> Storage de assets no **Supabase Storage** com 3 buckets e RLS explícita.
> Teste: `supabase/tests/storage_buckets.test.sql` (pgTAP).

## Decisão (jun/2026): Supabase Storage agora

Ficamos no **Supabase Storage** (não S3 puro, não R2 ainda):

- Volume cabe nos **100 GB** já inclusos no plano Pro; custo marginal ≈ 0.
- **CDN + transform de imagem embutidos** (resize/format na URL) → ganha LCP/Core
  Web Vitals (alimenta SEO). S3 puro não faz isso nativo.
- **Acesso via RLS** (a mesma policy do banco) — sem montar IAM por fora.
- API **S3-compatível** → zero lock-in; migrar p/ R2 depois é trivial.

**Por que não S3 puro:** "já temos conta AWS" só poupa cadastro — não poupa egress
($0,09/GB, igual ao Supabase) e ainda obriga montar CloudFront + transform + permissão.

**Gatilho de migração futura → Cloudflare R2:** quando a mídia paga escalar e o
**egress** pesar na fatura, mover os assets públicos pesados (fotos + blog) pro R2
(**egress zero**, nativo do Cloudflare Pages que já usamos no deploy).

## Buckets

| Bucket | Visibilidade | Limite | MIME | Uso |
|---|---|---|---|---|
| `assets-public` | **público** (CDN + transform) | 10 MB | imagens (`jpeg/png/webp/avif/gif/svg`) | Fotos de estacionamento, logo da empresa, **heros de destino**, imagens de blog |
| `vouchers` | **privado** | 5 MB | `application/pdf` | PDF de voucher (PII). Upload via service_role na edge `voucher-pdf` + **signed URL** |
| `partner-uploads` | **privado** | 20 MB | imagens + `pdf` | Uploads da extranet (documentos etc.), escopo por `company_id` |

> `vouchers` já existia (migration `20260615000000`); o OPS-05 só reforça privado + limites.
> O bucket legado **`partner-assets`** (público) foi **aposentado**: substituído por
> `assets-public` (mesma convenção de path + RLS). Como o Supabase proíbe deletar bucket
> via SQL (trigger `protect_delete`), a linha do bucket permanece **inerte** (vazia, sem
> policies de escrita); a remoção definitiva, se desejada, é feita pela Storage API.

## Convenção de path

```
assets-public/<company_id>/...        fotos/logo da empresa     (operador escreve)
assets-public/destinations/<slug>/…   heros de destino          (hub_admin)
assets-public/blog/...                imagens do blog           (hub_admin)
partner-uploads/<company_id>/...      uploads privados da empresa
vouchers/<booking_id>.pdf             voucher (service_role)
```

O **1º segmento do path** (`storage.foldername(name)[1]`) é a chave de escopo.

## RLS (`storage.objects`)

Reusa os helpers do banco: `public.is_hub_admin()` e `public.current_company_ids()`
(via `profile_company`). Mesmo padrão das policies de tabela do projeto.

- **`assets-public`** — leitura **pública** (servida pelo CDN, sem RLS). Escrita
  (`insert`/`update`/`delete`, role `authenticated`):
  `is_hub_admin()` **ou** `foldername[1] ∈ current_company_ids()`. Ou seja: o
  `hub_admin` escreve em qualquer prefixo (`blog/`, `destinations/`, qualquer empresa);
  o operador só sob `<sua_company_id>/`.
- **`partner-uploads`** — privado. `select`/`insert`/`update`/`delete` (role
  `authenticated`): `is_hub_admin()` **ou** `foldername[1] ∈ current_company_ids()`.
  Sem policy de leitura para `anon` → conteúdo não vaza.
- **`vouchers`** — **sem policies**: o `service_role` (edge `voucher-pdf`) faz upload e
  gera `createSignedUrl` (validade); o cliente nunca acessa o storage direto. Bucket
  privado + signed URL evita expor PII (placa/nome) num bucket enumerável (LGPD).

## Uso no código

Fonte única do bucket/convenção/validação: **`src/lib/storage.ts`** — `uploadPublicAsset(dir, name, file)`
(+ atalhos `uploadDestinationImage`, `uploadCompanyAsset`), `assertPublicImage`, `publicAssetDir`,
`PUBLIC_IMAGE_ACCEPT`/`PUBLIC_IMAGE_MAX_BYTES` (espelham os limites do bucket).

Componentes de UI reutilizáveis (agnósticos de bucket — recebem `onUpload`):
**`src/components/shared/ImageUpload.tsx`** → `ImageUploadField` (1 imagem: preview + envio +
campo de URL/paste + remover) e `ImageGalleryField` (N imagens: grade + remover).

- **Heros de destino (hub_admin):** `DestinationForm` usa `ImageUploadField` +
  `uploadDestinationImage(code, "hero", file)` → `assets-public/destinations/<code>/…`; a URL
  pública vai em `destination.hero_image_url` (ver [destinations.md](./destinations.md)).
- **Logo/fotos da empresa (operador/onboarding):** `uploadPartnerAsset()` em
  `wizardApi.ts` agora delega para `uploadCompanyAsset()` (path `<company_id>/…`). Usado nos
  passos do wizard (logo/fotos) e na galeria **"Fotos da unidade"** do `LocationForm`
  (`ImageGalleryField`, grava em `location.photos`).
- **Voucher:** edge `voucher-pdf` (service_role) → `vouchers` + signed URL
  (ver [voucher-qrcode.md](./voucher-qrcode.md)).

## Comparativo Supabase × S3 × R2

| Critério | Supabase Storage | S3 puro | Cloudflare R2 |
|---|---|---|---|
| CDN + image transform | **nativo** (na URL) | montar CloudFront + Lambda | precisa Images/Workers |
| Controle de acesso | **RLS** (mesma do banco) | IAM/políticas por fora | tokens/Workers |
| Egress | $0,09/GB | $0,09/GB | **zero** |
| Lock-in | baixo (S3-compatível) | — | baixo |
| Quando | **agora** (MVP) | — | quando egress pesar |
