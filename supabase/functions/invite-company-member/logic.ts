// Lógica pura do convite de membro (E1.7) — sem rede, testável com `deno test`.

/** Papéis fixos atribuíveis (ADR-005). Espelha company_role no banco. */
export const ASSIGNABLE_ROLES = ["owner", "manager", "operator", "finance"] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export function isAssignableRole(v: unknown): v is AssignableRole {
  return typeof v === "string" && (ASSIGNABLE_ROLES as readonly string[]).includes(v);
}

/** Normaliza/valida o e-mail do convidado. Retorna minúsculo+trim, ou null se inválido. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const e = raw.trim().toLowerCase();
  // validação simples (a verdade é o gateway de e-mail); evita string vazia/sem @.
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : null;
}

/** Rótulo pt-BR do papel (para o e-mail de convite). */
export const ROLE_LABEL: Record<AssignableRole, string> = {
  owner: "Dono",
  manager: "Gerente",
  operator: "Operação",
  finance: "Financeiro",
};
