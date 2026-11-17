// Lógica pura do worker de embeddings (E3.3) — testável sem rede.

/** Segundos até a próxima tentativa (backoff exponencial a partir de 2min, teto 4h). Molde wps-deliver. */
export function nextBackoff(attempts: number): number {
  const base = 120 * Math.pow(2, Math.max(0, attempts - 1));
  return Math.min(base, 4 * 3600);
}

/** sha256 hex do conteúdo — idempotência de reembedding (pula chunk cujo hash não mudou). */
export async function hashContent(content: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Onde os trechos de cada fonte moram. A base do operador vai para uma tabela própria: a busca
 * pública (`match_knowledge`) lê só a `knowledge_chunk`, então artigo interno no chat do site é
 * impossível por ausência, e não por um filtro que alguém pode esquecer. Ver
 * docs/specs/assistente-do-operador.md.
 */
export function tabelaDosTrechos(sourceType: string): "knowledge_chunk" | "operator_knowledge_chunk" {
  return sourceType === "operator_playbook" ? "operator_knowledge_chunk" : "knowledge_chunk";
}
