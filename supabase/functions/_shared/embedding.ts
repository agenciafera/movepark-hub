// Embedding de consulta da base de conhecimento (Gemini gemini-embedding-001, 768d).
//
// Saiu de dentro da Edge knowledge-search quando a base do operador (MCP /operator) passou a
// precisar do mesmo vetor: duas cópias seriam duas chances de uma mudar a dimensão e a outra não,
// e a coluna vector(768) só casa com uma. O lado de DOCUMENTO (RETRIEVAL_DOCUMENT) mora no worker
// knowledge-embed. Ver docs/specs/knowledge-base.md.

export const EMBED_MODEL = "gemini-embedding-001";
export const EMBED_DIM = 768;

/** Vetor da pergunta no formato texto do pgvector ("[a,b,...]"), pronto para a RPC. */
export async function embedQuery(apiKey: string, text: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: `models/${EMBED_MODEL}`,
      content: { parts: [{ text }] },
      taskType: "RETRIEVAL_QUERY",
      outputDimensionality: EMBED_DIM,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message ?? `embed HTTP ${res.status}`);
  const values = data.embedding?.values as number[] | undefined;
  if (!values || values.length !== EMBED_DIM) throw new Error(`embed devolveu ${values?.length ?? 0} dims`);
  return `[${values.join(",")}]`;
}
