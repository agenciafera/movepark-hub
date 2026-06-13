import { supabase } from "@/lib/supabase";

// Buckets do projeto (OPS-05 — ver docs/specs/storage-buckets.md).
export const PUBLIC_ASSETS_BUCKET = "assets-public";
export const PARTNER_UPLOADS_BUCKET = "partner-uploads";

// Espelha os limites configurados no bucket `assets-public` (migration OPS-05).
export const PUBLIC_IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
export const PUBLIC_IMAGE_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
  "image/svg+xml",
] as const;

/** `accept` para <input type=file> de imagem pública (mesma lista do bucket). */
export const PUBLIC_IMAGE_ACCEPT = PUBLIC_IMAGE_MIME.join(",");

function extOf(file: File): string {
  return (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 9);
}

/** Valida tipo/tamanho contra os limites do bucket público. Lança Error legível. */
export function assertPublicImage(file: File): void {
  if (!(PUBLIC_IMAGE_MIME as readonly string[]).includes(file.type)) {
    throw new Error("Formato inválido. Use JPG, PNG, WebP, AVIF, GIF ou SVG.");
  }
  if (file.size > PUBLIC_IMAGE_MAX_BYTES) {
    throw new Error("Imagem muito grande (máx. 10 MB).");
  }
}

/**
 * Convenção de path do bucket público (amarração num só lugar — ver storage-buckets.md):
 *   assets-public/<company_id>/...        fotos/logo da empresa (operador escreve)
 *   assets-public/destinations/<slug>/…   heros de destino (hub_admin)
 *   assets-public/blog/<slug>/…           imagens do blog (hub_admin)
 */
export const publicAssetDir = {
  company: (companyId: string) => companyId,
  destination: (codeOrSlug: string) => `destinations/${codeOrSlug}`,
  blog: (slug: string) => `blog/${slug}`,
};

/**
 * Sobe um arquivo para `assets-public` em `<dir>/<name>-<rand>.<ext>` e devolve a
 * URL pública (CDN). A RLS do bucket decide quem pode escrever em cada prefixo.
 */
export async function uploadPublicAsset(dir: string, name: string, file: File): Promise<string> {
  assertPublicImage(file);
  const path = `${dir.replace(/\/+$/, "")}/${name}-${randomSuffix()}.${extOf(file)}`;
  const { error } = await supabase.storage.from(PUBLIC_ASSETS_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: true,
  });
  if (error) throw new Error(error.message);
  return supabase.storage.from(PUBLIC_ASSETS_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Hero/imagens de um destino (hub_admin). Path: assets-public/destinations/<codeOrSlug>/. */
export function uploadDestinationImage(codeOrSlug: string, name: string, file: File): Promise<string> {
  return uploadPublicAsset(publicAssetDir.destination(codeOrSlug), name, file);
}

/** Assets públicos de uma empresa (logo/fotos). Path: assets-public/<company_id>/. */
export function uploadCompanyAsset(companyId: string, name: string, file: File): Promise<string> {
  return uploadPublicAsset(publicAssetDir.company(companyId), name, file);
}
