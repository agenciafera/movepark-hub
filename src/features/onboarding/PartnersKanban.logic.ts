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

// Regras de transição por arrastar, espelhando o que a lista/drawer permitem.
// Só há ação de backend (edge `approve-partner`) para dois destinos:
//   - approved: via "approve" (envia convite "continuar cadastro"), a partir de
//     pending_review ou rejected (mesmo `canApprove` do drawer).
//   - rejected (Perdido): via "reject", a partir de qualquer status menos active
//     (mesmo critério de visibilidade do botão Recusar no drawer).
// Pending_review, in_progress e active NÃO são destinos manuais: mudam por
// outros fluxos (cadastro iniciado / publicação), então o card volta ao lugar.
export function canMoveToColumn(from: OnboardingStatus, to: OnboardingStatus): boolean {
  if (from === to) return false;
  if (to === "approved") return from === "pending_review" || from === "rejected";
  if (to === "rejected") return from !== "active";
  return false;
}

// Um card só é arrastável se tiver ao menos um destino válido.
export function isDraggable(from: OnboardingStatus): boolean {
  return canMoveToColumn(from, "approved") || canMoveToColumn(from, "rejected");
}
