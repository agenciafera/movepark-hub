import type { OnboardingStatus, PartnerApplication } from "@/types/domain";

// Colunas do kanban de parceiros, na ordem do funil (esquerda para direita).
// "Perdido" reaproveita o status `rejected` (não existe status novo no enum
// `onboarding_status`; ver ADR e migrations). O rótulo de coluna é próprio do
// kanban e não altera o label global do status (que segue "Recusado" na lista).
export const partnersKanbanColumns: { status: OnboardingStatus; label: string }[] = [
  { status: "pending_review", label: "Pendente" },
  { status: "in_progress", label: "Em cadastro" },
  { status: "approved", label: "Aprovado" },
  { status: "active", label: "Ativo" },
  { status: "rejected", label: "Perdido" },
];

export type PartnersKanbanColumn = {
  status: OnboardingStatus;
  label: string;
  applications: PartnerApplication[];
};

// Agrupa as solicitações por status, preservando a ordem das colunas. Cada
// coluna aparece mesmo sem cards (para o board ter estrutura estável).
export function groupApplicationsByStatus(
  applications: PartnerApplication[],
): PartnersKanbanColumn[] {
  return partnersKanbanColumns.map((col) => ({
    ...col,
    applications: applications.filter(
      (a) => (a.company?.onboarding_status ?? "pending_review") === col.status,
    ),
  }));
}
