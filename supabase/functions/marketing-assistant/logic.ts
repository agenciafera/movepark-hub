// Lógica pura da Edge marketing-assistant: a ponte da página Assistente de IA com o agente
// movepark-marketing do beast-bots. Ver docs/specs/assistente-marketing.md § 6.

export const TOKEN_MINUTOS = 30;
const TETO_DA_FALA = 4000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type MensagemDoUsuario = { id: string; role: "user"; parts: Array<{ type: "text"; text: string }> };

// Um membro por ação: o TypeScript não estreita um membro cuja `acao` é união de literais.
export type Corpo =
  | { acao: "conversar"; conversaId: string; mensagem: MensagemDoUsuario }
  | { acao: "conversas" }
  | { acao: "abrir"; conversaId: string }
  | { acao: "apagar"; conversaId: string }
  | { acao: "renomear"; conversaId: string; titulo: string }
  | { acao: "confirmar"; propostaId: string }
  | { acao: "descartar"; propostaId: string };

/** Uma linha só, sem caractere de controle nem separador de linha, com teto. */
function umaLinha(v: unknown, teto: number): string {
  if (typeof v !== "string") return "";
  return v.replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, " ").replace(/\s+/g, " ").trim().slice(0, teto);
}

function lerMensagem(v: unknown): MensagemDoUsuario | null {
  const m = (v ?? {}) as { id?: unknown; role?: unknown; parts?: unknown };
  if (m.role !== "user" || typeof m.id !== "string" || !Array.isArray(m.parts) || m.parts.length === 0) return null;
  const partes = m.parts as Array<{ type?: unknown; text?: unknown }>;
  if (!partes.every((p) => p?.type === "text" && typeof p.text === "string")) return null;
  const texto = partes.map((p) => p.text as string).join("");
  if (!texto.trim() || texto.length > TETO_DA_FALA) return null;
  return { id: m.id.slice(0, 64), role: "user", parts: partes.map((p) => ({ type: "text" as const, text: p.text as string })) };
}

export function lerCorpo(body: unknown): { ok: true; corpo: Corpo } | { ok: false; erro: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const conversa = typeof b.conversa_id === "string" && UUID.test(b.conversa_id) ? b.conversa_id : null;
  const proposta = typeof b.proposta_id === "string" && UUID.test(b.proposta_id) ? b.proposta_id : null;
  switch (b.acao) {
    case "conversas":
      return { ok: true, corpo: { acao: "conversas" } };
    case "conversar": {
      const mensagem = lerMensagem(b.mensagem);
      if (!conversa || !mensagem) return { ok: false, erro: "Mande a conversa e uma fala de até 4000 caracteres." };
      return { ok: true, corpo: { acao: "conversar", conversaId: conversa, mensagem } };
    }
    case "abrir":
    case "apagar":
      if (!conversa) return { ok: false, erro: "Falta a conversa." };
      return { ok: true, corpo: { acao: b.acao, conversaId: conversa } };
    case "renomear": {
      const titulo = umaLinha(b.titulo, 80);
      if (!conversa || !titulo) return { ok: false, erro: "O título precisa de 1 a 80 caracteres." };
      return { ok: true, corpo: { acao: "renomear", conversaId: conversa, titulo } };
    }
    case "confirmar":
    case "descartar":
      if (!proposta) return { ok: false, erro: "Falta a proposta." };
      return { ok: true, corpo: { acao: b.acao, propostaId: proposta } };
    default:
      return { ok: false, erro: "Ação desconhecida." };
  }
}

export interface Config {
  enabled: boolean;
  max_turns_per_user_hour: number;
}
const PADRAO: Config = { enabled: true, max_turns_per_user_hour: 60 };

/** `app_setting.value` é texto. Valor torto cai no padrão, mas `enabled: false` explícito vale. */
export function lerConfig(valor: string | null | undefined): Config {
  if (!valor) return PADRAO;
  try {
    const v = JSON.parse(valor) as Partial<Config>;
    const n = typeof v.max_turns_per_user_hour === "number" && v.max_turns_per_user_hour > 0
      ? Math.floor(v.max_turns_per_user_hour)
      : PADRAO.max_turns_per_user_hour;
    return { enabled: v.enabled !== false, max_turns_per_user_hour: n };
  } catch {
    return PADRAO;
  }
}

