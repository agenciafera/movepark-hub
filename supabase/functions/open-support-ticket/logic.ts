// Lógica pura do chamado de atendimento (25/09/2026). Testável com `deno test`.

export const TICKET_KINDS = ["complaint", "question", "other"] as const;
export type TicketKind = (typeof TICKET_KINDS)[number];

export const KIND_LABEL: Record<TicketKind, string> = {
  complaint: "Reclamação",
  question: "Dúvida",
  other: "Outro assunto",
};

export const MESSAGE_MIN = 10;
export const MESSAGE_MAX = 2000;

export type TicketInput = { booking_code: string; kind: TicketKind; message: string };

/** Valida o corpo do pedido. O erro já vem pronto para a resposta 400. */
export function parseTicketInput(body: unknown): { ok: true; input: TicketInput } | { ok: false; error: string } {
  const b = (body ?? {}) as { booking_code?: unknown; kind?: unknown; message?: unknown };
  const code = typeof b.booking_code === "string" ? b.booking_code.trim().toUpperCase() : "";
  if (!/^MP-[A-Z0-9]{4,12}$/.test(code)) return { ok: false, error: "Reserva inválida." };
  const kind = typeof b.kind === "string" ? b.kind : "";
  if (!(TICKET_KINDS as readonly string[]).includes(kind)) return { ok: false, error: "Escolha o motivo do chamado." };
  const message = typeof b.message === "string" ? b.message.replace(/\s+/g, " ").trim() : "";
  if (message.length < MESSAGE_MIN) return { ok: false, error: `Conte o que aconteceu com pelo menos ${MESSAGE_MIN} caracteres.` };
  if (message.length > MESSAGE_MAX) return { ok: false, error: `A mensagem pode ter no máximo ${MESSAGE_MAX} caracteres.` };
  return { ok: true, input: { booking_code: code, kind: kind as TicketKind, message } };
}

/** O que a Movepark manda ao cliente no WhatsApp (corpo do template `movepark_chamado_aberto`). */
export function confirmationText(firstName: string, bookingCode: string, ticketCode: string): string {
  return `Oi, ${firstName}. Recebemos seu pedido de atendimento sobre a reserva ${bookingCode}, chamado ${ticketCode}. Uma pessoa da Movepark responde por aqui em horário comercial, de segunda a sexta, das 9h às 18h. Se quiser, já pode escrever mais detalhes.`;
}

/** Primeiro nome, ou "cliente" quando não há nome. */
export function firstNameOf(name: string | null | undefined): string {
  const n = (name ?? "").trim().split(/\s+/)[0] ?? "";
  return n || "cliente";
}
