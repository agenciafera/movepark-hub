// Edge Function: /chat — Assistente web (bolinha) do Hub (E3.3). Ver docs/specs/chatbot.md.
// LLM: Google Gemini (function-calling). Stateless: o cliente manda o histórico a cada turno.
// Tools de LEITURA (anon) reusam Edge search/get-faq + RPC simulate_price + selects de catálogo;
// tools TRANSACIONAIS repassam o JWT do usuário às Edges create-booking/cancel-booking.
// Deploy com --no-verify-jwt (auth própria/opcional). Sem persistência de conversa nesta v1.
//
// GET  /functions/v1/chat            → { enabled, model }            (config pública da bolinha)
// POST /functions/v1/chat            → { reply, used_tools }         (Authorization: Bearer <JWT> opcional)
//   body: { messages: [{ role: "user"|"model", text }] }

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  DEFAULT_MODEL,
  DEFAULT_SYSTEM_PROMPT,
  extractFunctionCalls,
  extractText,
  functionResponseContent,
  type GeminiContent,
  geminiTools,
  MAX_TOOL_ROUNDS,
  needsLogin,
  parseChatRequest,
  temporalSystemBlock,
  toGeminiHistory,
} from "./agent.logic.ts";
import { callRead } from "../_shared/assistant-tools.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
function env(k: string): string {
  // @ts-expect-error - Deno env
  return Deno.env.get(k) ?? "";
}

function adminClient() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
}
function anonClient(authHeader?: string | null) {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false },
    ...(authHeader ? { global: { headers: { Authorization: authHeader } } } : {}),
  });
}

// deno-lint-ignore no-explicit-any
async function readSetting(admin: any, key: string): Promise<string | null> {
  const { data } = await admin.from("app_setting").select("value").eq("key", key).maybeSingle();
  return (data?.value as string | undefined) ?? null;
}

// Tools de leitura: handler único em _shared/assistant-tools.ts, o mesmo do MCP
// consumidor. Importado como `callRead` no topo deste arquivo.

// ── Tools transacionais (JWT do usuário) ──
async function callTransactional(
  authHeader: string,
  name: string,
  a: Record<string, unknown>,
): Promise<unknown> {
  const invokeEdge = async (fn: string, body: Record<string, unknown>) => {
    const res = await fetch(`${env("SUPABASE_URL")}/functions/v1/${fn}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: env("SUPABASE_ANON_KEY"), Authorization: authHeader },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { error?: string }).error ?? `Falha (${res.status})`);
    return data;
  };
  switch (name) {
    case "create_booking":
      return await invokeEdge("create-booking", {
        location_parking_type_id: a.location_parking_type_id,
        check_in_at: a.check_in_at,
        check_out_at: a.check_out_at,
        vehicle_id: a.vehicle_id ?? null,
        coupon_code: a.coupon_code ?? null,
      });
    case "cancel_booking":
      return await invokeEdge("cancel-booking", { booking_code: a.booking_code, reason: a.reason ?? null });
    case "list_my_bookings": {
      const sb = anonClient(authHeader);
      const { data, error } = await sb
        .from("booking")
        .select("code, status, check_in_at, check_out_at, total_amount, currency")
        .is("deleted_at", null)
        .order("check_in_at", { ascending: false })
        .limit(Number(a.limit ?? 10));
      if (error) throw new Error(error.message);
      return data;
    }
    case "get_booking": {
      const sb = anonClient(authHeader);
      const { data, error } = await sb
        .from("booking")
        .select("code, status, check_in_at, check_out_at, total_amount, currency, location:location_id(name, slug)")
        .eq("code", a.booking_code as string)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ?? { error: "Reserva não encontrada." };
    }
    default:
      throw new Error(`Tool transacional desconhecida: ${name}`);
  }
}

interface GeminiResp {
  candidates?: Array<{ content?: GeminiContent }>;
  error?: { message?: string };
}

async function callGemini(apiKey: string, model: string, systemPrompt: string, contents: GeminiContent[]): Promise<GeminiContent | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      tools: geminiTools(),
      toolConfig: { function_calling_config: { mode: "auto" } },
    }),
  });
  const data = (await res.json().catch(() => ({}))) as GeminiResp;
  if (!res.ok) throw new Error(data.error?.message ?? `Gemini HTTP ${res.status}`);
  return data.candidates?.[0]?.content ?? null;
}

// @ts-expect-error - Deno global
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const admin = adminClient();
  const enabled = (await readSetting(admin, "chatbot_enabled")) !== "false";
  const model = (await readSetting(admin, "chatbot_model")) || DEFAULT_MODEL;

  if (req.method === "GET") return json({ enabled, model });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!enabled) return json({ error: "Assistente desativado." }, 503);

  const apiKey = env("GEMINI_API_KEY");
  if (!apiKey) return json({ error: "GEMINI_API_KEY não configurada." }, 500);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido." }, 400);
  }
  const parsed = parseChatRequest(body);
  if (!parsed.ok) return json({ error: parsed.error }, 422);

  // Auth opcional: presença de Bearer = logado (as Edges transacionais revalidam o JWT).
  const authHeader = req.headers.get("Authorization");
  const isLoggedIn = !!authHeader && authHeader.startsWith("Bearer ");
  const systemPrompt =
    ((await readSetting(admin, "chatbot_system_prompt")) || DEFAULT_SYSTEM_PROMPT) + temporalSystemBlock(new Date());

  const contents: GeminiContent[] = toGeminiHistory(parsed.value.messages);
  const usedTools: string[] = [];

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const content = await callGemini(apiKey, model, systemPrompt, contents);
      const calls = extractFunctionCalls(content);
      if (calls.length === 0) {
        return json({ reply: extractText(content) || "Desculpe, não consegui responder agora.", used_tools: usedTools });
      }
      // anexa o turno do modelo (com os functionCall) e executa cada tool
      contents.push(content as GeminiContent);
      const sbRead = anonClient();
      const results: Array<{ name: string; response: Record<string, unknown> }> = [];
      for (const call of calls) {
        usedTools.push(call.name);
        try {
          if (needsLogin(call.name, isLoggedIn)) {
            results.push({ name: call.name, response: { error: "login_required", message: "Peça ao usuário para entrar em /entrar antes de reservar ou cancelar." } });
            continue;
          }
          const out =
            call.name === "create_booking" || call.name === "cancel_booking" || call.name === "list_my_bookings" || call.name === "get_booking"
              ? await callTransactional(authHeader as string, call.name, call.args ?? {})
              : await callRead(sbRead, call.name, call.args ?? {});
          results.push({ name: call.name, response: { result: out } });
        } catch (e) {
          results.push({ name: call.name, response: { error: (e as Error).message } });
        }
      }
      contents.push(functionResponseContent(results));
    }
    // estourou o teto de rodadas
    return json({ reply: "Não consegui concluir agora — pode reformular?", used_tools: usedTools }, 200);
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }
});
