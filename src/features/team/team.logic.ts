// Lógica pura da gestão de usuários da empresa (E1.6). Sem React/Supabase → testável.
import type { CompanyMember, CompanyRole } from "@/types/domain";

export const COMPANY_ROLE_LABEL: Record<CompanyRole, string> = {
  owner: "Dono",
  manager: "Gerente",
  operator: "Operação",
  finance: "Financeiro",
};

export const COMPANY_ROLE_HINT: Record<CompanyRole, string> = {
  owner: "Acesso total: operação, financeiro, preços e gestão de usuários e chaves.",
  manager: "Tudo operacional, financeiro e catálogo/preços. Não gere usuários nem chaves.",
  operator: "Reservas, check-in e ocupação. Sem preços, financeiro ou usuários.",
  finance: "Financeiro e repasses (leitura) e reservas. Sem operação ou catálogo.",
};

/** Papéis fixos atribuíveis na UI (ADR-005), na ordem de exibição. */
export const ASSIGNABLE_ROLES: CompanyRole[] = ["owner", "manager", "operator", "finance"];

/** Quantos donos a empresa tem. */
export function ownerCount(members: CompanyMember[]): number {
  return members.filter((m) => m.role === "owner").length;
}

/**
 * O membro é o ÚNICO dono? Espelha a guarda do banco — usado para desabilitar
 * (no client) rebaixar/remover o último dono, evitando a empresa ficar sem dono.
 */
export function isLastOwner(members: CompanyMember[], profileId: string): boolean {
  const m = members.find((x) => x.profile_id === profileId);
  return !!m && m.role === "owner" && ownerCount(members) <= 1;
}

/** Pode rebaixar/remover este membro? Falso só quando é o último dono. */
export function canModifyMember(members: CompanyMember[], profileId: string): boolean {
  return !isLastOwner(members, profileId);
}
