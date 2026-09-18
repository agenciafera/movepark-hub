// Lógica pura da conta do parceiro (E0.3.7): tipos do extrato e os rótulos, sem React.

export type MovementKind =
  | "sale"
  | "refund"
  | "debt"
  | "settlement"
  | "transfer_in"
  | "withdrawal"
  | "custody_sale"
  | "custody_refund";

export interface AccountMovement {
  kind: MovementKind;
  at: string;
  booking_code: string | null;
  /** Valor bruto da linha (parte do parceiro na venda; negativo em estorno e saque). */
  gross_cents: number;
  fee_cents: number;
  debt_recovered_cents: number;
  /** Efeito no SALDO do recebedor no gateway. */
  net_cents: number;
  /** Efeito na DÍVIDA com a Movepark (positivo aumenta). */
  debt_delta_cents: number;
  release_at: string | null;
  release_status: "released" | "waiting" | "unknown" | null;
  /** Estorno: quem devolveu (`partner` = gateway debitou o recebedor; `master` = Movepark absorveu). */
  origin: "partner" | "master" | null;
  status: string | null;
  note: string | null;
}

export interface AccountHeader {
  recipient_status: string | null;
  external_recipient_id: string | null;
  recipient_missing: boolean;
  available_cents: number | null;
  waiting_cents: number | null;
  transferred_cents: number | null;
  balance_synced_at: string | null;
  transfer_enabled: boolean | null;
  transfer_interval: "Daily" | "Weekly" | "Monthly" | null;
  transfer_day: number | null;
  debt_cents: number;
}

export interface AccountStatement {
  company_id: string;
  header: AccountHeader;
  movements: AccountMovement[];
}

export const MOVEMENT_LABEL: Record<MovementKind, string> = {
  sale: "Venda",
  refund: "Estorno",
  debt: "Estorno (Movepark pagou)",
  settlement: "Acerto de dívida",
  transfer_in: "Repasse da Movepark",
  withdrawal: "Saque para o banco",
  custody_sale: "Venda (em custódia)",
  custody_refund: "Venda em custódia cancelada",
};

/** Como o dinheiro sai do recebedor para a conta bancária, em uma frase. */
export function transferCycleLabel(h: Pick<AccountHeader, "transfer_enabled" | "transfer_interval" | "transfer_day">): string {
  if (h.transfer_enabled === false) return "Só por saque manual";
  if (!h.transfer_interval) return "Padrão da conta Pagar.me";
  if (h.transfer_interval === "Daily") return "Automático, todo dia útil";
  if (h.transfer_interval === "Weekly") {
    const dias = ["", "segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];
    return `Automático, toda ${dias[h.transfer_day ?? 0] ?? "semana"}`;
  }
  return `Automático, todo dia ${h.transfer_day ?? 1}`;
}

/** Coluna "Liberação" de uma linha. */
export function releaseLabel(m: Pick<AccountMovement, "kind" | "release_status" | "release_at">, fmt: (iso: string) => string): string {
  if (m.kind === "withdrawal") {
    // E0.3.10: no saque, release_at é quando a Pagar.me enviou a TED (transferred) ou a previsão.
    if (m.release_status === "released" && m.release_at) return `TED enviada em ${fmt(m.release_at)}`;
    if (m.release_status === "waiting" && m.release_at) return `cai em ${fmt(m.release_at)}`;
    if (m.release_status === "unknown") return "sem previsão";
    return "";
  }
  if (m.kind !== "sale") return "";
  if (m.release_status === "released") return "liberado";
  if (m.release_status === "waiting" && m.release_at) return `libera em ${fmt(m.release_at)}`;
  return "sem previsão";
}

/** Soma do período: o que entrou, o que saiu do saldo e o que mudou na dívida. */
export function summarizeMovements(ms: AccountMovement[]) {
  let in_cents = 0;
  let out_cents = 0;
  let debt_delta = 0;
  for (const m of ms) {
    if (m.net_cents > 0) in_cents += m.net_cents;
    if (m.net_cents < 0) out_cents += -m.net_cents;
    debt_delta += m.debt_delta_cents;
  }
  return { in_cents, out_cents, debt_delta };
}

/** O que o `payout_withdrawable` devolve e que decide se dá para sacar. */
export interface WithdrawableSnapshot {
  release_days: number;
  released_cents: number;
  retained_cents: number;
  debt_cents: number;
  withdrawn_cents: number;
  gateway_available_cents: number | null;
  recipient_status: string | null;
  recipient_missing: boolean;
  available_cents: number;
}

/**
 * Por que o botão "Sacar o máximo" está desabilitado, em uma frase para o tooltip.
 * Devolve null quando há o que sacar. A ordem segue a do cálculo do teto: recebedor, prazo,
 * dívida, saldo físico no gateway.
 */
export function maxWithdrawReason(
  w: WithdrawableSnapshot | undefined,
  brl: (cents: number) => string,
): string | null {
  if (!w) return "Calculando o disponível para saque…";
  if (w.recipient_missing) return "O recebedor desta empresa ainda não existe no gateway.";
  if (w.recipient_status !== "active") return "O recebedor ainda não está apto a receber.";
  if (w.available_cents > 0) return null;
  const liberadoLiquido = w.released_cents - w.withdrawn_cents;
  if (liberadoLiquido <= 0 && w.retained_cents > 0) {
    return `Nada liberado ainda: cada venda libera ${w.release_days} dias depois do pagamento. Retido: ${brl(w.retained_cents)}.`;
  }
  if (w.debt_cents > 0 && liberadoLiquido <= w.debt_cents) {
    return `A dívida com a Movepark (${brl(w.debt_cents)}) consome o que está liberado.`;
  }
  if (w.gateway_available_cents != null && w.gateway_available_cents <= 0) {
    return "O saldo no gateway está zerado.";
  }
  return "Nada disponível para saque.";
}

/**
 * Alerta de recebedor negativo na conta do parceiro. Null quando não há leitura ou o saldo
 * não é negativo. O texto muda por audiência: o Manager vê o efeito no master; o parceiro vê o
 * que acontece com o dinheiro dele (as próximas vendas cobrem antes de liberar saque).
 */
export function negativeRecipientAlert(
  gatewayAvailableCents: number | null | undefined,
  audience: "manager" | "partner",
  brl: (cents: number) => string,
): string | null {
  if (gatewayAvailableCents == null || gatewayAvailableCents >= 0) return null;
  const buraco = brl(-gatewayAvailableCents);
  return audience === "manager"
    ? `Recebedor negativo em ${buraco} na Pagar.me. Esse valor está saindo do saldo do master até as próximas vendas desta empresa cobrirem; enquanto isso nada libera para saque aqui.`
    : `Sua conta no gateway está negativa em ${buraco}. As próximas vendas cobrem esse valor primeiro; até lá não há saque.`;
}
