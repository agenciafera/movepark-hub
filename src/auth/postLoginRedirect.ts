import type { UserRole } from "@/types/domain";

/**
 * Decide o destino após o login, centralizando a regra que antes vivia duplicada
 * nas páginas de auth. `next` (destino pretendido, ex.: a listing de onde o
 * usuário clicou "Reservar agora") tem prioridade para qualquer role; sem ele,
 * cai no painel padrão de cada papel.
 */
export function postLoginPath(role: UserRole | null, next: string | null): string {
  if (next) return next;
  if (role === "hub_admin") return "/manager";
  if (role === "company_operator") return "/operator";
  return "/"; // customer
}
