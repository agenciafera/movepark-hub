// Edge Function: /operator-assistant
// Ponte da bolinha do /operator com a Mia para operadores (agente `movepark-operador`, no
// beast-bots). Ver docs/specs/assistente-do-operador.md.
//
// POST /functions/v1/operator-assistant
// Authorization: Bearer <JWT do operador>
//   { acao: "enviar", company_id, mensagem, pagina?, booking_code? }
//     → { reply, used_tools, actions: [...], conversation_id }
//   { acao: "historico", company_id }   → { mensagens, actions }
//   { acao: "limpar", company_id }      → { ok, conversation_id }
//   { acao: "confirmar", action_id }    → { status, resumo, pix? }
//   { acao: "descartar", action_id }    → { ok }
//
// ## Liberação por empresa
//
// A Mia só atende empresa liberada (`operator_assistant_company`). A regra é a função
// `operator_assistant_liberado`, chamada aqui sob o JWT da pessoa: a mesma que decide se a bolinha
// aparece. Vale para conversar, ler o histórico e confirmar; descartar uma proposta continua livre.
//
// ## Esta Edge é a fronteira de confiança
//
// O beast-bots não autentica usuário final: ele confia em quem tem o token de serviço. Então tudo
// que decide acesso acontece AQUI: a sessão (JWT), o vínculo com a empresa (ou hub_admin), o teto
// de uso e o contexto do agente, montado campo a campo (o corpo é lista fechada).
//
// O beast-bots NUNCA recebe o JWT. Recebe um token `mpo_` que vale só na superfície /operator do
// MCP, só para esta empresa, e que é apagado no fim do turno (30 minutos é o teto, não o uso).
//
// ## O modelo propõe, o operador executa
//
// O agente só cria propostas (`operator_assistant_action`). Quem executa é o `confirmar`, no
// clique, com o JWT do operador e pelas MESMAS Edges dos botões do painel: estorno, voucher e
// histórico saem idênticos. O escopo da ação é conferido de novo aqui, sob o JWT.

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type AcaoGravada,
  comoExecutar,
  type Corpo,
  dentroDoLimite,
  ESCOPO_DA_ACAO,
  lerConfig,
  lerCorpo,
  memoriaDe,
  novoToken,
  podeConfirmar,
  resumoDoResultado,
} from "./logic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// @ts-expect-error - Deno global
const env = (k: string) => Deno.env.get(k) ?? "";

const TOKEN_MINUTOS = 30;

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function agoraEmSaoPaulo(d: Date): string {
  // "2026-11-17T10:00:00-03:00": o agente resolve "amanhã" e "sexta" a partir disto.
  const p = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).format(d).replace(" ", "T");
  return `${p}-03:00`;
}

// deno-lint-ignore no-explicit-any
type Sb = any;

/** hub_admin entra em qualquer empresa (impersonação); os demais só nas que têm vínculo. */
async function temAcesso(admin: Sb, userId: string, companyId: string): Promise<boolean> {
  const { data: perfil } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (perfil?.role === "hub_admin") return true;
  const { data: v } = await admin
    .from("profile_company").select("company_id")
    .eq("profile_id", userId).eq("company_id", companyId).maybeSingle();
  return !!v;
}

/** A mesma regra da bolinha: vínculo (ou hub_admin), chave global e empresa na lista. */
async function liberado(comoUsuario: Sb, companyId: string): Promise<boolean> {
  const { data } = await comoUsuario.rpc("operator_assistant_liberado", { p_company_id: companyId });
  return data === true;
}

const NAO_LIBERADA = "A Mia para operadores ainda não foi liberada para esta empresa.";

