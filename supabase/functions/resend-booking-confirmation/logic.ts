// Lógica pura do reenvio do e-mail de confirmação (Manager › Reservas). Testável com `deno test`.

export type ResendInput = { code: string };

/** Valida o corpo do pedido. Devolve o erro pronto para a resposta 400. */
export function parseResendInput(body: unknown): { ok: true; input: ResendInput } | { ok: false; error: string } {
  const b = (body ?? {}) as { code?: unknown };
  const code = typeof b.code === "string" ? b.code.trim().toUpperCase() : "";
  if (!/^MP-[A-Z0-9]{4,12}$/.test(code)) return { ok: false, error: "code é obrigatório (ex.: MP-7K2Q9X)." };
  return { ok: true, input: { code } };
}

/**
 * Só reserva viva recebe o e-mail de novo: o template diz "sua reserva está confirmada" e "o
 * estacionamento espera você", o que seria mentira para cancelada, expirada, concluída ou não
 * comparecida. Pendente ainda não pagou, então não há o que confirmar.
 */
export function canResendConfirmation(status: string | null | undefined): boolean {
  return status === "confirmed" || status === "checked_in";
}

/**
 * Lê o desfecho do helper depois do reenvio: o carimbo novo prova o envio; carimbo ausente com
 * entrega de integração pendente significa que o e-mail ficou retido esperando o código da cancela.
 */
export function resendOutcome(sentAt: string | null, held: boolean): "sent" | "held" | "not_sent" {
  if (sentAt) return "sent";
  return held ? "held" : "not_sent";
}
