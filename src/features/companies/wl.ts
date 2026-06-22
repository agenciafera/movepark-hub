/**
 * Integração com o backend white-label legado.
 * O path da API é fixo para todos os tenants — só o domínio varia por empresa.
 */
export const WL_API_PATH = "/api/v3/backend";

/**
 * Normaliza o que o usuário digita no campo "domínio" para apenas o host.
 * Aceita "https://ferapark.movepark.com.br/api/v3/backend", "ferapark.movepark.com.br/",
 * "FeraPark.Movepark.com.br" → "ferapark.movepark.com.br". Vazio → null.
 */
export function normalizeWlDomain(input: string): string | null {
  const host = input
    .trim()
    .replace(/^https?:\/\//i, "") // tira protocolo
    .replace(/\/.*$/, "") // tira qualquer path (inclui /api/v3/backend)
    .replace(/\s+/g, "")
    .toLowerCase();
  return host || null;
}

/** Monta a base da API do WL a partir do domínio (host). */
export function wlApiBaseUrl(domain: string): string {
  return `https://${normalizeWlDomain(domain)}${WL_API_PATH}`;
}
