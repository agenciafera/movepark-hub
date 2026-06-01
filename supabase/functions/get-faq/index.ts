// Edge Function: /get-faq
// Retorna FAQ pública combinando perguntas globais + da location (quando informada).
// Usada pelo listing detail no consumer e pela tool `get_faq` do MCP n8n.
//
// POST /functions/v1/get-faq
// {
//   "location_id": "uuid"?,
//   "category_slug": "reservas"?,
//   "query": "cancelar"?,
//   "limit": 50?
// }
//
// Resposta:
// {
//   "items": [
//     { id, scope, location_id, question, answer, sort_order,
//       category: { slug, label, sort_order } | null }
//   ],
//   "count": number
// }

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Body = {
  location_id?: string;
  category_slug?: string;
  query?: string;
  limit?: number;
};

type FaqRow = {
  id: string;
  scope: "global" | "location";
  location_id: string | null;
  question: string;
  answer: string;
  sort_order: number;
  category: { slug: string; label: string; sort_order: number } | null;
};

function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "content-type": "application/json",
      ...extraHeaders,
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST")
    return jsonResponse({ error: { message: "Method not allowed" } }, 405);

  // @ts-expect-error - Deno global
  const url = Deno.env.get("SUPABASE_URL");
  // @ts-expect-error - Deno global
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey)
    return jsonResponse({ error: { message: "Server not configured" } }, 500);

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    // payload vazio é OK — devolve só globais
  }

  const supa = createClient(url, anonKey, {
    auth: { persistSession: false },
  });

  const limit = Math.min(Math.max(body.limit ?? 100, 1), 200);

  let q = supa
    .from("faq")
    .select(
      "id, scope, location_id, question, answer, sort_order, category:faq_category(slug, label, sort_order)",
    )
    .eq("is_published", true)
    .is("deleted_at", null);

  // Escopo: globais sempre; location-specific só se location_id passado
  if (body.location_id) {
    q = q.or(`scope.eq.global,location_id.eq.${body.location_id}`);
  } else {
    q = q.eq("scope", "global");
  }

  if (body.category_slug) {
    // Filtra via JOIN: postgrest aceita foreignTable filter
    q = q.eq("faq_category.slug", body.category_slug);
  }

  if (body.query && body.query.trim().length >= 2) {
    const escaped = body.query.trim().replace(/[%_]/g, (m) => `\\${m}`);
    q = q.ilike("question", `%${escaped}%`);
  }

  const { data, error } = await q.limit(limit);
  if (error) {
    return jsonResponse({ error: { message: error.message } }, 500);
  }

  const rows = (data ?? []) as FaqRow[];
  // Se filtrou por category, postgrest devolve rows com category=null quando não bate.
  // Eliminamos esses.
  const filtered = body.category_slug
    ? rows.filter((r) => r.category && r.category.slug === body.category_slug)
    : rows;

  // Ordenação custom: location antes de global, depois category.sort_order, depois faq.sort_order
  filtered.sort((a, b) => {
    if (a.scope !== b.scope) return a.scope === "location" ? -1 : 1;
    const ca = a.category?.sort_order ?? 999;
    const cb = b.category?.sort_order ?? 999;
    if (ca !== cb) return ca - cb;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });

  return jsonResponse(
    { items: filtered, count: filtered.length },
    200,
    { "Cache-Control": "public, max-age=60, s-maxage=60" },
  );
});
