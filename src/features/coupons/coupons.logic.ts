// Lógica pura dos cupons (catálogo da empresa). Sem React/Supabase → testável (Vitest).
import { formatBRL } from "@/lib/format";
import type { DiscountType } from "@/types/domain";

export type CouponFormValues = {
  code: string;
  description: string;
  discount_type: DiscountType;
  discount_value: number | null;
  valid_from: string; // "YYYY-MM-DD" ou "" (sem início)
  valid_until: string; // "YYYY-MM-DD" ou "" (sem fim)
  max_uses: number | null;
  is_active: boolean;
  sort_order: number | null;
  per_user_limit: number | null;
  min_amount: number | null;
  min_days: number | null;
  parking_type_ids: string[];
};

export type CouponUpsertArgs = {
  p_company_id: string;
  p_id: string | null;
  p_code: string;
  p_description: string | null;
  p_discount_type: DiscountType;
  p_discount_value: number;
  p_valid_from: string | null;
  p_valid_until: string | null;
  p_max_uses: number | null;
  p_is_active: boolean;
  p_sort_order: number;
  p_per_user_limit: number | null;
  p_min_amount: number | null;
  p_min_days: number | null;
  p_parking_type_ids: string[] | null;
};

export const EMPTY_COUPON_FORM: CouponFormValues = {
  code: "",
  description: "",
  discount_type: "percent",
  discount_value: null,
  valid_from: "",
  valid_until: "",
  max_uses: null,
  is_active: true,
  sort_order: 0,
  per_user_limit: null,
  min_amount: null,
  min_days: null,
  parking_type_ids: [],
};

/** Valida o form do cupom. Retorna a mensagem de erro ou `null` se válido. */
export function validateCouponForm(v: CouponFormValues): string | null {
  if (!v.code.trim()) return "Código do cupom é obrigatório.";
  const val = v.discount_value ?? 0;
  if (val <= 0) return "Informe um valor de desconto maior que zero.";
  if (v.discount_type === "percent" && val > 100) return "Desconto percentual não pode passar de 100%.";
  if (v.max_uses != null && v.max_uses <= 0) return "Limite de usos deve ser maior que zero.";
  if (v.per_user_limit != null && v.per_user_limit <= 0) return "Limite por usuário deve ser maior que zero.";
  if (v.min_days != null && v.min_days < 1) return "Diárias mínimas deve ser ao menos 1.";
  if (v.min_amount != null && v.min_amount < 0) return "Valor mínimo não pode ser negativo.";
  if (v.valid_from && v.valid_until && v.valid_until < v.valid_from)
    return "A validade final é anterior à inicial.";
  return null;
}

/** Monta os argumentos da RPC `operator_upsert_coupon`. */
export function buildCouponUpsertArgs(
  companyId: string,
  id: string | null,
  v: CouponFormValues,
): CouponUpsertArgs {
  return {
    p_company_id: companyId,
    p_id: id,
    p_code: v.code.trim().toUpperCase(),
    p_description: v.description.trim() || null,
    p_discount_type: v.discount_type,
    p_discount_value: v.discount_value ?? 0,
    p_valid_from: v.valid_from ? `${v.valid_from}T00:00:00` : null,
    p_valid_until: v.valid_until ? `${v.valid_until}T23:59:59` : null,
    p_max_uses: v.max_uses,
    p_is_active: v.is_active,
    p_sort_order: v.sort_order ?? 0,
    p_per_user_limit: v.per_user_limit,
    p_min_amount: v.min_amount,
    p_min_days: v.min_days,
    p_parking_type_ids: v.parking_type_ids.length ? v.parking_type_ids : null,
  };
}

/** Rótulo do desconto: "10% OFF" ou "R$ 5,00". */
export function formatDiscount(type: DiscountType, value: number): string {
  return type === "percent" ? `${value}% OFF` : formatBRL(value);
}

/** Rótulo de uso: "3 / 100" ou "3 / ∞". */
export function formatUsage(timesUsed: number, maxUses: number | null): string {
  return `${timesUsed} / ${maxUses ?? "∞"}`;
}

/** ISO (ou null) → "YYYY-MM-DD" para `<input type="date">`. */
export function isoToDateInput(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "";
}
