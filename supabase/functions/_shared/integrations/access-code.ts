// Leituras do código de acesso usadas pelo voucher e pelo e-mail de confirmação.
// Folha do grafo de imports: não importa voucher nem e-mail, para não fechar ciclo.

// deno-lint-ignore no-explicit-any
type Admin = any;

/** Código vigente da reserva (o que vai no QR), ou null quando a unidade não tem integração. */
export async function activeAccessCode(admin: Admin, bookingId: string): Promise<string | null> {
  const { data } = await admin
    .from("integration_access_code")
    .select("code")
    .eq("booking_id", bookingId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { code?: string } | null)?.code ?? null;
}

/**
 * Retenção do e-mail de confirmação (decisão D4): enquanto a entrega da reserva está pendente e
 * dentro dos 15 minutos, o e-mail espera o código. Devolve true quando deve segurar, e marca
 * `email_held_at` para quem processar a entrega saber que tem um e-mail a soltar.
 */
export async function holdConfirmationEmail(admin: Admin, bookingId: string): Promise<boolean> {
  const { data } = await admin
    .from("integration_delivery")
    .select("id, email_held_at")
    .eq("booking_id", bookingId)
    .eq("status", "pending")
    .is("hold_released_at", null)
    .gt("hold_until", new Date().toISOString())
    .limit(1)
    .maybeSingle();
  const row = data as { id: string; email_held_at: string | null } | null;
  if (!row) return false;
  if (await activeAccessCode(admin, bookingId)) return false;
  if (!row.email_held_at) {
    await admin.from("integration_delivery").update({ email_held_at: new Date().toISOString() }).eq("id", row.id);
  }
  return true;
}
