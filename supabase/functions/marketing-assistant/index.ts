// Edge Function: /marketing-assistant
//
// O assistente de IA da tela de Automação do Manager (docs/specs/assistente-marketing.md).
//
// POST /functions/v1/marketing-assistant   (JWT do hub_admin)
//   Conversa:     { mensagens: [{ papel: "usuario"|"assistente", texto }], pagina?: { caminho, campaign_id?, segment_id? } }
//                 → { resposta, ferramentas: [{ nome, ok }], propostas: [{ tool, args, resumo }], gravou }
//   Confirmação:  { acao: "confirmar", tool: "marketing_run_campaign"|"marketing_set_dispatch_enabled", args }
//                 → o resultado da tool
//
// O laço roda o Gemini sobre as tools de marketing (_shared/marketing) com o admin como ator na
// auditoria. Executar campanha e ligar a chave geral nunca rodam dentro do laço: viram proposta, e
// só o clique em Confirmar executa (logic.ts). Modelo: app_setting.marketing_assistant_model.

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { montarInstrucoes } from "../_shared/marketing/assistant-prompt.ts";
import { alertarDisparoLigado } from "../_shared/marketing/alerta.ts";
import { marketingGeminiDecls } from "../_shared/marketing/gemini.ts";
import { callMarketing } from "../_shared/marketing/handlers.ts";
import type { Actor } from "../_shared/marketing/run.ts";
import {
  type GeminiContent,
  lerConfirmacao,
  lerConversa,
  resumirProposta,
  rodarTurno,
} from "./logic.ts";

const MODELO_PADRAO = "gemini-2.5-pro";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function chamarGemini(
  apiKey: string,
  model: string,
  instrucoes: string,
  contents: GeminiContent[],
): Promise<GeminiContent | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: instrucoes }] },
      contents,
      tools: [{ functionDeclarations: marketingGeminiDecls() }],
      toolConfig: { function_calling_config: { mode: "auto" } },
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    candidates?: Array<{ content?: GeminiContent }>;
    error?: { message?: string };
  };
  if (!res.ok) {
    console.warn("[marketing-assistant] Gemini recusou:", data.error?.message ?? res.status);
    return null;
  }
  return data.candidates?.[0]?.content ?? null;
}

// @ts-expect-error - Deno global
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createClient(
    // @ts-expect-error - Deno env
    Deno.env.get("SUPABASE_URL")!,
    // @ts-expect-error - Deno env
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // ── Gate: só hub_admin ─────────────────────────────────────────────────────
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "unauthorized" }, 401);
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profile?.role !== "hub_admin") return json({ error: "forbidden" }, 403);

  const ator: Actor = {
    kind: "hub_admin",
    id: userData.user.id,
    label: userData.user.email ?? "hub_admin",
  };
  const deps = { alertarDisparoLigado: (info: { actorLabel: string; reason: string }) => alertarDisparoLigado(admin, info) };
  const tool = (nome: string, args: Record<string, unknown>) => callMarketing(admin, ator, nome, args, deps);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "payload inválido" }, 400);
  }

  // ── Confirmação (o clique) ─────────────────────────────────────────────────
  if (body?.acao === "confirmar") {
    const c = lerConfirmacao(body);
    if (!c.ok) return json({ error: c.erro }, 400);
    try {
      return json({ resultado: await tool(c.tool, c.args) });
    } catch (e) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e);
      return json({ error: msg }, 400);
    }
  }

  // ── Conversa ───────────────────────────────────────────────────────────────
  const conversa = lerConversa(body);
  if (!conversa.ok) return json({ error: conversa.erro }, 400);

  // @ts-expect-error - Deno env
  const apiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
  if (!apiKey) return json({ error: "Assistente sem chave do modelo configurada." }, 503);
  const { data: cfg } = await admin
    .from("app_setting")
    .select("value")
    .eq("key", "marketing_assistant_model")
    .maybeSingle();
  const model = String(cfg?.value ?? "").trim() || MODELO_PADRAO;
  const instrucoes = montarInstrucoes(conversa.pagina, new Date());

  const turno = await rodarTurno(conversa.mensagens, {
    gemini: (contents) => chamarGemini(apiKey, model, instrucoes, contents),
    tool,
    resumir: (nome, args) => resumirProposta(nome, args, tool),
  });
  return json(turno);
});
