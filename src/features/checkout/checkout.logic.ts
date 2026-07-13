// Lógica pura do orquestrador de checkout (testável sem React): decide o que renderizar
// (gate de auth/perfil/erro/ownership), se a reserva pendente expirou, o auto-avanço pro
// passo de confirmação e o polling de confirmação automática. A página (`routes/checkout.tsx`)
// e o hook (`api.useCheckoutBooking`) só consomem estas funções.

import { isValidPhoneNumber } from "react-phone-number-input";

export type CheckoutStep = 1 | 2 | 3 | 4;

// Validação básica de e-mail: um "@" com algo antes e um domínio com ponto depois. Não tenta ser
// RFC-completo (isso mora na verificação real, futura); só barra digitação claramente inválida.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface Step1IdentityInput {
  firstName: string;
  lastName: string;
  /** Telefone de contato do titular, em E.164 (ou undefined enquanto vazio). */
  phone: string | undefined;
  /** E-mail de contato digitado (só usado quando o login NÃO foi por e-mail). */
  email: string;
  /** true quando a conta tem e-mail (login por e-mail/Google): o campo fica travado. */
  loggedInWithEmail: boolean;
  /** Reserva para outra pessoa: exige nome, sobrenome e telefone do passageiro. */
  forOther: boolean;
  otherFirstName: string;
  otherLastName: string;
  otherPhone: string | undefined;
}

/**
 * Valida o passo 1 do checkout (Identificação). Retorna a 1ª mensagem de erro, ou null se ok.
 * Contato é OBRIGATÓRIO (o pedido precisa de um telefone válido pra avisos operacionais): telefone
 * do titular sempre; e-mail quando a conta não tem e-mail (login por telefone); e telefone do
 * passageiro quando a reserva é pra outra pessoa. Contato ≠ credencial: nada disso vira login aqui
 * (ADR-006 / E0.10); só popula o snapshot da booking.
 */
export function validateStep1Identity(i: Step1IdentityInput): string | null {
  if (!i.firstName.trim() || !i.lastName.trim()) return "Conta seu nome e sobrenome.";
  if (!i.phone || !isValidPhoneNumber(i.phone)) return "Informe um telefone de contato válido.";
  if (!i.loggedInWithEmail && !EMAIL_RE.test(i.email.trim())) {
    return "Informe um e-mail de contato válido.";
  }
  if (i.forOther) {
    if (!i.otherFirstName.trim() || !i.otherLastName.trim()) {
      return "Conta o nome e o sobrenome de quem vai usar a vaga.";
    }
    if (!i.otherPhone || !isValidPhoneNumber(i.otherPhone)) {
      return "Informe um telefone válido de quem vai usar a vaga.";
    }
  }
  return null;
}

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
  hasError: boolean;
  /** booking carregado (null/undefined = não encontrado). */
  booking: { profile_id: string | null } | null | undefined;
}

function checkoutNext(code: string | undefined): string {
  return encodeURIComponent(`/checkout/${code ?? ""}`);
}

/**
 * Resolve a tela do checkout na MESMA ordem da página:
 * loading → redireciona p/ login se anônimo → erro → não encontrada → não pertence ao usuário →
 * pronta. O checkout é autocontido: nome vem no passo 1 e CPF/CNPJ no passo de pagamento, então
 * não há mais redirect pra completar perfil.
 */
export function resolveCheckoutGate(a: CheckoutGateArgs): CheckoutGate {
  if (a.authLoading || a.bookingLoading) return { kind: "loading" };
  if (!a.hasSession) return { kind: "redirect", to: `/login?next=${checkoutNext(a.code)}` };
  if (a.hasError) return { kind: "error" };
  if (!a.booking) return { kind: "not-found" };
  if (a.booking.profile_id !== a.userId) return { kind: "not-owner" };
  return { kind: "ready" };
}

/**
 * true quando o checkout NÃO pode prosseguir e deve mostrar o estado "reserva expirou / refaça":
 * reserva `cancelled` (inclui a expiração, que o cron transforma em cancelada) OU pendente que já
 * passou do `expires_at`. Estados de sucesso/pós-reserva (confirmed/checked_in/completed/no_show)
 * não bloqueiam. Antes só a pendente-vencida era tratada, então uma reserva já cancelada caía num
 * checkout mudo (sem contador e sem aviso); este superset fecha esse furo.
 */
export function isCheckoutBlocked(
  expiresAt: string | null,
  status: string,
  now: Date = new Date(),
): boolean {
  if (status === "cancelled") return true;
  return status === "pending" && !!expiresAt && new Date(expiresAt) < now;
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
