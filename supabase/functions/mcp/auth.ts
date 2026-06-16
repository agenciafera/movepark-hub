// MCP server — autenticação por chave de API (espelha supabase/functions/api/auth.ts;
// funções não cruzam fronteira de Edge Function no deploy, então é duplicado local).
// Lógica pura/local (sem rede) — testável com deno test.

export function extractApiKey(headers: Headers): string | null {
  const auth = headers.get("Authorization");
  if (auth && auth.startsWith("Bearer ")) {
    const v = auth.slice(7).trim();
    return v.length > 0 ? v : null;
  }
  const x = headers.get("X-API-Key");
  return x && x.trim().length > 0 ? x.trim() : null;
}

export function keyPrefix(key: string): string {
  return key.slice(0, 16);
}

export function hasScope(scopes: string[] | null | undefined, required: string): boolean {
  return Array.isArray(scopes) && scopes.includes(required);
}

// sha256 hex (lowercase) — casa com encode(digest(key::bytea,'sha256'),'hex') do Postgres.
export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
