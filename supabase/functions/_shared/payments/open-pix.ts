// PIX aberto depois que o cartão aprovou (19/10/2026, depois da MP-07DAE9).
//
// O cliente gera o PIX, desiste e paga no cartão. O QR continua valendo até expirar e, se ele pagar
// também, a reserva fica com dois pagamentos. Quando o cartão aprova, o checkout anula os PIX que
// ainda estão pendentes na reserva (DELETE /charges no gateway). Se o PIX foi pago no mesmo
// instante, o DELETE vira estorno, que é o certo para uma cópia. O `charge.canceled` que volta pelo
// webhook não cancela a reserva, porque o cartão segue pago (regra em _shared/refund.ts).

import type { PaymentGateway } from "./types.ts";
import { chargeStatusToPaymentStatus } from "./index.ts";
import { logGatewayEvent } from "./trail.ts";

export interface OpenPix {
  id: string;
  provider_charge_id: string | null;
}

/** Só anula com o id da cobrança; PIX sem charge id nunca chegou ao gateway. */
export function pixToVoid(rows: OpenPix[]): OpenPix[] {
  return rows.filter((r) => Boolean(r.provider_charge_id));
}

/** Anula os PIX pendentes da reserva. Best-effort: nunca lança e devolve quantos anulou. */
export async function voidOpenPixCharges(
  // deno-lint-ignore no-explicit-any
  admin: any,
  gateway: Pick<PaymentGateway, "refundCharge">,
  bookingId: string,
): Promise<number> {
  try {
    const { data, error } = await admin
      .from("payment")
      .select("id, provider_charge_id")
      .eq("booking_id", bookingId)
      .eq("method", "pix")
      .eq("status", "pending");
    if (error) {
      console.error("[open-pix] não consegui listar os PIX abertos:", bookingId, error.message);
      return 0;
    }
    let voided = 0;
    for (const pix of pixToVoid((data ?? []) as OpenPix[])) {
      const res = await gateway.refundCharge({ chargeId: pix.provider_charge_id! });
      const ok = (res.httpStatus ?? 500) < 400 && (res.status === "canceled" || res.status === "refunded");
      await logGatewayEvent(admin, {
        paymentId: pix.id,
        bookingId,
        kind: "pix_voided",
        httpStatus: res.httpStatus,
        request: { charge_id: pix.provider_charge_id },
        response: res.raw,
        note: ok
          ? "PIX aberto anulado: a reserva foi paga no cartão"
          : `não consegui anular o PIX aberto (status ${res.status})`,
      });
      if (!ok) continue;
      await admin
        .from("payment")
        .update({ status: chargeStatusToPaymentStatus(res.status) })
        .eq("id", pix.id)
        .eq("status", "pending");
      voided++;
    }
    return voided;
  } catch (e) {
    console.error("[open-pix] falha ao anular PIX aberto:", bookingId, e);
    return 0;
  }
}
