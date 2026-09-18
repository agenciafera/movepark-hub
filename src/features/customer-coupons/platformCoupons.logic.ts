// Lógica pura da campanha de plataforma (cupom da Movepark). Sem React e sem Supabase.
//
// Diferença do cupom de parceiro (`features/coupons`): aqui a Movepark banca o desconto, então a
// validação é mais dura em dois pontos que custam dinheiro: percentual SEM TETO e audiência
// `winback` sem régua de dias. Os dois também são barrados no banco; duplicar aqui é para o gestor
// descobrir antes de salvar, e não por um erro de Postgres.
import type { DiscountType } from "@/types/domain";

export type CouponAudience =
  | "code_only"
  | "public"
  | "first_purchase"
  | "second_purchase"
  | "winback";

export type PlatformCouponFormValues = {
  code: string;
  title: string;
  description: string;
  terms: string;
  discount_type: DiscountType;
  discount_value: number | null;
  max_discount_amount: number | null;
  audience: CouponAudience;
  audience_inactive_days: number | null;
  valid_from: string; // "YYYY-MM-DD" ou "" (sem início)
  valid_until: string; // "YYYY-MM-DD" ou "" (sem fim)
  max_uses: number | null;
  per_user_limit: number | null;
  min_amount: number | null;
  min_days: number | null;
  is_active: boolean;
  is_advertised: boolean;
  sort_order: number | null;
};

export type PlatformCouponUpsertArgs = {
  p_id: string | null;
  p_code: string;
  p_title: string | null;
  p_description: string | null;
  p_terms: string | null;
  p_discount_type: DiscountType;
  p_discount_value: number;
  p_max_discount_amount: number | null;
  p_audience: CouponAudience;
  p_audience_inactive_days: number | null;
  p_valid_from: string | null;
  p_valid_until: string | null;
  p_max_uses: number | null;
  p_per_user_limit: number | null;
  p_min_amount: number | null;
  p_min_days: number | null;
  p_is_active: boolean;
  p_is_advertised: boolean;
  p_sort_order: number;
};

export const EMPTY_PLATFORM_COUPON_FORM: PlatformCouponFormValues = {
  code: "",
  title: "",
  description: "",
  terms: "",
  discount_type: "percent",
  discount_value: null,
  max_discount_amount: null,
  audience: "code_only",
  audience_inactive_days: null,
  valid_from: "",
  valid_until: "",
  max_uses: null,
  per_user_limit: null,
  min_amount: null,
  min_days: null,
  is_active: true,
  is_advertised: false,
  sort_order: 0,
};

/** Rótulo de cada audiência no formulário. */
export const AUDIENCE_LABELS: Record<CouponAudience, string> = {
  code_only: "Só por código",
  public: "Qualquer cliente",
  first_purchase: "Primeira reserva",
  second_purchase: "Segunda reserva",
  winback: "Sumiu há um tempo",
};

/** O que cada audiência significa, para o gestor não precisar adivinhar quem vai receber. */
export const AUDIENCE_HINTS: Record<CouponAudience, string> = {
  code_only: "Não aparece na carteira. Só vale para quem digitar o código.",
  public: "Aparece na carteira de todo cliente logado.",
  first_purchase: "Quem ainda não tem nenhuma reserva paga.",
  second_purchase: "Quem tem exatamente uma reserva paga.",
  winback: "Quem já reservou e passou o número de dias abaixo sem voltar.",
};

/**
 * Valida o formulário. Devolve a mensagem de erro ou `null`.
 *
 * O teto do percentual é obrigatório porque a Movepark banca: 30% de uma estadia de 20 diárias
 * passa da comissão, e aí a reserva sai no prejuízo (o split recusa e a cobrança falha).
 */
