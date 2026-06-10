// Lógica pura do cupom no checkout/listing. Sem React/Supabase → testável (Vitest).
import { formatBRL } from "@/lib/format";

export type CouponPreview = {
  valid: boolean;
  discount: number;
  subtotal: number;
  total_preview: number;
  code: string;
  error_code: string | null;
  discount_type?: "percent" | "fixed";
  discount_value?: number;
};

const MESSAGES: Record<string, string> = {
  invalid: "Cupom inválido ou expirado",
  inactive: "Cupom inválido ou expirado",
  not_eligible_type: "Cupom não vale para este tipo de vaga",
  not_yet_valid: "Este cupom ainda não está válido",
  expired: "Cupom expirado",
  exhausted: "Cupom esgotado",
  min_days: "Cupom válido só para estadias mais longas",
  min_amount: "Cupom válido só para reservas de maior valor",
  already_used: "Você já utilizou este cupom",
};

/** error_code do backend → mensagem pt-BR para o cliente. */
export function couponErrorMessage(errorCode: string | null | undefined): string {
  if (!errorCode) return MESSAGES.invalid;
  return MESSAGES[errorCode] ?? MESSAGES.invalid;
}

/** Rótulo curto do desconto aplicado: "10% OFF" / "−R$ 5,00". */
export function couponDiscountLabel(p: {
  discount_type?: "percent" | "fixed";
  discount_value?: number;
  discount: number;
}): string {
  if (p.discount_type === "percent" && p.discount_value != null) return `${p.discount_value}% OFF`;
  return `−${formatBRL(p.discount)}`;
}
