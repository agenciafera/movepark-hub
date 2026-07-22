// Lógica pura dos descontos automáticos. Sem React/Supabase → testável (Vitest).
import { formatBRL, formatDate } from "@/lib/format";
import type { DiscountType } from "@/types/domain";

export type DiscountFormValues = {
  name: string;
  description: string;
  location_id: string | null; // null = todas as unidades
  discount_type: DiscountType;
  discount_value: number | null;
  valid_from: string; // "YYYY-MM-DD" ou ""
  valid_until: string;
  min_days: number | null;
  min_amount: number | null;
  advance_days: number | null;
  allow_coupon_stack: boolean;
  priority: number | null;
  is_active: boolean;
  sort_order: number | null;
  parking_type_ids: string[];
};

export type DiscountUpsertArgs = {
  p_company_id: string;
  p_id: string | null;
  p_location_id: string | null;
  p_name: string;
  p_description: string | null;
  p_discount_type: DiscountType;
  p_discount_value: number;
  p_valid_from: string | null;
  p_valid_until: string | null;
  p_min_days: number | null;
  p_min_amount: number | null;
  p_advance_days: number | null;
  p_allow_coupon_stack: boolean;
  p_priority: number;
  p_is_active: boolean;
  p_sort_order: number;
  p_parking_type_ids: string[] | null;
};

export const EMPTY_DISCOUNT_FORM: DiscountFormValues = {
  name: "",
  description: "",
  location_id: null,
  discount_type: "percent",
  discount_value: null,
  valid_from: "",
  valid_until: "",
  min_days: null,
  min_amount: null,
  advance_days: null,
  allow_coupon_stack: true,
  priority: 0,
  is_active: true,
  sort_order: 0,
  parking_type_ids: [],
};

/** Valida o form do desconto. Retorna a mensagem de erro ou `null` se válido. */
export function validateDiscountForm(v: DiscountFormValues): string | null {
  if (!v.name.trim()) return "Nome do desconto é obrigatório.";
  const val = v.discount_value ?? 0;
  if (val <= 0) return "Informe um valor de desconto maior que zero.";
  if (v.discount_type === "percent" && val > 100) return "Desconto percentual não pode passar de 100%.";
  if (v.min_days != null && v.min_days < 1) return "Diárias mínimas deve ser ao menos 1.";
  if (v.min_amount != null && v.min_amount < 0) return "Valor mínimo não pode ser negativo.";
  if (v.advance_days != null && v.advance_days < 0) return "Antecedência não pode ser negativa.";
  if (v.valid_from && v.valid_until && v.valid_until < v.valid_from)
    return "A validade final é anterior à inicial.";
  return null;
}

/** Monta os argumentos da RPC `operator_upsert_discount`. */
export function buildDiscountUpsertArgs(
  companyId: string,
  id: string | null,
  v: DiscountFormValues,
): DiscountUpsertArgs {
  return {
    p_company_id: companyId,
    p_id: id,
    p_location_id: v.location_id,
    p_name: v.name.trim(),
    p_description: v.description.trim() || null,
    p_discount_type: v.discount_type,
    p_discount_value: v.discount_value ?? 0,
    p_valid_from: v.valid_from ? `${v.valid_from}T00:00:00` : null,
    p_valid_until: v.valid_until ? `${v.valid_until}T23:59:59` : null,
    p_min_days: v.min_days,
    p_min_amount: v.min_amount,
    p_advance_days: v.advance_days,
    p_allow_coupon_stack: v.allow_coupon_stack,
    p_priority: v.priority ?? 0,
    p_is_active: v.is_active,
    p_sort_order: v.sort_order ?? 0,
    p_parking_type_ids: v.parking_type_ids.length ? v.parking_type_ids : null,
  };
}

/** Rótulo do desconto: "20% OFF" ou "R$ 5,00". */
export function formatDiscountValue(type: DiscountType, value: number): string {
  return type === "percent" ? `${value}% OFF` : formatBRL(value);
}

/** Rótulo da janela de validade. */
export function discountWindowLabel(validFrom: string | null, validUntil: string | null): string {
  const from = validFrom ? formatDate(validFrom) : null;
  const until = validUntil ? formatDate(validUntil) : null;
  if (!from && !until) return "Sempre";
  return `${from ?? "-"} → ${until ?? "-"}`;
}

/** ISO (ou null) → "YYYY-MM-DD" para `<input type="date">`. */
export function isoToDateInput(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "";
}
