import type { PayoutRecipientStatus } from "@/types/domain";

type Tone = "confirmed" | "active" | "pending" | "completed" | "cancelled" | "neutral";

export const payoutStatusLabel: Record<PayoutRecipientStatus, string> = {
  draft: "Não enviado",
  pending: "Em análise",
  action_required: "Ação necessária",
  active: "Apto a receber",
  refused: "Recusado",
  suspended: "Suspenso",
};

export const payoutStatusTone: Record<PayoutRecipientStatus, Tone> = {
  draft: "neutral",
  pending: "pending",
  action_required: "pending",
  active: "confirmed",
  refused: "cancelled",
  suspended: "cancelled",
};

/**
 * Estágios crus do gateway que significam "cadastro entrou, falta a verificação de identidade"
 * (Pagar.me: `registration` e `affiliation`, o painel deles mostra "Afiliação"). O saldo fica
 * travado até o representante concluir o link de prova de vida; o recebedor já pode receber split.
 */
export const KYC_PENDING_PROVIDER_STATUSES = ["registration", "affiliation"] as const;

/** Rótulo do status considerando o estágio cru do gateway (28/09/2026). */
export function recipientStatusLabel(
  status: PayoutRecipientStatus,
  lastProviderStatus?: string | null,
): string {
  if (
    status === "pending" &&
    (KYC_PENDING_PROVIDER_STATUSES as readonly string[]).includes((lastProviderStatus ?? "").toLowerCase())
  ) {
    return "Aguardando prova de vida";
  }
  return payoutStatusLabel[status];
}
