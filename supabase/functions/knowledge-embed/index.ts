// Edge Function: /knowledge-embed
// Worker de embeddings da base de conhecimento (E3.3). Drena knowledge_source_queue, lê a fonte,
// faz chunking, embeda a prosa (Gemini text-embedding-004) e grava em knowledge_chunk. Idempotente
// por content_hash (pula chunk igual). Chamada interna pelo pg_cron (pg_net); o header
// x-knowledge-embed-key e validado contra o Vault por RPC (o segredo nunca vira env desta Edge).
// verify_jwt = false (server-to-server). Ver docs/specs/knowledge-base.md.
//
// POST /functions/v1/knowledge-embed  (header: x-knowledge-embed-key: <segredo do Vault>)
// → { ok, claimed, done, retried, failed }

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chunkFaq, chunkProse, estimateTokens } from "./chunking.ts";
import { hashContent, nextBackoff } from "./logic.ts";

const EMBED_MODEL = "gemini-embedding-001"; // via outputDimensionality=768, casa com vector(768)
const EMBED_DIM = 768;
const PROSE_FIELD: Record<string, string> = {
  location_directions: "directions_text",
  location_notice: "notice",
  location_policy: "reservation_policy",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
function env(k: string): string {
  // @ts-expect-error - Deno env
  return Deno.env.get(k) ?? "";
}

interface Source {
  scope: string;
  location_id: string | null;
  destination_id: string | null;
  chunks: string[];
}

// deno-lint-ignore no-explicit-any
async function loadSource(admin: any, sourceType: string, sourceId: string): Promise<Source | null> {
  if (sourceType === "faq") {
    const { data } = await admin
      .from("faq")
      .select("question, answer, scope, location_id, destination_id, is_published, deleted_at")
      .eq("id", sourceId)
      .maybeSingle();
    if (!data || data.deleted_at || !data.is_published) return null;
    return {
      scope: data.scope,
      location_id: data.location_id,
      destination_id: data.destination_id,
      chunks: chunkFaq(data.question, data.answer),
    };
  }
  const field = PROSE_FIELD[sourceType];
  if (field) {
    const { data } = await admin.from("location").select(`${field}, deleted_at`).eq("id", sourceId).maybeSingle();
    if (!data || data.deleted_at) return null;
    return { scope: "location", location_id: sourceId, destination_id: null, chunks: chunkProse(data[field]) };
  }
  if (sourceType === "location_amenity") {
    const { data } = await admin.from("location_amenity").select("notes").eq("location_id", sourceId);
    // deno-lint-ignore no-explicit-any
    const notes = (data ?? []).map((r: any) => (r.notes ?? "").trim()).filter(Boolean).join("\n\n");
    return { scope: "location", location_id: sourceId, destination_id: null, chunks: chunkProse(notes) };
  }
  return null;
}

// Embeda um texto (RETRIEVAL_DOCUMENT) e devolve o vetor no formato string do pgvector ("[a,b,...]").
// gemini-embedding-001 só tem embedContent síncrono (sem batch), então chamamos um a um; a base é
// pequena e cada fonte tem poucos chunks. outputDimensionality=768 casa com a coluna vector(768).
async function embedOne(apiKey: string, text: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: `models/${EMBED_MODEL}`,
      content: { parts: [{ text }] },
      taskType: "RETRIEVAL_DOCUMENT",
      outputDimensionality: EMBED_DIM,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message ?? `embed HTTP ${res.status}`);
  const values = data.embedding?.values as number[] | undefined;
  if (!values || values.length !== EMBED_DIM) throw new Error(`embed devolveu ${values?.length ?? 0} dims`);
  return `[${values.join(",")}]`;
}

async function embedBatch(apiKey: string, texts: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const t of texts) out.push(await embedOne(apiKey, t));
  return out;
}