async function conversaAtual(admin: Sb, userId: string, companyId: string): Promise<string | null> {
  const { data } = await admin
    .from("operator_assistant_message").select("conversation_id")
    .eq("profile_id", userId).eq("company_id", companyId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data?.conversation_id ?? null;
}

const COLUNAS_ACAO = "id, kind, summary, effect_cents, status, expires_at, result, error, created_at, params";

function cartao(a: Record<string, unknown>) {
  const params = (a.params ?? {}) as Record<string, unknown>;
  return {
    id: a.id, kind: a.kind, summary: a.summary, effect_cents: a.effect_cents, status: a.status,
    expires_at: a.expires_at, result: a.result ?? null, error: a.error ?? null,
    booking_code: params.booking_code ?? null,
  };
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return json({ error: "Faltou o token de sessão." }, 401);

  const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const { data: u, error: erroAuth } = await admin.auth.getUser(jwt);
  if (erroAuth || !u?.user) return json({ error: "Sessão inválida." }, 401);
  const userId = u.user.id as string;
  const comoUsuario = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  let bruto: unknown;
  try {
    bruto = await req.json();
  } catch {
    return json({ error: "Corpo inválido." }, 400);
  }
  const { corpo, erro } = lerCorpo(bruto);
  if (!corpo) return json({ error: erro }, 400);

  const { data: cfgRow } = await admin.from("app_setting").select("value").eq("key", "operator_assistant").maybeSingle();
  const cfg = lerConfig(cfgRow?.value);
  if (!cfg.enabled) return json({ error: "A Mia para operadores está desligada." }, 503);

  // ── Confirmar / descartar ─────────────────────────────────────────────────
  if (corpo.acao === "confirmar" || corpo.acao === "descartar") {
    const { data: a } = await admin
      .from("operator_assistant_action").select("id, profile_id, company_id, booking_id, kind, status, expires_at, params")
      .eq("id", corpo.actionId).maybeSingle();
    const recusa = podeConfirmar(a as AcaoGravada | null, userId, new Date());

    if (corpo.acao === "descartar") {
      if (a && a.profile_id === userId && a.status === "proposed") {
        await admin.from("operator_assistant_action")
          .update({ status: "dismissed", decided_at: new Date().toISOString() })
          .eq("id", a.id).eq("status", "proposed");
      }
      return json({ ok: true });
    }
    if (recusa) {
      if (a && a.status === "proposed" && new Date(a.expires_at) <= new Date()) {
        await admin.from("operator_assistant_action").update({ status: "expired" }).eq("id", a.id).eq("status", "proposed");
      }
      return json({ error: recusa }, 409);
    }
    if (!a) return json({ error: "Proposta não encontrada." }, 404);

    // O vínculo e o escopo são conferidos de novo, sob o JWT: a proposta pode ter nascido antes
    // de o papel da pessoa mudar.
    if (!(await temAcesso(admin, userId, a.company_id))) return json({ error: "Sem acesso a esta empresa." }, 403);
    if (!(await liberado(comoUsuario, a.company_id))) return json({ error: NAO_LIBERADA }, 403);
    const escopo = ESCOPO_DA_ACAO[a.kind];
    const { data: pode } = await comoUsuario.rpc("member_has_scope", { p_company_id: a.company_id, p_scope: escopo });
    if (pode !== true) return json({ error: "O seu papel nesta empresa não permite esta ação." }, 403);

    // Trava contra clique duplo: só um pedido passa de proposed para executing.
    const { data: travada } = await admin
      .from("operator_assistant_action")
      .update({ status: "executing", decided_at: new Date().toISOString() })
      .eq("id", a.id).eq("status", "proposed").select("id").maybeSingle();
    if (!travada) return json({ error: "Esta ação já está sendo feita." }, 409);

    const { data: reserva } = await admin.from("booking").select("status").eq("id", a.booking_id).maybeSingle();
    const exec = comoExecutar(a.kind, a.params ?? {}, reserva?.status ?? "");
    let ok = false;
    let resultado: Record<string, unknown> = {};
    let falha: string | null = null;

    try {
      if (!exec) throw new Error("Ação desconhecida.");
      if (exec.tipo === "edge") {
        const r = await fetch(`${env("SUPABASE_URL")}/functions/v1/${exec.funcao}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${jwt}`, apikey: env("SUPABASE_ANON_KEY"), "Content-Type": "application/json" },
          body: JSON.stringify(exec.corpo),
          signal: AbortSignal.timeout(60_000),
        });
        resultado = await r.json().catch(() => ({}));
        ok = r.ok;
        if (!ok) falha = String(resultado.error ?? `Falhou (${r.status}).`);
      } else {
        // Check-in e check-out: a mesma escrita do painel do balcão, com o JWT da pessoa. Vai pela
        // RPC `operator_set_booking_status` (que confere bookings:write/bookings:checkin), porque o
        // UPDATE direto não acha a linha de quem não tem finance:read (a policy de SELECT de
        // `booking` só a libera com o escopo financeiro) e voltaria "feito" sem ter feito nada.
        const agora = new Date().toISOString();
        const { error } = await comoUsuario.rpc("operator_set_booking_status", {
          p_booking_id: a.booking_id,
          p_status: exec.status,
          p_checked_in_at: exec.campo === "checked_in_at" ? agora : null,
          p_checked_out_at: exec.campo === "checked_out_at" ? agora : null,
        });
        ok = !error;
        if (error) falha = error.message;
      }
    } catch (e) {
      falha = e instanceof Error ? e.message : String(e);
    }

    const resumo = ok ? resumoDoResultado(a.kind, resultado) : `Não foi feito: ${falha}`;
    // Do PIX da diferença, só o que o operador precisa para mandar ao cliente.
    const pix = ok && resultado.mode === "charge"
      ? { copia_e_cola: resultado.qr_code ?? null, vence_em: resultado.expires_at ?? null }
      : null;
    await admin.from("operator_assistant_action").update({
      status: ok ? "executed" : "failed",
      result: { resumo, ...(pix ? { pix } : {}) },
      error: ok ? null : falha,
    }).eq("id", a.id);

    const conversa = await conversaAtual(admin, userId, a.company_id);
    if (conversa) {
      await admin.from("operator_assistant_message").insert({
        company_id: a.company_id, profile_id: userId, conversation_id: conversa, role: "system",
        content: `${ok ? "Ação confirmada" : "Ação falhou"}: ${resumo}`, action_ids: [a.id],
      });
    }
    return json({ status: ok ? "executed" : "failed", resumo, pix }, ok ? 200 : 502);
  }

  // ── Daqui em diante a empresa vem do corpo e é conferida ──────────────────
  const comEmpresa = corpo as Exclude<Corpo, { acao: "confirmar" | "descartar" }>;
  const companyId = comEmpresa.companyId;
  if (!(await temAcesso(admin, userId, companyId))) return json({ error: "Sem acesso a esta empresa." }, 403);
  if (!(await liberado(comoUsuario, companyId))) return json({ error: NAO_LIBERADA }, 403);

  if (comEmpresa.acao === "limpar") {
    const nova = crypto.randomUUID();
    await admin.from("operator_assistant_action")
      .update({ status: "expired", decided_at: new Date().toISOString() })
      .eq("profile_id", userId).eq("company_id", companyId).eq("status", "proposed");
    await admin.from("operator_assistant_message").insert({
      company_id: companyId, profile_id: userId, conversation_id: nova, role: "system", content: "Nova conversa",
    });
    return json({ ok: true, conversation_id: nova });
  }

  if (comEmpresa.acao === "historico") {
    const conversa = await conversaAtual(admin, userId, companyId);
    if (!conversa) return json({ mensagens: [], actions: [] });
    const { data: msgs } = await admin
      .from("operator_assistant_message").select("role, content, action_ids, created_at")
      .eq("profile_id", userId).eq("company_id", companyId).eq("conversation_id", conversa)
      .neq("content", "Nova conversa")
      .order("created_at", { ascending: true }).limit(80);
    const ids = [...new Set((msgs ?? []).flatMap((m: { action_ids: string[] }) => m.action_ids ?? []))];
    const { data: acoes } = ids.length
      ? await admin.from("operator_assistant_action").select(COLUNAS_ACAO).in("id", ids)
      : { data: [] };
    return json({
      mensagens: (msgs ?? []).map((m: Record<string, unknown>) => ({
        role: m.role, text: m.content, action_ids: m.action_ids ?? [], created_at: m.created_at,
      })),
      actions: (acoes ?? []).map(cartao),
    });
  }

  // ── Enviar ────────────────────────────────────────────────────────────────
  const pedido = comEmpresa as Extract<Corpo, { acao: "enviar" }>;
  const base = env("MASTRA_BASE_URL").replace(/\/+$/, "");
  const tokenServico = env("MASTRA_OPERATOR_TOKEN");
  if (!base || !tokenServico) {
    return json({ error: "Mia para operadores não configurada: faltam MASTRA_BASE_URL ou MASTRA_OPERATOR_TOKEN." }, 503);
  }

  const umaHora = new Date(Date.now() - 3600_000).toISOString();
  const umDia = new Date(Date.now() - 24 * 3600_000).toISOString();
  const [{ count: naHora }, { count: noDia }] = await Promise.all([
    admin.from("operator_assistant_message").select("id", { count: "exact", head: true })
      .eq("profile_id", userId).eq("role", "user").gte("created_at", umaHora),
    admin.from("operator_assistant_message").select("id", { count: "exact", head: true })
      .eq("company_id", companyId).eq("role", "user").gte("created_at", umDia),
  ]);
  const limite = dentroDoLimite(cfg, naHora ?? 0, noDia ?? 0);
  if (limite) return json({ error: limite }, 429);

  const conversa = (await conversaAtual(admin, userId, companyId)) ?? crypto.randomUUID();
  const inicioDoTurno = new Date();

  await admin.from("operator_assistant_message").insert({
    company_id: companyId, profile_id: userId, conversation_id: conversa, role: "user",
    content: pedido.mensagem, page: pedido.pagina, booking_code: pedido.bookingCode,
  });

  // Token do turno. Os vencidos desta pessoa saem junto, para a tabela não acumular.
  await admin.from("operator_assist_session").delete().eq("profile_id", userId).lt("expires_at", new Date().toISOString());
  const token = novoToken(crypto.getRandomValues(new Uint8Array(24)));
  const tokenHash = await sha256Hex(token);
  const { data: sessao, error: erroSessao } = await admin.from("operator_assist_session").insert({
    token_hash: tokenHash, profile_id: userId, company_id: companyId,
    expires_at: new Date(Date.now() + TOKEN_MINUTOS * 60_000).toISOString(),
  }).select("id").single();
  if (erroSessao) return json({ error: "Não consegui abrir a sessão do assistente." }, 500);

  try {
    // Quem é a pessoa, pela mesma função que o MCP usa: uma regra de papel e escopo só.
    const { data: quem } = await admin.rpc("operator_assist_resolve", { p_token_hash: tokenHash });
    if (!quem?.ok) return json({ error: "Sem acesso a esta empresa." }, 403);

    const { data: recentes } = await admin
      .from("operator_assistant_action").select("kind, status, result, error, params")
      .eq("profile_id", userId).eq("company_id", companyId)
      .in("status", ["executed", "failed", "dismissed"])
      .gte("decided_at", new Date(Date.now() - 30 * 60_000).toISOString())
      .order("decided_at", { ascending: false }).limit(5);

    const memory = memoriaDe(userId, companyId, conversa);
    let resposta: Response;
    try {
      resposta = await fetch(`${base}/operador/chat`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tokenServico}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: pedido.mensagem }],
          requestContext: {
            "movepark.operator.assistToken": token,
            "movepark.operator.companyId": companyId,
            "movepark.operator.companyName": quem.company_name ?? null,
            "movepark.operator.userName": quem.user_name ?? null,
            "movepark.operator.role": quem.role ?? null,
            "movepark.operator.scopes": quem.scopes ?? [],
            "movepark.operator.page": pedido.pagina,
            "movepark.operator.bookingCode": pedido.bookingCode,
            "movepark.operator.now": agoraEmSaoPaulo(new Date()),
            "movepark.operator.recentActions": (recentes ?? []).map((r: Record<string, unknown>) => ({
              kind: r.kind,
              booking_code: (r.params as Record<string, unknown> | null)?.booking_code ?? null,
              status: r.status,
              result: (r.result as Record<string, unknown> | null)?.resumo ?? r.error ?? null,
            })),
          },
          memory,
        }),
        signal: AbortSignal.timeout(110_000),
      });
    } catch (cause) {
      const msg = `A Mia não respondeu: ${cause instanceof Error ? cause.message : String(cause)}`;
      await admin.from("operator_assistant_message").insert({
        company_id: companyId, profile_id: userId, conversation_id: conversa, role: "assistant", content: "", error: msg,
      });
      return json({ error: "A Mia não respondeu a tempo. Tente de novo." }, 504);
    }

    const texto = await resposta.text();
    if (!resposta.ok) {
      console.error(`[operator-assistant] beast-bots ${resposta.status}: ${texto.slice(0, 300)}`);
      await admin.from("operator_assistant_message").insert({
        company_id: companyId, profile_id: userId, conversation_id: conversa, role: "assistant", content: "",
        error: `beast-bots ${resposta.status}`,
      });
      return json({ error: "A Mia está com problema agora. Tente de novo em instantes." }, 502);
    }

    let corpoMia: { reply?: unknown; used_tools?: unknown } = {};
    try {
      corpoMia = JSON.parse(texto);
    } catch {
      corpoMia = {};
    }
    const reply = typeof corpoMia.reply === "string" ? corpoMia.reply : "";
    const usedTools = Array.isArray(corpoMia.used_tools) ? corpoMia.used_tools.filter((t) => typeof t === "string") : [];

    const { data: novas } = await admin
      .from("operator_assistant_action").select(COLUNAS_ACAO)
      .eq("profile_id", userId).eq("company_id", companyId).eq("status", "proposed")
      .gte("created_at", inicioDoTurno.toISOString())
      .order("created_at", { ascending: true });
    const actions = (novas ?? []).map(cartao);

    await admin.from("operator_assistant_message").insert({
      company_id: companyId, profile_id: userId, conversation_id: conversa, role: "assistant",
      content: reply, used_tools: usedTools, action_ids: actions.map((x: { id: unknown }) => x.id),
    });

    return json({ reply, used_tools: usedTools, actions, conversation_id: conversa });
  } finally {
    // O token só serve durante o turno.
    await admin.from("operator_assist_session").delete().eq("id", sessao.id);
  }
}

// @ts-expect-error - Deno global
if (import.meta.main) Deno.serve(handler);
