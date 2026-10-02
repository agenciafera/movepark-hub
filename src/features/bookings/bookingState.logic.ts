// Estado da reserva em uma frase (02/10/2026). A ficha mostrava "Expirada" num selo miúdo no canto e
// "O cliente pagou" numa reserva que nunca foi paga. Aqui mora a leitura única: o status da reserva
// e o do dinheiro viram um título e um motivo, e o card de valores usa o mesmo estado.

import type { BookingStatus } from "@/types/domain";

export type PaymentLike = {
  status: string;
  refunded_at?: string | null;
  paid_at?: string | null;
  created_at: string;
  method?: string | null;
};

export type CustomerPaymentState = "paid" | "awaiting" | "unpaid" | "failed" | "refunded" | "refunding";

export type BookingStateSummary = {
  tone: "confirmed" | "pending" | "cancelled" | "neutral" | "active" | "completed";
  title: string;
  detail: string;
  payment: CustomerPaymentState;
};

const METODO: Record<string, string> = { pix: "PIX", card: "cartão" };

function lastPayment<T extends { created_at: string }>(payments: T[] | null | undefined): T | null {
  if (!payments?.length) return null;
  return [...payments].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
}

/** O estado do pagamento visto pelo cliente, a partir do último pagamento e do status da reserva. */
export function customerPaymentState(
  payments: PaymentLike[] | null | undefined,
  bookingStatus: string,
): CustomerPaymentState {
  const p = lastPayment(payments);
  if (p?.status === "refunded") return "refunded";
  if (p?.status === "paid" && p.refunded_at) return "refunding";
  if (p?.status === "paid") return "paid";
  if (p?.status === "failed") return "failed";
  if (bookingStatus === "pending") return "awaiting";
  return "unpaid";
}

export function bookingStateSummary(
  b: {
    status: BookingStatus | string;
    expires_at?: string | null;
    updated_at?: string | null;
    deleted_at?: string | null;
    checked_in_at?: string | null;
    checked_out_at?: string | null;
    total_amount?: number | string | null;
  },
  payments: PaymentLike[] | null | undefined,
  fmt: { dateTime: (iso: string) => string; brl: (value: number) => string },
): BookingStateSummary {
  const payment = customerPaymentState(payments, b.status);
  const p = lastPayment(payments);
  const meio = p?.method ? METODO[p.method] ?? p.method : null;
  const pagoEm = p?.paid_at ? ` em ${fmt.dateTime(p.paid_at)}` : "";
  const pago = meio ? `Paga no ${meio}${pagoEm}` : `Paga${pagoEm}`;
  const total = Number(b.total_amount ?? 0);

  switch (b.status) {
    case "expired":
      return {
        tone: "neutral",
        payment,
        title: "Expirada sem pagamento",
        detail: b.expires_at
          ? `O cliente não pagou até ${fmt.dateTime(b.expires_at)} e a vaga foi liberada. Nada foi cobrado.`
          : "O cliente não pagou dentro do prazo e a vaga foi liberada. Nada foi cobrado.",
      };
    case "pending":
      if (payment === "failed") {
        return { tone: "cancelled", payment, title: "Pagamento recusado", detail: "O último pagamento foi recusado. A reserva segue aguardando até o prazo expirar." };
      }
      return {
        tone: "pending",
        payment,
        title: "Aguardando pagamento",
        detail: b.expires_at ? `O cliente tem até ${fmt.dateTime(b.expires_at)} para pagar; depois disso a vaga é liberada.` : "A vaga fica segurada até o prazo do pagamento.",
      };
    case "cancelled": {
      const quando = b.deleted_at ?? b.updated_at;
      const em = quando ? ` em ${fmt.dateTime(quando)}` : "";
      if (payment === "refunded") return { tone: "cancelled", payment, title: "Cancelada e devolvida", detail: `Cancelada${em}. ${fmt.brl(total)} devolvidos ao cliente.` };
      if (payment === "refunding") return { tone: "cancelled", payment, title: "Cancelada, estorno em processamento", detail: `Cancelada${em}. O gateway está devolvendo ${fmt.brl(total)} ao cliente.` };
      if (payment === "paid") return { tone: "cancelled", payment, title: "Cancelada, devolução pendente", detail: `Cancelada${em}. O cliente pagou e a devolução está com a equipe da Movepark.` };
      return { tone: "cancelled", payment, title: "Cancelada sem pagamento", detail: `Cancelada${em}. Nada foi cobrado do cliente.` };
    }
    case "confirmed":
      return { tone: "confirmed", payment, title: payment === "paid" ? pago : "Confirmada", detail: "Vaga segurada. O cliente ainda não chegou." };
    case "checked_in":
      return { tone: "active", payment, title: "Carro no estacionamento", detail: `${pago}. Check-in${b.checked_in_at ? ` em ${fmt.dateTime(b.checked_in_at)}` : " feito"}.` };
    case "completed":
      return { tone: "completed", payment, title: "Concluída", detail: `${pago}. Check-out${b.checked_out_at ? ` em ${fmt.dateTime(b.checked_out_at)}` : " feito"}.` };
    case "no_show":
      return { tone: "cancelled", payment, title: "No-show", detail: `${payment === "paid" ? pago + ". " : ""}O cliente não apareceu no estacionamento.` };
    default:
      return { tone: "neutral", payment, title: String(b.status), detail: "" };
  }
}

/** Título e legenda do bloco do cliente no card de valores, pelo estado do pagamento. */
export function customerBlockCopy(
  payment: CustomerPaymentState,
  meio: string | null,
  installments: number | null | undefined,
  bookingStatus: string,
): { title: string; hint: string } {
  const parcelas = installments && installments > 1 ? ` em ${installments}x` : "";
  switch (payment) {
    case "paid":
      return { title: "O cliente pagou", hint: meio ? `${meio}${parcelas}` : "pago" };
    case "refunded":
      return { title: "O cliente pagou e foi devolvido", hint: meio ? `${meio}${parcelas}, estornado` : "estornado" };
    case "refunding":
      return { title: "O cliente pagou", hint: `${meio ?? "pagamento"}${parcelas}, estorno em processamento` };
    case "awaiting":
      return { title: "O cliente vai pagar", hint: "aguardando pagamento" };
    case "failed":
      return { title: "Valor da reserva", hint: "pagamento recusado, nada cobrado" };
    default:
      return {
        title: "Valor da reserva",
        hint: bookingStatus === "expired" ? "não pago: a reserva expirou" : "não pago",
      };
  }
}
