// Lógica pura do upload de assets públicos (testável sem Deno runtime).
// Espelha os limites do bucket `assets-public` (migration OPS-05) e a convenção
// de path de `src/lib/storage.ts`. A autorização real (hub_admin / membro da
// empresa) acontece no index.ts com acesso ao banco; aqui só classificamos o
// destino e validamos o arquivo/path.

export const PUBLIC_IMAGE_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
  "image/svg+xml",
] as const;

export const PUBLIC_IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A quem o asset pertence — define qual checagem de acesso o index aplica. */
export type AssetTarget =
  | { scope: "company"; companyId: string }
  | { scope: "destination" }
  | { scope: "blog" };

export type ClassifyResult =
  | { ok: true; target: AssetTarget }
  | { ok: false; error: string };

/**
 * Classifica o `dir` informado pelo cliente nas três convenções do bucket:
 *   <company_id>          → asset da empresa (operador/owner ou hub_admin)
 *   destinations/<slug>   → hero de destino (hub_admin)
 *   blog/<slug>           → imagem de blog (hub_admin)
 * Rejeita path traversal e formatos fora do padrão.
 */
export function classifyDir(dirRaw: string): ClassifyResult {
  const dir = (dirRaw ?? "").trim().replace(/^\/+|\/+$/g, "");
  if (!dir) return { ok: false, error: "Diretório do asset ausente." };

  const segments = dir.split("/");
  if (segments.some((s) => s === "" || s === "." || s === "..")) {
    return { ok: false, error: "Diretório de asset inválido." };
  }

  const first = segments[0];
  if (first === "destinations") return { ok: true, target: { scope: "destination" } };
  if (first === "blog") return { ok: true, target: { scope: "blog" } };
  if (UUID_RE.test(first) && segments.length === 1) {
    return { ok: true, target: { scope: "company", companyId: first } };
  }
  return { ok: false, error: "Diretório de asset inválido." };
}

export type ValidateResult = { ok: true } | { ok: false; error: string };

/** Valida tipo e tamanho contra os limites do bucket público. */
export function validateImage(file: { type: string; size: number }): ValidateResult {
  if (!(PUBLIC_IMAGE_MIME as readonly string[]).includes(file.type)) {
    return { ok: false, error: "Formato inválido. Use JPG, PNG, WebP, AVIF, GIF ou SVG." };
  }
  if (file.size <= 0) return { ok: false, error: "Arquivo vazio." };
  if (file.size > PUBLIC_IMAGE_MAX_BYTES) {
    return { ok: false, error: "Imagem muito grande (máx. 10 MB)." };
  }
  return { ok: true };
}

/** Extensão segura derivada do nome do arquivo (fallback `bin`). */
export function extOf(fileName: string): string {
  return (fileName.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
}

/** Slug seguro pro prefixo do nome (evita injeção de path/charset). */
export function sanitizeName(name: string): string {
  return (name || "file").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "file";
}

/** Monta o path final: `<dir>/<name>-<rand>.<ext>` (dir já classificado/limpo). */
export function buildObjectPath(dir: string, name: string, fileName: string, rand: string): string {
  const cleanDir = dir.trim().replace(/^\/+|\/+$/g, "");
  return `${cleanDir}/${sanitizeName(name)}-${rand}.${extOf(fileName)}`;
}
