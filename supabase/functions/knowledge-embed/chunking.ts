// Lógica pura de chunking da base de conhecimento (E3.3) — testável sem rede nem DB.
// Ver docs/specs/knowledge-base.md.

/** Uma FAQ vira 1 chunk: pergunta + resposta juntas (a pergunta é o melhor sinal de recuperação). */
export function chunkFaq(question: string | null, answer: string | null): string[] {
  const q = (question ?? "").trim();
  const a = (answer ?? "").trim();
  if (!q && !a) return [];
  return [`P: ${q}\nR: ${a}`.trim()];
}

const MAX_CHARS = 1800; // ~450 tokens

/**
 * Prosa (directions_text/notice/reservation_policy/amenity) por parágrafo, empacotando até ~450
 * tokens. Parágrafo gigante quebra por tamanho. Texto vazio → zero chunks (o worker apaga os chunks
 * daquela fonte).
 */
export function chunkProse(text: string | null | undefined): string[] {
  const t = (text ?? "").trim();
  if (!t) return [];
  const paras = t.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let buf = "";
  const flush = () => {
    if (buf) {
      chunks.push(buf);
      buf = "";
    }
  };
  for (const p of paras) {
    if (p.length > MAX_CHARS) {
      flush();
      for (let i = 0; i < p.length; i += MAX_CHARS) chunks.push(p.slice(i, i + MAX_CHARS));
      continue;
    }
    if (buf && buf.length + 2 + p.length > MAX_CHARS) flush();
    buf = buf ? `${buf}\n\n${p}` : p;
  }
  flush();
  return chunks;
}

/** Estimativa grosseira de tokens (chars/4), para dimensionar lote e gravar token_estimate. */
export function estimateTokens(text: string): number {
  return Math.ceil((text ?? "").length / 4);
}
