// Quando o Manager oferece "Estornar" num pagamento (estorno avulso, 19/10/2026). A Edge
// `refund-payment` revalida tudo; aqui é só para o botão não aparecer onde não faz sentido.

import type { GatewayTrailPayment } from "./api";

/** Pagamento aprovado e ainda sem estorno. */
export function canRefundPayment(p: Pick<GatewayTrailPayment, "status" | "refunded_at">): boolean {
  return p.status === "paid" && !p.refunded_at;
}

/**
 * Este é o único pagamento da reserva que segue aprovado? Se for, o estorno deixa a reserva
 * confirmada sem pagamento, e o diálogo avisa antes.
 */
export function isLastLiveBookingPayment(
  payments: Pick<GatewayTrailPayment, "id" | "kind" | "status" | "refunded_at">[],
  p: Pick<GatewayTrailPayment, "id" | "kind">,
): boolean {
  if ((p.kind ?? "booking") !== "booking") return false;
  return !payments.some(
    (o) =>
      o.id !== p.id &&
      (o.kind ?? "booking") === "booking" &&
      (o.status === "paid" || o.status === "authorized") &&
      !o.refunded_at,
  );
}

/**
 * Aviso depois do estorno. Só o PIX tem prazo de 1 dia útil; o cartão segue o prazo do banco
 * emissor. Até 27/11/2026 o aviso falava em PIX também no estorno de cartão (MP-F00991).
 */
export function refundToastMessage(method: string | null | undefined, refundPending: boolean): string {
  if (!refundPending) return "Estorno feito. A reserva continua como estava.";
  if (method === "pix") {
    return "Estorno pedido. A reserva continua como estava, e o PIX volta ao cliente em até 1 dia útil.";
  }
  return "Estorno pedido. A reserva continua como estava, e o valor volta ao cartão no prazo do banco.";
}
