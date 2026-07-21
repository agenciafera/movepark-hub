// Lógica pura de voucher-pdf (testável sem rede): os gates de acesso ao voucher.

import { VOUCHER_BOOKING_STATUSES } from "../_shared/voucher/fields.ts";

/** Recusa a emitir o voucher: status HTTP + mensagem devolvida ao cliente. */
export interface VoucherDenial {
  status: number;
  error: string;
}

/** Exige JWT no header (o dono da reserva ou o operador da empresa). */
export function checkVoucherAuth(authHeader: string | null): VoucherDenial | null {
  if (!authHeader?.startsWith("Bearer ")) {
    return { status: 401, error: "Autenticação necessária" };
  }
  return null;
}

/** O corpo precisa trazer o código da reserva. */
export function checkVoucherCode(code: unknown): VoucherDenial | null {
  if (!code) return { status: 400, error: "code é obrigatório" };
  return null;
}

/**
 * Decide se a reserva pode gerar voucher.
 *
 * `booking` nulo cobre dois casos que o servidor trata igual, de propósito: reserva inexistente e
 * reserva de outro usuário. A leitura roda no client do usuário, então a RLS filtra a reserva alheia
 * antes de chegar aqui, e a resposta é 404 em vez de 403 (não confirma que o código existe).
 */
export function checkVoucherBooking(booking: { status: string } | null): VoucherDenial | null {
  if (!booking) return { status: 404, error: "Reserva não encontrada" };
  if (!(VOUCHER_BOOKING_STATUSES as readonly string[]).includes(booking.status)) {
    return { status: 422, error: "Voucher disponível só após a confirmação do pagamento." };
  }
  return null;
}
