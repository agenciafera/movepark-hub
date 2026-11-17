// Lógica pura da Edge operator-assistant (a ponte da bolinha do /operator com a Mia para
// operadores, no beast-bots). Ver docs/specs/assistente-do-operador.md.

export type Acao = "enviar" | "historico" | "limpar" | "confirmar" | "descartar";
export const ACOES: Acao[] = ["enviar", "historico", "limpar", "confirmar", "descartar"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_MENSAGEM = 2000;

export type Corpo =
  | { acao: "enviar"; companyId: string; mensagem: string; pagina: string | null; bookingCode: string | null }
  | { acao: "historico" | "limpar"; companyId: string }
  | { acao: "confirmar" | "descartar"; actionId: string };

/** O corpo é uma lista fechada: campo a mais não entra no contexto do agente. */
export function lerCorpo(body: unknown): { corpo: Corpo | null; erro?: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (typeof b.acao !== "string" || !(ACOES as string[]).includes(b.acao)) {
    return { corpo: null, erro: `Ação inválida. Use ${ACOES.join(", ")}.` };
  }
  const acao = b.acao as Acao;
  if (acao === "confirmar" || acao === "descartar") {
    const id = typeof b.action_id === "string" ? b.action_id.trim() : "";
    if (!UUID.test(id)) return { corpo: null, erro: "action_id inválido." };
    return { corpo: { acao, actionId: id } };
  }
  const companyId = typeof b.company_id === "string" ? b.company_id.trim() : "";
  if (!UUID.test(companyId)) return { corpo: null, erro: "company_id inválido." };
  if (acao === "historico" || acao === "limpar") return { corpo: { acao, companyId } };

  const mensagem = typeof b.mensagem === "string" ? b.mensagem.trim() : "";
  if (!mensagem) return { corpo: null, erro: "Escreva a mensagem." };
  if (mensagem.length > MAX_MENSAGEM) return { corpo: null, erro: `Mensagem longa demais (máximo ${MAX_MENSAGEM} caracteres).` };
  const pagina = typeof b.pagina === "string" && b.pagina.startsWith("/operator") ? b.pagina.slice(0, 200) : null;
  const codigo = typeof b.booking_code === "string" ? b.booking_code.trim().toUpperCase() : "";
  const bookingCode = /^MP-[A-Z0-9]{4,12}$/.test(codigo) ? codigo : null;
  return { corpo: { acao, companyId, mensagem, pagina, bookingCode } };
}

export interface Config {
  enabled: boolean;
  max_messages_per_user_hour: number;
  max_messages_per_company_day: number;
}

const PADRAO: Config = { enabled: true, max_messages_per_user_hour: 40, max_messages_per_company_day: 400 };

/** `app_setting.value` é texto. Valor torto cai no padrão, mas `enabled: false` explícito vale. */
export function lerConfig(valor: string | null | undefined): Config {
  if (!valor) return PADRAO;
  try {
    const v = JSON.parse(valor) as Partial<Config>;
    const n = (x: unknown, d: number) => (typeof x === "number" && x > 0 ? Math.floor(x) : d);
    return {
      enabled: v.enabled !== false,
      max_messages_per_user_hour: n(v.max_messages_per_user_hour, PADRAO.max_messages_per_user_hour),
      max_messages_per_company_day: n(v.max_messages_per_company_day, PADRAO.max_messages_per_company_day),
    };
  } catch {
    return PADRAO;
  }
}

/** Teto de uso. O beast-bots não tem teto de custo; ele mora aqui. */
export function dentroDoLimite(c: Config, usuarioNaHora: number, empresaNoDia: number): string | null {
  if (usuarioNaHora >= c.max_messages_per_user_hour) {
    return "Você chegou ao limite de mensagens desta hora. Tente de novo daqui a pouco.";
  }
  if (empresaNoDia >= c.max_messages_per_company_day) {
    return "A sua empresa chegou ao limite de mensagens de hoje. Amanhã libera de novo.";
  }
  return null;
}

/**
 * Memória do Mastra. Por usuário e empresa: quem é operador de duas empresas não mistura
 * histórico. O prefixo `movepark-operador:` é o que o guarda de namespace do beast-bots confere.
 */
export function memoriaDe(userId: string, companyId: string, conversationId: string) {
  return {
    resource: `movepark-operador:hub:${userId}`,
    thread: `movepark-operador:hub:${userId}:${companyId}:${conversationId}`,
  };
}

/** Token `mpo_`: 24 bytes aleatórios em hex. O banco guarda só o sha256. */
export function novoToken(bytes: Uint8Array): string {
  return "mpo_" + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface AcaoGravada {
  id: string;
  profile_id: string;
  company_id: string;
  kind: string;
  status: string;
  expires_at: string;
  params: Record<string, unknown>;
}

/** O clique só executa a proposta do próprio operador, viva e não vencida. */
export function podeConfirmar(a: AcaoGravada | null, userId: string, now: Date): string | null {
  if (!a) return "Proposta não encontrada.";
  if (a.profile_id !== userId) return "Esta proposta é de outra pessoa.";
  if (a.status === "executed") return "Esta ação já foi feita.";
  if (a.status === "executing") return "Esta ação já está sendo feita.";
  if (a.status !== "proposed") return "Esta proposta não vale mais. Peça de novo à Mia.";
  if (new Date(a.expires_at).getTime() <= now.getTime()) return "A proposta venceu (10 minutos). Peça de novo à Mia.";
  return null;
}

export const ESCOPO_DA_ACAO: Record<string, string> = {
  cancel: "bookings:cancel",
  change_dates: "bookings:write",
  change_vehicle: "bookings:write",
  check_in: "bookings:checkin",
  check_out: "bookings:checkin",
};

export type Execucao =
  | { tipo: "edge"; funcao: string; corpo: Record<string, unknown> }
  | { tipo: "status"; status: "checked_in" | "completed"; campo: "checked_in_at" | "checked_out_at" };

/**
 * Qual caminho do painel executa a ação. São os mesmos dos botões, para estorno, voucher e
 * histórico saírem idênticos. A troca de datas escolhe a Edge pelo status ATUAL da reserva:
 * pendente reprecifica, confirmada cobra ou estorna a diferença.
 */
export function comoExecutar(kind: string, params: Record<string, unknown>, statusAtual: string): Execucao | null {
  const codigo = String(params.booking_code ?? "");
  if (!codigo) return null;
  switch (kind) {
    case "cancel":
      return { tipo: "edge", funcao: "cancel-booking", corpo: { booking_code: codigo, reason: params.reason ?? null } };
    case "change_dates":
      return {
        tipo: "edge",
        funcao: statusAtual === "pending" ? "change-booking-dates" : "change-booking-dates-paid",
        corpo: { booking_code: codigo, check_in_at: params.check_in_at, check_out_at: params.check_out_at },
      };
    case "change_vehicle":
      return {
        tipo: "edge",
        funcao: "change-booking-vehicle",
        corpo: {
          booking_code: codigo,
          license_plate: params.license_plate,
          model: params.model ?? null,
          color: params.color ?? null,
          reason: params.reason ?? null,
        },
      };
    case "check_in":
      return { tipo: "status", status: "checked_in", campo: "checked_in_at" };
    case "check_out":
      return { tipo: "status", status: "completed", campo: "checked_out_at" };
    default:
      return null;
  }
}

const reais = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\u00a0/g, " ");

/** O que o cartão mostra depois do clique, a partir da resposta da Edge. */
export function resumoDoResultado(kind: string, r: Record<string, unknown>): string {
  switch (kind) {
    case "cancel":
      if (r.refunded) return "Reserva cancelada e estorno enviado ao cliente.";
      if (r.refund_pending) return "Reserva cancelada. O estorno está em processamento no banco.";
      if (r.refund_manual) return "Reserva cancelada. O estorno vai ser feito pela equipe Movepark em até 2 dias úteis.";
      return r.status === "expired" ? "Reserva encerrada (não tinha pagamento)." : "Reserva cancelada, sem estorno.";
    case "change_dates": {
      if (r.mode === "charge") {
        const d = Number(r.delta ?? 0);
        return `PIX de ${reais(Math.round(d * 100))} gerado para o cliente. As datas mudam quando ele pagar.`;
      }
      if (r.refunded || r.refund_pending) return "Datas alteradas e diferença estornada ao cliente.";
      return "Datas alteradas.";
    }
    case "change_vehicle":
      return "Veículo trocado. O voucher foi refeito.";
    case "check_in":
      return "Entrada registrada.";
    case "check_out":
      return "Saída registrada.";
    default:
      return "Feito.";
  }
}