/** Teto de uso. O beast-bots não tem teto de custo; ele mora aqui. */
export function dentroDoLimite(c: Config, turnosNaHora: number): string | null {
  if (!c.enabled) return "O assistente está desligado agora.";
  if (turnosNaHora >= c.max_turns_per_user_hour) {
    return `Você chegou ao limite de ${c.max_turns_per_user_hour} mensagens por hora. Tente de novo daqui a pouco.`;
  }
  return null;
}

export function resourceDe(userId: string): string {
  return `movepark-marketing:hub:${userId}`;
}

export function memoriaDe(userId: string, conversaId: string) {
  const resource = resourceDe(userId);
  return { resource, thread: `${resource}:${conversaId}` };
}

/** O corpo do `/marketing/conversas`, montado com o id do JWT. O corpo da página não escolhe dono. */
export function pedidoDeConversa(
  userId: string,
  c: Extract<Corpo, { acao: "conversas" | "abrir" | "apagar" | "renomear" }>,
): Record<string, unknown> {
  if (c.acao === "conversas") return { acao: "listar", resource: resourceDe(userId) };
  const m = memoriaDe(userId, c.conversaId);
  return c.acao === "renomear"
    ? { acao: "renomear", resource: m.resource, thread: m.thread, titulo: c.titulo }
    : { acao: c.acao, resource: m.resource, thread: m.thread };
}

/** Token `mpm_`: 24 bytes aleatórios em hex. O banco guarda só o sha256. */
export function novoToken(bytes: Uint8Array): string {
  return "mpm_" + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type PropostaGravada = {
  id: string;
  profile_id: string;
  status: string;
  expires_at: string;
  tool: string;
  args: Record<string, unknown>;
};

export type Decisao =
  | { tipo: "recusar"; status: 404 | 409 | 410; erro: string }
  | { tipo: "estado" }
  | { tipo: "executar" };

/**
 * O que fazer com um clique em Confirmar. Proposta já decidida devolve o estado como está, sem
 * executar: é o que torna o segundo clique inofensivo.
 */
export function decidirConfirmacao(p: PropostaGravada | null, userId: string, agora: Date): Decisao {
  if (!p || p.profile_id !== userId) return { tipo: "recusar", status: 404, erro: "Proposta não encontrada." };
  if (p.status === "blocked") {
    return { tipo: "recusar", status: 409, erro: "Esta proposta tem problemas e não pode ser confirmada." };
  }
  if (p.status !== "proposed") return { tipo: "estado" };
  if (new Date(p.expires_at).getTime() <= agora.getTime()) {
    return { tipo: "recusar", status: 410, erro: "Esta proposta venceu. Peça de novo ao assistente." };
  }
  return { tipo: "executar" };
}

export function resumoDoResultado(tool: string, r: unknown): string {
  const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
  if (tool === "marketing_run_campaign") {
    const base = `${Number(o.enrolled ?? 0)} matrículas, ${Number(o.sent ?? 0)} envios agora.`;
    return o.dispatchEnabled === false ? `${base} Chave geral desligada: nada saiu para cliente.` : base;
  }
  if (tool === "marketing_set_dispatch_enabled") return o.enabled === true ? "Chave geral ligada." : "Chave geral desligada.";
  return "Feito.";
}

/** Uma decisão de cartão, do jeito que o agente lê no contexto do turno seguinte. */
export function acaoRecente(a: { id: string; tool: string; status: string; resultado: unknown; erro: string | null }) {
  const r = (a.resultado ?? {}) as { resumo?: unknown };
  return {
    proposta_id: a.id,
    tool: a.tool,
    status: a.status,
    resultado: typeof r.resumo === "string" ? r.resumo : (a.erro ?? null),
  };
}

/**
 * Repassa o stream do beast-bots para a página sem mexer, e chama `aoTerminar` uma vez quando ele
 * acaba: fim normal, quebra da origem ou cancelamento pela página. É o que encerra o token.
 */
export function repassarStream(
  origem: ReadableStream<Uint8Array>,
  aoTerminar: () => unknown,
): ReadableStream<Uint8Array> {
  let feito = false;
  const fim = async () => {
    if (feito) return;
    feito = true;
    try {
      await aoTerminar();
    } catch {
      // O token vence sozinho em 30 minutos.
    }
  };
  const t = new TransformStream<Uint8Array, Uint8Array>({ flush: fim });
  origem.pipeTo(t.writable).catch(fim);
  return t.readable;
}
