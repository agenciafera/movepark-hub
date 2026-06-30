import type { UserRole } from "@/types/domain";

/**
 * Aceita só caminhos internos seguros como destino de redirect, evitando
 * open redirect: precisa começar com "/" e NÃO pode ser protocol-relative
 * ("//evil.com") nem "/\evil.com" (que alguns browsers normalizam para "//").
 */
export function isSafeNext(next: string | null): next is string {
  return (
    !!next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")
  );
}

/**
 * Decide o destino após o login, centralizando a regra que antes vivia duplicada
 * nas páginas de auth. `next` (destino pretendido, ex.: a listing de onde o
 * usuário clicou "Reservar agora") tem prioridade para qualquer role — desde que
 * seja um caminho interno seguro; sem ele, cai no painel padrão de cada papel.
 */
export function postLoginPath(role: UserRole | null, next: string | null): string {
  if (isSafeNext(next)) return next;
  if (role === "hub_admin") return "/manager";
  if (role === "company_operator") return "/operator";
  return "/"; // customer
}
