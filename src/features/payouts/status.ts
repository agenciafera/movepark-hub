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
