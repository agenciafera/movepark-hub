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
 * URL pública (CDN). Vai pela Edge Function `upload-asset` (escreve via
 * service_role após validar hub_admin/membro da empresa) — a RLS de Storage não
 * aplica a identidade do JWT assimétrico de forma confiável, então o upload
 * direto do browser falhava mesmo para admin. A Edge valida o escopo do `dir`.
 */
export async function uploadPublicAsset(dir: string, name: string, file: File): Promise<string> {
  assertPublicImage(file);

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Você precisa entrar para enviar imagens.");

  const form = new FormData();
  form.append("file", file);
  form.append("dir", dir.replace(/\/+$/, ""));
  form.append("name", name);

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-asset`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: form, // sem Content-Type: o browser define o boundary do multipart
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Falha ao enviar imagem (HTTP ${res.status})`);
  }
  const data = (await res.json()) as { url: string };
  return data.url;
}

/** Hero/imagens de um destino (hub_admin). Path: assets-public/destinations/<codeOrSlug>/. */
export function uploadDestinationImage(codeOrSlug: string, name: string, file: File): Promise<string> {
  return uploadPublicAsset(publicAssetDir.destination(codeOrSlug), name, file);
}

/** Assets públicos de uma empresa (logo/fotos). Path: assets-public/<company_id>/. */
export function uploadCompanyAsset(companyId: string, name: string, file: File): Promise<string> {
  return uploadPublicAsset(publicAssetDir.company(companyId), name, file);
}

// ── Otimização de imagem (Supabase Image Transformation) ─────────────────────
// O upload NÃO converte formato — o ganho de SEO/LCP (WebP/AVIF + resize) vem ao
// servir, pelo endpoint de render, que negocia o formato pelo header Accept.

const OBJECT_PUBLIC_SEG = "/storage/v1/object/public/";
const RENDER_PUBLIC_SEG = "/storage/v1/render/image/public/";

export type ImageTransform = {
  width?: number;
  height?: number;
  quality?: number; // 20–100 (default do Supabase: 80)
  resize?: "cover" | "contain" | "fill";
};

/** True se a URL é um objeto público do nosso Storage (pode ser transformada). */
export function isTransformableAsset(url: string | null | undefined): boolean {
  return !!url && url.includes(OBJECT_PUBLIC_SEG);
}

/**
 * Reescreve uma URL pública do nosso Storage para o endpoint de transform
 * (WebP/AVIF automático por `Accept` + resize). URLs externas (coladas) ou vazias
 * passam direto, sem alteração.
 */
export function optimizedImageUrl(
  url: string | null | undefined,
  t: ImageTransform = {},
): string | undefined {
  if (!url) return undefined;
  if (!isTransformableAsset(url)) return url;
  const base = url.replace(OBJECT_PUBLIC_SEG, RENDER_PUBLIC_SEG);
  const params = new URLSearchParams();
  if (t.width) params.set("width", String(t.width));
  if (t.height) params.set("height", String(t.height));
  if (t.quality) params.set("quality", String(t.quality));
  if (t.resize) params.set("resize", t.resize);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/** Monta um `srcset` responsivo (em `w`) a partir de uma imagem do Storage. */
export function imageSrcSet(url: string | null | undefined, widths: number[], quality?: number): string | undefined {
  if (!isTransformableAsset(url)) return undefined; // sem transform p/ URLs externas
  return widths
    .map((w) => `${optimizedImageUrl(url, { width: w, quality })} ${w}w`)
    .join(", ");
}
