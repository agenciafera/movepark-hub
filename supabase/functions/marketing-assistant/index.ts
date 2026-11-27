// Edge Function: /marketing-assistant
//
// Ponte da página Assistente de IA da Automação com o agente movepark-marketing, no beast-bots.
// Ver docs/specs/assistente-marketing.md.
//
// POST /functions/v1/marketing-assistant   (JWT do hub_admin)
//   { acao: "conversar", conversa_id, mensagem }  → stream UI do AI SDK, repassado do beast-bots
//   { acao: "conversas" }                          → { conversas: [{ id, titulo, atualizada_em }] }
//   { acao: "abrir", conversa_id }                 → { mensagens, propostas }
//   { acao: "renomear", conversa_id, titulo }      → { ok }
//   { acao: "apagar", conversa_id }                → { ok }
//   { acao: "confirmar", proposta_id }             → { proposta }
//   { acao: "descartar", proposta_id }             → { proposta }
//   { acao: "oportunidades", location_ids? }       → { data, oportunidades } (direto do Hub, sem o modelo)
//
// ## Esta Edge é a fronteira de confiança
//
// O beast-bots confia em quem tem o token de serviço, então tudo que decide acesso acontece aqui:
// sessão, papel hub_admin, chave ligada e teto de uso. O beast-bots NUNCA recebe o JWT: recebe um
// token mpm_ que vale só na superfície /marketing do MCP, só para este admin e esta conversa, e
// que é encerrado quando o stream termina (30 minutos é o teto, não o uso).
//
// ## O agente propõe, o admin executa
//
// Executar campanha e mudar a chave geral viram proposta em marketing_assistant_action. Quem
// executa é o "confirmar", no clique, com os argumentos GRAVADOS na proposta e o admin como ator.

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { alertarDisparoLigado } from "../_shared/marketing/alerta.ts";
import { callMarketing } from "../_shared/marketing/handlers.ts";
import type { Actor } from "../_shared/marketing/run.ts";
import {
  acaoRecente,
  decidirConfirmacao,
  dentroDoLimite,
  lerConfig,
  lerCorpo,
  memoriaDe,
  novoToken,
  pedidoDeConversa,
  type PropostaGravada,
  repassarStream,
  resumoDoResultado,
  TOKEN_MINUTOS,
} from "./logic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "x-vercel-ai-ui-message-stream",
};

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// @ts-expect-error - Deno global
const env = (k: string) => Deno.env.get(k) ?? "";

// deno-lint-ignore no-explicit-any
type Sb = any;

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const COLUNAS = "id, profile_id, conversa_id, tool, args, resumo, status, resultado, erro, expires_at, created_at, decided_at";

function mensagemDe(e: unknown): string {
  return e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e);
}

