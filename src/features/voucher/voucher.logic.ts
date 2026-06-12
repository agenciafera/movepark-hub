import type { BookingStatus } from "@/types/domain";

export type VoucherState =
  | "not_found"
  | "pending"
  | "cancelled"
  | "no_show"
  | "completed"
  | "confirmed"
  | "checked_in";

export type VoucherTone = "success" | "warning" | "error" | "info";

export type VoucherValidity = {
  state: VoucherState;
  /** Operador pode registrar a entrada agora? */
  canCheckIn: boolean;
  message: string;
  tone: VoucherTone;
  /** Dentro da janela prevista (-30min / +2h do check_in_at). null quando não se aplica. */
  withinWindow: boolean | null;
};

export type VoucherBookingLike = {
  status: BookingStatus;
  check_in_at: string;
  checked_in_at?: string | null;
} | null;

const WINDOW_BEFORE_MS = 30 * 60 * 1000; // 30 min antes
const WINDOW_AFTER_MS = 2 * 60 * 60 * 1000; // 2 h depois

export function isWithinCheckInWindow(checkInAt: string, now: Date): boolean {
  const t = new Date(checkInAt).getTime();
  const n = now.getTime();
  return n >= t - WINDOW_BEFORE_MS && n <= t + WINDOW_AFTER_MS;
}

/**
 * Estado de validação do voucher para a tela de check-in do operador.
 * `now` é injetado para testabilidade.
 */
export function voucherValidity(b: VoucherBookingLike, now: Date): VoucherValidity {
  if (!b) {
    return {
      state: "not_found",
      canCheckIn: false,
      tone: "error",
      withinWindow: null,
      message: "Reserva não encontrada ou fora do seu escopo.",
    };
  }

  switch (b.status) {
    case "pending":
      return {
        state: "pending",
        canCheckIn: false,
        tone: "warning",
        withinWindow: null,
        message: "Reserva aguardando pagamento — ainda não confirmada.",
      };
    case "cancelled":
      return {
        state: "cancelled",
        canCheckIn: false,
        tone: "error",
        withinWindow: null,
        message: "Reserva cancelada.",
      };
    case "no_show":
      return {
        state: "no_show",
        canCheckIn: false,
        tone: "error",
        withinWindow: null,
        message: "Reserva marcada como não comparecimento.",
      };
    case "completed":
      return {
        state: "completed",
        canCheckIn: false,
        tone: "info",
        withinWindow: null,
        message: "Estadia já encerrada.",
      };
    case "checked_in":
      return {
        state: "checked_in",
        canCheckIn: false,
        tone: "success",
        withinWindow: null,
        message: "Entrada já registrada.",
      };
    case "confirmed": {
      const within = isWithinCheckInWindow(b.check_in_at, now);
      return {
        state: "confirmed",
        canCheckIn: true,
        tone: within ? "success" : "warning",
        withinWindow: within,
        message: within
          ? "Reserva válida — registre a entrada."
          : "Fora da janela prevista de entrada — confira antes de registrar.",
      };
    }
  }
}
