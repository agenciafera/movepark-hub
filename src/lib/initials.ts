/**
 * Iniciais do usuário pro avatar, padronizadas em todo o app (topbar, sidebar da conta):
 * até 2 letras do nome completo (primeiro + último), com fallback pro e-mail e pro "?".
 * Ex: "Diego Guedes" → "DG"; "Diego" → "D"; "diego@fera.ag" → "D"; vazio → "?".
 */
export function userInitials(fullName?: string | null, email?: string | null): string {
  const parts = (fullName?.trim() || email?.trim() || "").split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}
