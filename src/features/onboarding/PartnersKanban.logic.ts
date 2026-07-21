import type { OnboardingStatus, PartnerApplication } from "@/types/domain";

// Colunas do kanban de parceiros, na ordem real do funil (esquerda para direita):
// Pendente → Aprovado → Em cadastro → Ativo, com Perdido à parte. A ordem segue o
// ciclo do onboarding: o manager aprova (envia o convite) e, a partir daí, quem
// avança é o próprio parceiro: começa a preencher o wizard (`in_progress`, "Em
// cadastro") e depois publica (`active`, "Ativo"). Por isso "Em cadastro" e "Ativo"
// não são alvo de arrasto (ver canMoveToColumn): são estados que o parceiro
// conquista, não que o manager atribui. "Perdido" reaproveita o status `rejected`
// (não existe status novo no enum `onboarding_status`; ver ADR e migrations). O
// rótulo de coluna é próprio do kanban e não altera o label global do status (que
// segue "Recusado" na lista).
export const partnersKanbanColumns: { status: OnboardingStatus; label: string }[] = [
  { status: "pending_review", label: "Pendente" },
  { status: "approved", label: "Aprovado" },
  { status: "in_progress", label: "Em cadastro" },
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

// Regras de transição por arrastar. O manager tem só DUAS ações reais na esteira:
// aprovar e recusar. Tudo mais é o próprio parceiro que faz.
//   - approve (Aprovado): edge `approve-partner`, envia o convite e leva o status
//     para `approved`. A partir de `pending_review` (aprovar) ou de `rejected`
//     (re-aprovar), como o `canApprove` do drawer.
//   - reject (Perdido): a partir de qualquer status menos `active` (mesmo critério
//     do botão Recusar no drawer).
// "Em cadastro" (`in_progress`) e "Ativo" (`active`) NÃO são alvo de arrasto: o
// parceiro entra em `in_progress` ao salvar o wizard e em `active` ao publicar
// (auto-transição no backend, `onboarding_assert_editable` / `onboarding_publish`).
// O manager não atribui esses estados; a coluna só mostra quem já chegou lá.
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
