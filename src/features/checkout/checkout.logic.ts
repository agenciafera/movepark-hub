// Lógica pura do orquestrador de checkout (testável sem React): decide o que renderizar
// (gate de auth/perfil/erro/ownership), se a reserva pendente expirou, o auto-avanço pro
// passo de confirmação e o polling de confirmação automática. A página (`routes/checkout.tsx`)
// e o hook (`api.useCheckoutBooking`) só consomem estas funções.

import { isValidPhoneNumber } from "react-phone-number-input";

export type CheckoutStep = 1 | 2 | 3 | 4 | 5;

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
  if (status === "cancelled" || status === "expired") return true;
  return status === "pending" && !!expiresAt && new Date(expiresAt) < now;
}

export interface InitialStepArgs {
  /** O link pediu para cair no pagamento (handoff de reserva por agente, ?pay=1). */
  requestedPay: boolean;
  /** O que o passo 1 coleta já está na reserva: nome, telefone e e-mail do titular. */
  hasIdentity: boolean;
  /** O veículo (passo 2) já está na reserva. */
  hasVehicle: boolean;
}

/**
 * Passo inicial do checkout. Com o link do agente (?pay=1), pula o que já está preenchido na
 * reserva e cai no primeiro passo que falta, de preferência o pagamento. Deriva do estado, nunca
 * confia só no parâmetro: sem nome, telefone ou e-mail, começa no passo 1.
 *
 * O CPF não entra na conta porque quem o pede é o próprio pagamento. Os Termos também não: quando
 * a pessoa pula o passo 1, o aceite (clickwrap) aparece colado ao botão de pagar e é gravado antes
 * da cobrança (Step4Payment). Até 01/10/2026 exigia CPF e Termos para pular, e o link do agente
 * sempre caía no passo 1, porque o agente não coleta nenhum dos dois.
 *
 * Pular direto pro pagamento também pula os adicionais, e é o certo: quem chega por esse link já
 * fechou o que queria, e interromper com uma oferta seria empurrada.
 */
export function resolveInitialStep(a: InitialStepArgs): CheckoutStep {
  if (!a.requestedPay || !a.hasIdentity) return 1;
  return a.hasVehicle ? 4 : 2;
}

/** Passo pra onde auto-avançar quando o pagamento confirma (confirmação); null = não mexe. */
export function nextStepOnConfirm(status: string, current: CheckoutStep): CheckoutStep | null {
  return status === "confirmed" && current !== 5 ? 5 : null;
}

/**
 * Sequência de passos que a unidade realmente tem. O de adicionais (3) só entra
 * quando ela oferece algum: um passo que abre vazio e se pula sozinho ainda assim
 * apareceria no medidor de progresso, prometendo uma escolha que não existe.
 *
 * O id do passo é estável (o 4 é sempre pagamento) para a máquina de estados não
 * mudar de significado. Quem renumera pra 1..n é o Stepper, na exibição.
 */
export function visibleSteps(hasAddons: boolean): CheckoutStep[] {
  return hasAddons ? [1, 2, 3, 4, 5] : [1, 2, 4, 5];
}

/**
 * Próximo passo da sequência visível. Aceita um passo fora dela (o catálogo pode
 * esvaziar com a tela aberta) e devolve o primeiro adiante, em vez de travar.
 */
export function stepAfter(current: CheckoutStep, hasAddons: boolean): CheckoutStep {
  return visibleSteps(hasAddons).find((s) => s > current) ?? current;
}

/** Passo anterior da sequência visível, com a mesma tolerância do `stepAfter`. */
export function stepBefore(current: CheckoutStep, hasAddons: boolean): CheckoutStep {
  const anteriores = visibleSteps(hasAddons).filter((s) => s < current);
  return anteriores[anteriores.length - 1] ?? current;
}

/** Polling: recarrega enquanto a reserva ou o último pagamento estiverem pendentes. */
export function shouldPollCheckout(
  status: string | null | undefined,
  paymentStatus: string | null | undefined,
): boolean {
  return status === "pending" || paymentStatus === "pending";
}

/** Cupom aplicado na reserva, do jeito que o resumo do checkout mostra. */
export type CheckoutCoupon = { code: string; discount_applied: number };

/**
 * Lê o cupom aplicado de dentro da própria reserva.
 *
 * A fonte é o snapshot `price_breakdown.coupon`, que `apply_coupon_to_booking` grava junto com o
 * total. O embed `booking_coupon → coupon` não serve para o cliente: a tabela `coupon` só é
 * legível por admin e operador (a policy pública caiu no E3.3 para não expor os códigos), então o
 * join volta `null` e o resumo cobrava o desconto sem mostrar a linha. O `discount_applied` do
 * `booking_coupon` ainda é preferido para o valor, por ser o snapshot contábil.
 */
export function resolveBookingCoupon(
  priceBreakdownCoupon: { code?: string | null; discount?: number | string | null } | null | undefined,
  bookingCoupon: { discount_applied?: number | string | null } | null | undefined,
): CheckoutCoupon | null {
  const code = priceBreakdownCoupon?.code;
  if (!code) return null;
  const discount = Number(bookingCoupon?.discount_applied ?? priceBreakdownCoupon?.discount ?? 0);
  if (!(discount > 0)) return null;
  return { code: code.toUpperCase(), discount_applied: discount };
}
