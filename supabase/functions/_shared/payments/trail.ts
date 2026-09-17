// Rastro do gateway (E0.3.9): cada chamada relevante à Pagar.me deixa uma linha em
// `payment_gateway_event`, ligada ao pagamento e à reserva, com o que pedimos e o que voltou.
// O Manager mostra isso na reserva. Escrever é best-effort: o rastro nunca derruba a ação.

export interface TrailInput {
  paymentId: string | null;
  bookingId: string | null;
  /** charge_created | refund | webhook:<tipo> | payables | withdrawal | chargeback */
  kind: string;
  httpStatus: number | null | undefined;
  request?: unknown;
  response?: unknown;
  note?: string | null;
}

/** A linha como vai para a tabela. Pura, para teste. */
export function trailRow(i: TrailInput) {
  return {
    payment_id: i.paymentId,
    booking_id: i.bookingId,
    provider: "pagarme",
    kind: i.kind,
    http_status: i.httpStatus ?? null,
    request: i.request ?? null,
    response: i.response ?? null,
    note: i.note ?? null,
  };
}

// deno-lint-ignore no-explicit-any
export async function logGatewayEvent(admin: any, i: TrailInput): Promise<void> {
  try {
    const { error } = await admin.from("payment_gateway_event").insert(trailRow(i));
    if (error) console.error("[trail] não gravou o rastro do gateway:", i.kind, error.message);
  } catch (e) {
    console.error("[trail] não gravou o rastro do gateway:", i.kind, e);
  }
}
