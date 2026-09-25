// Chamado de atendimento (25/09/2026): o que o cliente escolhe e o que a tela mostra.
// Espelha `supabase/functions/open-support-ticket/logic.ts` (a Edge revalida).
// Spec: docs/specs/chamado-de-atendimento.md

export const TICKET_KINDS = ["complaint", "question", "other"] as const;
export type TicketKind = (typeof TICKET_KINDS)[number];

export const TICKET_KIND_LABEL: Record<TicketKind, string> = {
  complaint: "Reclamação",
  question: "Dúvida",
  other: "Outro assunto",
};

export const MESSAGE_MIN = 10;
export const MESSAGE_MAX = 2000;

/** Erro de validação para a tela, ou null quando dá para enviar. */
export function validateTicket(kind: string, message: string): string | null {
  if (!(TICKET_KINDS as readonly string[]).includes(kind)) return "Escolha o motivo.";
  const m = message.replace(/\s+/g, " ").trim();
  if (m.length < MESSAGE_MIN) return `Conte o que aconteceu com pelo menos ${MESSAGE_MIN} caracteres.`;
  if (m.length > MESSAGE_MAX) return `A mensagem pode ter no máximo ${MESSAGE_MAX} caracteres.`;
  return null;
}

export type TicketLike = { code: string; kind: string; status: string; created_at: string; whatsapp_sent: boolean; closed_at: string | null };

export function kindLabel(kind: string): string {
  return (TICKET_KIND_LABEL as Record<string, string>)[kind] ?? "Chamado";
}

/** Uma linha de estado para o cliente: onde a conversa está e o que esperar. */
export function ticketStatusLine(t: TicketLike, fmt: (iso: string) => string): string {
  if (t.status === "closed") return `Encerrado${t.closed_at ? ` em ${fmt(t.closed_at)}` : ""}.`;
  return t.whatsapp_sent
    ? `Aberto em ${fmt(t.created_at)}. A resposta chega no seu WhatsApp, em horário comercial.`
    : `Aberto em ${fmt(t.created_at)}. A resposta chega no seu e-mail, em horário comercial.`;
}

export function openTickets<T extends { status: string }>(ts: T[] | undefined): T[] {
  return (ts ?? []).filter((t) => t.status === "open");
}
