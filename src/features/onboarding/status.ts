import type { OnboardingStatus } from "@/types/domain";

type Tone = "confirmed" | "active" | "pending" | "completed" | "cancelled" | "neutral";

export const onboardingStatusLabel: Record<OnboardingStatus, string> = {
  pending_review: "Pendente",
  approved: "Aprovado",
  in_progress: "Em cadastro",
  active: "Ativo",
  rejected: "Recusado",
};

export const onboardingStatusTone: Record<OnboardingStatus, Tone> = {
  pending_review: "pending",
  approved: "active",
  in_progress: "completed",
  active: "confirmed",
  rejected: "cancelled",
};
