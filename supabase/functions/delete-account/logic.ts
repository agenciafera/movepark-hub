// Lógica pura da exclusão de conta (testável sem rede). A orquestração (refund/storage/auth
// admin) mora no index.ts; aqui ficam só decisões determinísticas.
// Ver docs/specs/customer/account-deletion.md.

/** E-mail placeholder gravado no auth.users ao anonimizar (único por uid, domínio inválido). */
export function anonymizedEmail(uid: string): string {
  return `deleted-${uid}@anonymized.movepark.invalid`;
}

/** Ban praticamente permanente aceito pela Supabase Auth Admin API (~100 anos). */
export const PERMANENT_BAN_DURATION = "876000h";

/** Caminho do voucher no bucket privado `vouchers` (convenção storage-buckets.md). */
export function voucherObjectPath(bookingId: string): string {
  return `${bookingId}.pdf`;
}

/**
 * Reserva "ativa" = ainda cancelável ao excluir a conta: status pending/confirmed e que ainda
 * não terminou (check-out no futuro). Passadas/concluídas ficam (só sofrem scrub da PII).
 */
export function isActiveBooking(
  status: string,
  checkOutAt: string,
  now: Date = new Date(),
): boolean {
  if (status !== "pending" && status !== "confirmed") return false;
  return new Date(checkOutAt).getTime() > now.getTime();
}