async function decidir(admin: Sb, userId: string, email: string, acao: "confirmar" | "descartar", id: string) {
  const { data: p } = await admin.from("marketing_assistant_action").select(COLUNAS).eq("id", id).maybeSingle();
  const agora = new Date().toISOString();

  if (acao === "descartar") {
    if (!p || p.profile_id !== userId) return json({ error: "Proposta não encontrada." }, 404);
    const { data } = await admin.from("marketing_assistant_action")
      .update({ status: "dismissed", decided_at: agora })
      .eq("id", p.id).eq("status", "proposed").select(COLUNAS).maybeSingle();
    return json({ proposta: data ?? p });
  }

  const d = decidirConfirmacao(p as PropostaGravada | null, userId, new Date());
  if (d.tipo === "recusar") return json({ error: d.erro }, d.status);
  if (d.tipo === "estado") return json({ proposta: p });

  // A troca proposed → executing é o cadeado: só um clique passa.
  const { data: travada } = await admin.from("marketing_assistant_action")
    .update({ status: "executing" }).eq("id", p.id).eq("status", "proposed").select(COLUNAS).maybeSingle();
  if (!travada) {
    const { data: atual } = await admin.from("marketing_assistant_action").select(COLUNAS).eq("id", p.id).maybeSingle();
    return json({ proposta: atual });
  }

  const ator: Actor = { kind: "hub_admin", id: userId, label: email };
  try {
    const dados = await callMarketing(admin, ator, travada.tool, travada.args ?? {}, {
      alertarDisparoLigado: (info) => alertarDisparoLigado(admin, info),
    });
    const { data: feita } = await admin.from("marketing_assistant_action")
      .update({
        status: "executed",
        resultado: { dados, resumo: resumoDoResultado(travada.tool, dados) },
        decided_at: new Date().toISOString(),
      })
      .eq("id", travada.id).select(COLUNAS).single();
    return json({ proposta: feita });
  } catch (e) {
    const { data: falhou } = await admin.from("marketing_assistant_action")
      .update({ status: "failed", erro: mensagemDe(e).slice(0, 500), decided_at: new Date().toISOString() })
      .eq("id", travada.id).select(COLUNAS).single();
    return json({ proposta: falhou });
  }
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return json({ error: "Faltou o token de sessão." }, 401);

  const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const { data: u, error: erroAuth } = await admin.auth.getUser(jwt);
  if (erroAuth || !u?.user) return json({ error: "Sessão inválida." }, 401);
  const userId = u.user.id as string;
  const email = (u.user.email as string | undefined) ?? "hub_admin";
  const { data: perfil } = await admin.from("profiles").select("role, full_name").eq("id", userId).maybeSingle();
  if (perfil?.role !== "hub_admin") return json({ error: "forbidden" }, 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Corpo inválido." }, 400);
  }
  const lido = lerCorpo(body);
  if (!lido.ok) return json({ error: lido.erro }, 400);
  const corpo = lido.corpo;

  if (corpo.acao === "confirmar" || corpo.acao === "descartar") {
    return decidir(admin, userId, email, corpo.acao, corpo.propostaId);
  }

  // A abertura da conversa: as oportunidades vêm do Hub direto, sem passar pelo modelo.
  if (corpo.acao === "oportunidades") {
    const ator: Actor = { kind: "hub_admin", id: userId, label: email };
    try {
      const dados = await callMarketing(admin, ator, "marketing_get_opportunities",
        { location_ids: corpo.locationIds ?? undefined },
        { alertarDisparoLigado: (info) => alertarDisparoLigado(admin, info) });
      return json(dados);
    } catch (e) {
      console.error(`[marketing-assistant] oportunidades: ${mensagemDe(e)}`);
      return json({ error: "Não consegui ler as oportunidades agora." }, 502);
    }
  }

  const base = env("MASTRA_BASE_URL").replace(/\/+$/, "");
  const tokenServico = env("MASTRA_MARKETING_TOKEN");
  if (!base || !tokenServico) {
    return json({ error: "Assistente não configurado: faltam MASTRA_BASE_URL ou MASTRA_MARKETING_TOKEN." }, 503);
  }
  const servico = { Authorization: `Bearer ${tokenServico}`, "Content-Type": "application/json" };

  // ── Conversas ─────────────────────────────────────────────────────────────
  if (corpo.acao !== "conversar") {
    const r = await fetch(`${base}/marketing/conversas`, {
      method: "POST",
      headers: servico,
      body: JSON.stringify(pedidoDeConversa(userId, corpo)),
      signal: AbortSignal.timeout(20_000),
    }).catch(() => null);
    if (!r) return json({ error: "O assistente não respondeu. Tente de novo." }, 504);
    const dados = (await r.json().catch(() => ({}))) as { conversas?: unknown[]; mensagens?: unknown[] };
    if (r.status === 404) return json({ error: "Conversa não encontrada." }, 404);
    if (!r.ok) {
      console.error(`[marketing-assistant] conversas ${r.status}`);
      return json({ error: "O assistente está com problema agora. Tente de novo em instantes." }, 502);
    }
    if (corpo.acao === "conversas") return json({ conversas: dados.conversas ?? [] });
    if (corpo.acao === "abrir") {
      const { data: propostas } = await admin.from("marketing_assistant_action").select(COLUNAS)
        .eq("profile_id", userId).eq("conversa_id", corpo.conversaId).order("created_at");
      return json({ mensagens: dados.mensagens ?? [], propostas: propostas ?? [] });
    }
    if (corpo.acao === "apagar") {
      await admin.from("marketing_assistant_action")
        .update({ status: "dismissed", decided_at: new Date().toISOString() })
        .eq("profile_id", userId).eq("conversa_id", corpo.conversaId).eq("status", "proposed");
    }
    return json({ ok: true });
  }

  // ── Conversar ─────────────────────────────────────────────────────────────
  const { data: cfgRow } = await admin.from("app_setting").select("value").eq("key", "marketing_assistant").maybeSingle();
  const umaHora = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await admin.from("marketing_assist_session").select("id", { count: "exact", head: true })
    .eq("profile_id", userId).gte("created_at", umaHora);
  const limite = dentroDoLimite(lerConfig(cfgRow?.value), count ?? 0);
  if (limite) return json({ error: limite }, 429);

  // Os tokens antigos desta pessoa saem aqui, para a tabela não acumular.
  await admin.from("marketing_assist_session").delete().eq("profile_id", userId)
    .lt("created_at", new Date(Date.now() - 86_400_000).toISOString());
  const token = novoToken(crypto.getRandomValues(new Uint8Array(24)));
  const { data: sessao, error: erroSessao } = await admin.from("marketing_assist_session").insert({
    token_hash: await sha256Hex(token),
    profile_id: userId,
    conversa_id: corpo.conversaId,
    expires_at: new Date(Date.now() + TOKEN_MINUTOS * 60_000).toISOString(),
  }).select("id").single();
  if (erroSessao) return json({ error: "Não consegui abrir a sessão do assistente." }, 500);
  const encerrar = () =>
    admin.from("marketing_assist_session").update({ ended_at: new Date().toISOString() }).eq("id", sessao.id);

  const { data: recentes } = await admin.from("marketing_assistant_action").select("id, tool, status, resultado, erro")
    .eq("profile_id", userId).eq("conversa_id", corpo.conversaId)
    .in("status", ["executed", "failed", "dismissed"])
    .gte("decided_at", new Date(Date.now() - 30 * 60_000).toISOString())
    .order("decided_at", { ascending: false }).limit(5);

  let resposta: Response;
  try {
    resposta = await fetch(`${base}/marketing/chat`, {
      method: "POST",
      headers: servico,
      body: JSON.stringify({
        message: corpo.mensagem,
        requestContext: {
          "movepark.marketing.assistToken": token,
          "movepark.marketing.userName": perfil?.full_name || email,
          "movepark.marketing.now": new Date().toISOString(),
          "movepark.marketing.recentActions": (recentes ?? []).map(acaoRecente),
        },
        memory: memoriaDe(userId, corpo.conversaId),
      }),
      signal: AbortSignal.timeout(140_000),
    });
  } catch {
    await encerrar();
    return json({ error: "O assistente não respondeu a tempo. Tente de novo." }, 504);
  }
  if (!resposta.ok || !resposta.body) {
    await encerrar();
    console.error(`[marketing-assistant] chat ${resposta.status}`);
    return json({ error: "O assistente está com problema agora. Tente de novo em instantes." }, 502);
  }

  return new Response(repassarStream(resposta.body, encerrar), {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "x-vercel-ai-ui-message-stream": "v1",
    },
  });
}

// @ts-expect-error - Deno global
if (import.meta.main) Deno.serve(handler);
