// Lógica pura da conta do parceiro (E0.3.7): tipos do extrato e os rótulos, sem React.

export type MovementKind = "sale" | "refund" | "debt" | "settlement" | "transfer_in" | "withdrawal";

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