// deno-lint-ignore no-explicit-any
async function processItem(admin: any, apiKey: string, item: any): Promise<void> {
  const { source_type, source_id, op } = item;

  if (op === "delete") {
    await admin.from("knowledge_chunk").delete().eq("source_type", source_type).eq("source_id", source_id);
    return;
  }

  const src = await loadSource(admin, source_type, source_id);
  if (!src || src.chunks.length === 0) {
    // fonte sumiu / despublicada / prosa vazia: remove os chunks daquela fonte
    await admin.from("knowledge_chunk").delete().eq("source_type", source_type).eq("source_id", source_id);
    return;
  }

  const hashes = await Promise.all(src.chunks.map(hashContent));

  // reuso por hash: embedding que não mudou não vai de novo à API
  const { data: existing } = await admin
    .from("knowledge_chunk")
    .select("content_hash, embedding")
    .eq("source_type", source_type)
    .eq("source_id", source_id);
  const reuse = new Map<string, string>();
  // deno-lint-ignore no-explicit-any
  for (const e of (existing ?? []) as any[]) if (e.embedding) reuse.set(e.content_hash, e.embedding);

  const toEmbedIdx: number[] = [];
  for (let i = 0; i < src.chunks.length; i++) if (!reuse.has(hashes[i])) toEmbedIdx.push(i);
  const fresh = await embedBatch(apiKey, toEmbedIdx.map((i) => src.chunks[i]));
  const freshByIdx = new Map<number, string>();
  toEmbedIdx.forEach((i, k) => freshByIdx.set(i, fresh[k]));

  const rows = src.chunks.map((content, i) => ({
    source_type,
    source_id,
    chunk_index: i,
    scope: src.scope,
    location_id: src.location_id,
    destination_id: src.destination_id,
    content,
    content_hash: hashes[i],
    token_estimate: estimateTokens(content),
    embedding: reuse.get(hashes[i]) ?? freshByIdx.get(i),
    embedding_stale: false,
  }));

  await admin.from("knowledge_chunk").delete().eq("source_type", source_type).eq("source_id", source_id);
  const { error } = await admin.from("knowledge_chunk").insert(rows);
  if (error) throw new Error(error.message);
}

// @ts-expect-error - Deno global
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const apiKey = env("GEMINI_API_KEY");
  if (!apiKey) return json({ error: "GEMINI_API_KEY não configurada." }, 500);

  const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });

  // Auth server-to-server: a chave interna mora só no Vault (o cron a injeta no header). A validação
  // roda no Postgres (RPC compara com o Vault) — o segredo nunca vira env desta Edge nem trafega aqui.
  const { data: valid } = await admin.rpc("knowledge_embed_key_valid", {
    p_key: req.headers.get("x-knowledge-embed-key") ?? "",
  });
  if (valid !== true) return json({ error: "unauthorized" }, 401);

  const { data: items, error } = await admin.rpc("knowledge_queue_claim", { p_limit: 25 });
  if (error) return json({ error: error.message }, 500);

  let done = 0;
  let retried = 0;
  let failed = 0;

  // deno-lint-ignore no-explicit-any
  for (const item of (items ?? []) as any[]) {
    try {
      await processItem(admin, apiKey, item);
      await admin.from("knowledge_source_queue").delete().eq("id", item.id);
      done++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const attempts = item.attempts ?? 1; // já incrementado pelo claim
      if (attempts >= (item.max_attempts ?? 6)) {
        await admin.from("knowledge_source_queue").update({ status: "failed", last_error: msg }).eq("id", item.id);
        failed++;
      } else {
        const next = new Date(Date.now() + nextBackoff(attempts) * 1000).toISOString();
        await admin
          .from("knowledge_source_queue")
          .update({ status: "pending", next_attempt_at: next, last_error: msg })
          .eq("id", item.id);
        retried++;
      }
    }
  }

  return json({ ok: true, claimed: (items ?? []).length, done, retried, failed });
});