export function validatePlatformCouponForm(v: PlatformCouponFormValues): string | null {
  if (!v.code.trim()) return "Informe o código do cupom.";
  if (/\s/.test(v.code.trim())) return "O código não pode ter espaço.";

  const valor = v.discount_value ?? 0;
  if (valor <= 0) return "Informe um desconto maior que zero.";

  if (v.discount_type === "percent") {
    if (valor > 100) return "Desconto percentual não pode passar de 100%.";
    if (v.max_discount_amount == null || v.max_discount_amount <= 0) {
      return "Cupom percentual precisa de teto. Sem ele, a Movepark banca a diferença.";
    }
  } else if (v.max_discount_amount != null) {
    return "Teto só existe em cupom percentual. No valor fixo, o próprio valor já é o limite.";
  }

  if (v.audience === "winback") {
    if (v.audience_inactive_days == null || v.audience_inactive_days < 1) {
      return "Informe a partir de quantos dias sem reservar o cupom passa a valer.";
    }
  } else if (v.audience_inactive_days != null) {
    return "Dias sem reservar só valem na audiência “Sumiu há um tempo”.";
  }

  if (v.max_uses != null && v.max_uses <= 0) return "Limite de usos deve ser maior que zero.";
  if (v.per_user_limit != null && v.per_user_limit <= 0)
    return "Limite por cliente deve ser maior que zero.";
  if (v.min_days != null && v.min_days < 1) return "Diárias mínimas deve ser ao menos 1.";
  if (v.min_amount != null && v.min_amount < 0) return "Valor mínimo não pode ser negativo.";
  if (v.valid_from && v.valid_until && v.valid_until < v.valid_from)
    return "A validade final é anterior à inicial.";
  return null;
}

/** Texto vazio vira null: string em branco no banco polui a carteira com linha em branco. */
function textoOuNulo(s: string): string | null {
  const t = s.trim();
  return t === "" ? null : t;
}

/** Monta os argumentos de `manager_upsert_platform_coupon`. */
export function buildPlatformCouponArgs(
  id: string | null,
  v: PlatformCouponFormValues,
): PlatformCouponUpsertArgs {
  return {
    p_id: id,
    p_code: v.code.trim().toUpperCase(),
    p_title: textoOuNulo(v.title),
    p_description: textoOuNulo(v.description),
    p_terms: textoOuNulo(v.terms),
    p_discount_type: v.discount_type,
    p_discount_value: v.discount_value ?? 0,
    p_max_discount_amount: v.discount_type === "percent" ? v.max_discount_amount : null,
    p_audience: v.audience,
    p_audience_inactive_days: v.audience === "winback" ? v.audience_inactive_days : null,
    p_valid_from: v.valid_from ? new Date(`${v.valid_from}T00:00:00`).toISOString() : null,
    p_valid_until: v.valid_until ? new Date(`${v.valid_until}T23:59:59`).toISOString() : null,
    p_max_uses: v.max_uses,
    p_per_user_limit: v.per_user_limit,
    p_min_amount: v.min_amount,
    p_min_days: v.min_days,
    p_is_active: v.is_active,
    p_is_advertised: v.is_advertised,
    p_sort_order: v.sort_order ?? 0,
  };
}

/** Linha do banco de volta para o formulário, na edição. */
export function platformCouponToForm(c: {
  code: string;
  title: string | null;
  description: string | null;
  terms: string | null;
  discount_type: DiscountType;
  discount_value: number | string;
  max_discount_amount: number | string | null;
  audience: string;
  audience_inactive_days: number | null;
  valid_from: string | null;
  valid_until: string | null;
  max_uses: number | null;
  per_user_limit: number | null;
  min_amount: number | string | null;
  min_days: number | null;
  is_active: boolean;
  is_advertised: boolean;
  sort_order: number;
}): PlatformCouponFormValues {
  const dia = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
  const num = (x: number | string | null) => (x == null ? null : Number(x));
  return {
    code: c.code,
    title: c.title ?? "",
    description: c.description ?? "",
    terms: c.terms ?? "",
    discount_type: c.discount_type,
    discount_value: num(c.discount_value),
    max_discount_amount: num(c.max_discount_amount),
    audience: c.audience as CouponAudience,
    audience_inactive_days: c.audience_inactive_days,
    valid_from: dia(c.valid_from),
    valid_until: dia(c.valid_until),
    max_uses: c.max_uses,
    per_user_limit: c.per_user_limit,
    min_amount: num(c.min_amount),
    min_days: c.min_days,
    is_active: c.is_active,
    is_advertised: c.is_advertised,
    sort_order: c.sort_order,
  };
}

/** Quanto do limite de usos já foi consumido, para a lista mostrar o fôlego da campanha. */
export function usageLabel(times_used: number, max_uses: number | null): string {
  if (max_uses == null) return `${times_used} uso${times_used === 1 ? "" : "s"}`;
  return `${times_used} de ${max_uses}`;
}
