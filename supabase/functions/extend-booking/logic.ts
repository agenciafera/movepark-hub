// Lógica pura de extend-booking (testável sem rede): parsing/validação do payload.
// A elegibilidade real (Superflex, status, capacidade) é decidida no servidor pela RPC
// extend_booking_flight_delay — aqui só validamos a forma da requisição.

export type ExtendKind = "delay" | "cancellation";

export interface ExtendInput {
  bookingCode: string;
  /** A saída PEDIDA. A RPC cobre até 24h e grava o resto como excedente (25/09/2026). */
  newCheckOutAt: string;
  reason: string | null;
  /** Obrigatório ao acionar (Q-026): é a prova do atraso e abre caminho para conferir depois. */
  flightNumber: string;
  /** Atraso ou cancelamento do voo. Qualquer outra coisa cai em atraso. */
  kind: ExtendKind;
}

/** Valida { booking_code, new_check_out_at, reason? }. new_check_out_at tem que ser ISO válido. */
export function parseExtendInput(body: unknown): { input: ExtendInput | null; error?: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const code = typeof b.booking_code === "string" ? b.booking_code.trim() : "";
  if (!code) return { input: null, error: "booking_code é obrigatório." };

  const rawDate = typeof b.new_check_out_at === "string" ? b.new_check_out_at.trim() : "";
  if (!rawDate) return { input: null, error: "new_check_out_at é obrigatório." };
  const ts = Date.parse(rawDate);
  if (Number.isNaN(ts)) return { input: null, error: "new_check_out_at inválido (use ISO 8601)." };

  const flight = typeof b.flight_number === "string" ? b.flight_number.trim().toUpperCase() : "";
  if (flight.length < 2 || flight.length > 16) return { input: null, error: "Informe o número do voo (ex.: LA3456)." };

  const reason = typeof b.reason === "string" && b.reason.trim() ? b.reason.trim() : null;
  const kind: ExtendKind = b.kind === "cancellation" ? "cancellation" : "delay";
  return { input: { bookingCode: code, newCheckOutAt: new Date(ts).toISOString(), reason, flightNumber: flight, kind } };
}

/** Com excedente o aviso muda de template: o cliente precisa saber que o balcão cobra o resto. */
export function pickExtendedEvent(overageCents: number): "extended" | "extended_overage" {
  return overageCents > 0 ? "extended_overage" : "extended";
}

export function fmtBRL(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
}

export function fmtBRDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** A frase do excedente, igual no WhatsApp, no e-mail e na tela. */
export function overageSentence(coveredIso: string, dailyCents: number): string {
  return `Até ${fmtBRDateTime(coveredIso)} é por nossa conta. Depois disso, ${fmtBRL(dailyCents)} por dia, pago no estacionamento na retirada.`;
}
