// Lógica pura do orquestrador de checkout (testável sem React): decide o que renderizar
// (gate de auth/perfil/erro/ownership), se a reserva pendente expirou, o auto-avanço pro
// passo de confirmação e o polling de confirmação automática. A página (`routes/checkout.tsx`)
// e o hook (`api.useCheckoutBooking`) só consomem estas funções.

export type CheckoutStep = 1 | 2 | 3 | 4;

/** Decisão de "tela" antes de montar o layout do checkout. */
export type CheckoutGate =
  | { kind: "loading" }
  | { kind: "redirect"; to: string }
  | { kind: "error" }
  | { kind: "not-found" }
  | { kind: "not-owner" }
  | { kind: "ready" };

export interface CheckoutGateArgs {
  authLoading: boolean;
  bookingLoading: boolean;
  hasSession: boolean;
  userId: string | null;
  code: string | undefined;
  /** profile do usuário (undefined = ainda carregando; objeto = carregado). */
  profile: { full_name: string | null; tax_id: string | null } | null | undefined;
  hasError: boolean;
  /** booking carregado (null/undefined = não encontrado). */
  booking: { profile_id: string | null } | null | undefined;
}

function checkoutNext(code: string | undefined): string {
  return encodeURIComponent(`/checkout/${code ?? ""}`);
}

/**
 * Resolve a tela do checkout na MESMA ordem da página:
 * loading → redireciona p/ login se anônimo → redireciona p/ completar perfil se
 * faltar full_name/tax_id → erro → não encontrada → não pertence ao usuário → pronta.
 */
export function resolveCheckoutGate(a: CheckoutGateArgs): CheckoutGate {
  if (a.authLoading || a.bookingLoading) return { kind: "loading" };
  if (!a.hasSession) return { kind: "redirect", to: `/entrar?next=${checkoutNext(a.code)}` };
  if (a.profile && (!a.profile.full_name || !a.profile.tax_id)) {
    return { kind: "redirect", to: `/account/complete-profile?next=${checkoutNext(a.code)}` };
  }
  if (a.hasError) return { kind: "error" };
  if (!a.booking) return { kind: "not-found" };
  if (a.booking.profile_id !== a.userId) return { kind: "not-owner" };
  return { kind: "ready" };
}

/** true se a reserva pendente já passou do `expires_at` (só pendente expira). */
export function isCheckoutExpired(
  expiresAt: string | null,
  status: string,
  now: Date = new Date(),
): boolean {
  return !!expiresAt && new Date(expiresAt) < now && status === "pending";
}

/** Passo pra onde auto-avançar quando o pagamento confirma (Step 4); null = não mexe. */
export function nextStepOnConfirm(status: string, current: CheckoutStep): CheckoutStep | null {
  return status === "confirmed" && current !== 4 ? 4 : null;
}

/** Polling: recarrega enquanto a reserva ou o último pagamento estiverem pendentes. */
export function shouldPollCheckout(
  status: string | null | undefined,
  paymentStatus: string | null | undefined,
): boolean {
  return status === "pending" || paymentStatus === "pending";
}
