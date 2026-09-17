// Lógica pura do histórico de saques (E0.3.10): rótulo de status e a linha "quando cai".

export type WithdrawalTone = "pending" | "confirmed" | "cancelled" | "neutral";

export const WITHDRAWAL_STATUS: Record<string, { label: string; tone: WithdrawalTone }> = {
  created: { label: "Solicitado", tone: "pending" },
  processing: { label: "Em trânsito", tone: "pending" },
  paid: { label: "Caiu na conta", tone: "confirmed" },
  failed: { label: "Falhou", tone: "cancelled" },
  canceled: { label: "Cancelado", tone: "cancelled" },
};

export interface WithdrawalLike {
  status: string;
  requested_at: string | null;
  created_at: string;
  expected_at: string | null;
  paid_at: string | null;
  failure_reason: string | null;
}

/** Dia civil em Brasília (AAAA-MM-DD), para comparar previsão com hoje sem hora. */
export function brtDay(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * A frase da coluna "Chega em": quando caiu, quando deve cair, se está atrasado, ou por que
 * falhou. `now` entra para o teste não depender do relógio.
 */
export function withdrawalLanding(
  w: WithdrawalLike,
  fmt: (iso: string) => string,
  now: Date = new Date(),
): { text: string; late: boolean } {
  if (w.status === "paid") {
    return { text: w.paid_at ? `caiu em ${fmt(w.paid_at)}` : "caiu na conta", late: false };
  }
  if (w.status === "failed") {
    return { text: w.failure_reason ? `falhou: ${w.failure_reason}` : "falhou no banco", late: false };
  }
  if (w.status === "canceled") return { text: "cancelado", late: false };
  if (!w.expected_at) return { text: "sem previsão do gateway", late: false };
  const late = brtDay(w.expected_at) < brtDay(now);
  return { text: late ? `previsto para ${fmt(w.expected_at)}, ainda não caiu` : `previsto para ${fmt(w.expected_at)}`, late };
}

/** Quando o saque foi pedido (a data que o parceiro lembra). */
export function withdrawalRequestedAt(w: Pick<WithdrawalLike, "requested_at" | "created_at">): string {
  return w.requested_at ?? w.created_at;
}

/** Quantos saques ainda não caíram, para o título do card. */
export function countOpenWithdrawals(ws: Pick<WithdrawalLike, "status">[]): number {
  return ws.filter((w) => w.status === "created" || w.status === "processing").length;
}
