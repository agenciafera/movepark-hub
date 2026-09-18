// Lógica pura da carteira de cupons do cliente. Sem React e sem Supabase, para ser testável.
// O veredito de elegibilidade NUNCA nasce aqui: ele vem do banco (customer_coupon_wallet), porque
// a mesma regra precisa valer no preview e na hora de cobrar. Aqui só traduzimos o veredito.
import { formatBRL, formatDate } from "@/lib/format";

export type CouponScope = "platform" | "company";

export type WalletCoupon = {
  id: string;
  code: string;
  title: string | null;
  terms: string | null;
  discount_type: "percent" | "fixed";
  discount_value: number;
  max_discount_amount: number | null;
  min_amount: number | null;
  min_days: number | null;
  valid_until: string | null;
  scope: CouponScope;
  company_name: string | null;
  audience: string;
  is_redeemed: boolean;
  /** null = sem contexto de pedido: a tela mostra condições, não veredito. */
  is_eligible: boolean | null;
  reason: string | null;
  discount: number;
  is_best: boolean;
};

export type CouponWallet = {
  items: WalletCoupon[];
  has_order_context: boolean;
};

/**
 * `error_code` do banco para a frase que o cliente lê em "Por que não dá para usar".
 *
 * Cada frase diz a CONDIÇÃO, não o veredito: "Vale só na primeira reserva" ensina o que fazer,
 * "Cupom inválido" só fecha a porta. As três primeiras nasceram com a audiência (E3.3); as demais
 * já existiam no motor de cupom e estão aqui para a carteira falar a mesma língua do checkout.
 */
const MOTIVOS: Record<string, string> = {
  not_available_here: "Este estacionamento não aceita cupom",
  not_first_purchase: "Vale só na primeira reserva",
  not_second_purchase: "Vale só na segunda reserva",
  not_winback: "Este cupom é para quem está há mais tempo sem reservar",
  login_required: "Entre na sua conta para usar",
  no_stack: "Não acumula com a promoção desta reserva",
  min_days: "Vale para estadias mais longas",
  min_amount: "Vale para reservas de maior valor",
  already_used: "Você já usou este cupom",
  not_eligible_type: "Não vale para este tipo de vaga",
  not_yet_valid: "Este cupom ainda não começou a valer",
  expired: "Cupom expirado",
  exhausted: "Cupom esgotado",
  inactive: "Cupom indisponível",
  invalid: "Cupom inválido",
};

/** Motivo da indisponibilidade em pt-BR. Código desconhecido cai no genérico. */
export function couponUnavailableReason(code: string | null | undefined): string {
  if (!code) return MOTIVOS.invalid;
  return MOTIVOS[code] ?? MOTIVOS.invalid;
}

/** Erro do resgate ("Resgatar") para a frase do cliente. */
export function couponRedeemError(code: string | null | undefined): string {
  if (code === "login_required") return "Entre na sua conta para guardar o cupom";
  if (code && MOTIVOS[code]) return MOTIVOS[code];
  return "Não encontramos esse código";
}

/** Valor do desconto em destaque: "30% OFF" ou "R$ 15 OFF". */
export function couponAmountLabel(c: Pick<WalletCoupon, "discount_type" | "discount_value">): string {
  if (c.discount_type === "percent") return `${Math.round(c.discount_value)}% OFF`;
  return `${formatBRL(c.discount_value)} OFF`;
}

/**
 * Teto do percentual, o "Até R$ 40" da referência. Null quando não há teto ou quando o cupom é de
 * valor fixo (aí o próprio valor já é o teto e repetir confundiria).
 */
export function couponCapLabel(
  c: Pick<WalletCoupon, "discount_type" | "max_discount_amount">,
): string | null {
  if (c.discount_type !== "percent" || c.max_discount_amount == null) return null;
  return `até ${formatBRL(c.max_discount_amount)}`;
}

/** Quem oferece o cupom. Plataforma é a Movepark; o resto é o parceiro dono do código. */
export function couponIssuer(c: Pick<WalletCoupon, "scope" | "company_name">): string {
  return c.scope === "platform" ? "Movepark" : (c.company_name ?? "Parceiro");
}

/** "Válido até 21/09/2026". Null quando o cupom não expira. */
export function couponValidityLabel(c: Pick<WalletCoupon, "valid_until">): string | null {
  if (!c.valid_until) return null;
  return `Válido até ${formatDate(c.valid_until)}`;
}

/**
 * Separa a carteira nas duas seções da tela.
 *
 * Sem contexto de pedido (`is_eligible === null`) tudo cai em `available`: a tela está listando o
 * que a pessoa tem, e não julgando um pedido que ainda não existe. Chamar de "indisponível" um
 * cupom que só não foi avaliado seria mentira.
 */
export function splitWallet(items: WalletCoupon[]): {
  available: WalletCoupon[];
  unavailable: WalletCoupon[];
} {
  const available: WalletCoupon[] = [];
  const unavailable: WalletCoupon[] = [];
  for (const c of items) {
    if (c.is_eligible === false) unavailable.push(c);
    else available.push(c);
  }
  // Maior desconto primeiro dentro dos disponíveis: a decisão fica óbvia sem o cliente comparar.
  available.sort((a, b) => b.discount - a.discount);
  return { available, unavailable };
}

/** Código do cupom aplicado neste pedido, se houver. */
export function appliedCoupon(items: WalletCoupon[], code: string | null): WalletCoupon | null {
  if (!code) return null;
  const up = code.trim().toUpperCase();
  return items.find((c) => c.code === up) ?? null;
}

/** Normaliza o que a pessoa digitou no campo de resgate. Null se vazio. */
export function normalizeRedeemInput(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().toUpperCase();
  return v || null;
}
