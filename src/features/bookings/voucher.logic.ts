/**
 * Quando a reserva tem voucher, e em que papel ele aparece.
 *
 * A verdade é o servidor: a Edge `voucher-pdf` emite para `confirmed`, `checked_in` e `completed`
 * (`supabase/functions/_shared/voucher/fields.ts`). A tela divergia disso e escondia o botão em
 * `completed`, então quem terminou a viagem tinha um voucher válido no servidor e nenhum jeito de
 * baixar. Esta lista espelha a do servidor de propósito; se uma das duas mudar, a outra muda junto.
 * Ver https://app.clickup.com/t/86ajmy4d2
 */
export const VOUCHER_BOOKING_STATUSES = ["confirmed", "checked_in", "completed"] as const;

export function canDownloadVoucher(status: string): boolean {
  return (VOUCHER_BOOKING_STATUSES as readonly string[]).includes(status);
}

/**
 * Depois do check-out o documento deixa de servir para entrar e passa a servir para prestar contas
 * (reembolso corporativo, nota). Muda o papel: o QR de chegada e o "adicionar ao calendário" saem, e
 * o rótulo passa a falar de comprovante.
 */
export function isVoucherReceipt(status: string): boolean {
  return status === "completed";
}
