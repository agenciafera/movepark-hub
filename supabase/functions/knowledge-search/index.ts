// Edge Function: /knowledge-search
// Busca semântica na base de conhecimento (E3.3, RAG). Embeda a pergunta (Gemini gemini-embedding-001,
// RETRIEVAL_QUERY, 768d) e chama a RPC match_knowledge, que filtra por escopo (ADR-002). A
// GEMINI_API_KEY vive só aqui; a tabela knowledge_chunk nunca é lida direto pelo anon (a RPC é
// security definer). verify_jwt = false (leitura pública, como get-faq). Ver docs/specs/knowledge-base.md.
//
// POST /functions/v1/knowledge-search
//   body: { query, location_id?, destination_id?, k? }
// → { chunks: [{ source_type, source_id, content, scope, similarity, ... }], count }

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EMBED_MODEL = "gemini-embedding-001";
const EMBED_DIM = 768;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "public, max-age=30" },
  });
}
function env(k: string): string {
  // @ts-expect-error - Deno env
  return Deno.env.get(k) ?? "";
}

async function embedQuery(apiKey: string, text: string): Promise<string> {
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

// @ts-expect-error - Deno global
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const apiKey = env("GEMINI_API_KEY");
  if (!apiKey) return json({ error: "GEMINI_API_KEY não configurada." }, 500);

  let body: { query?: string; location_id?: string | null; destination_id?: string | null; k?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido." }, 400);
  }
  const query = (body.query ?? "").trim();
  if (!query) return json({ error: "query é obrigatória." }, 422);

  const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), { auth: { persistSession: false } });

  try {
    const emb = await embedQuery(apiKey, query);
    const { data, error } = await sb.rpc("match_knowledge", {
      p_query_embedding: emb,
      p_location_id: body.location_id ?? null,
      p_destination_id: body.destination_id ?? null,
      p_k: body.k ?? 6,
    });
    if (error) throw new Error(error.message);
    return json({ chunks: data ?? [], count: (data ?? []).length });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});
