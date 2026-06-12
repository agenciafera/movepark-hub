import type { MinimumStayUnit } from "@/types/domain";

export const MIN_STAY_UNITS: { value: MinimumStayUnit; label: string }[] = [
  { value: "minutes", label: "minutos" },
  { value: "hours", label: "horas" },
  { value: "days", label: "diárias" },
  { value: "months", label: "meses" },
];

/** Estado do formulário (strings para inputs controlados). */
export type CapacityRulesValues = {
  near_capacity_threshold: string;
  near_capacity_message: string;
  has_minimum_stay: boolean;
  minimum_stay_value: string;
  minimum_stay_unit: MinimumStayUnit;
  has_minimum_date: boolean;
  minimum_date: string;
};

/** Patch enviado ao update da location_parking_type. */
export type CapacityRulesPatch = {
  near_capacity_threshold: number | null;
  near_capacity_message: string | null;
  has_minimum_stay: boolean;
  minimum_stay_value: number | null;
  minimum_stay_unit: MinimumStayUnit | null;
  has_minimum_date: boolean;
  minimum_date: string | null;
};

type LptLike = {
  near_capacity_threshold: number | null;
  near_capacity_message: string | null;
  has_minimum_stay: boolean;
  minimum_stay_value: number | null;
  minimum_stay_unit: MinimumStayUnit | null;
  has_minimum_date: boolean;
  minimum_date: string | null;
};

/** Inicializa o form a partir da linha atual. */
export function capacityRulesFromLpt(lpt: LptLike): CapacityRulesValues {
  return {
    near_capacity_threshold:
      lpt.near_capacity_threshold != null ? String(lpt.near_capacity_threshold) : "",
    near_capacity_message: lpt.near_capacity_message ?? "",
    has_minimum_stay: lpt.has_minimum_stay,
    minimum_stay_value: lpt.minimum_stay_value != null ? String(lpt.minimum_stay_value) : "",
    minimum_stay_unit: lpt.minimum_stay_unit ?? "days",
    has_minimum_date: lpt.has_minimum_date,
    minimum_date: lpt.minimum_date ?? "",
  };
}

/** Retorna mensagem de erro de validação, ou null se válido. */
export function validateCapacityRules(v: CapacityRulesValues): string | null {
  const t = v.near_capacity_threshold.trim();
  if (t !== "") {
    const n = Number(t);
    if (!Number.isInteger(n) || n < 0) {
      return "O limite de quase-lotação deve ser um inteiro ≥ 0.";
    }
  }
  if (v.has_minimum_stay) {
    const n = Number(v.minimum_stay_value);
    if (!Number.isInteger(n) || n < 1) {
      return "A estadia mínima deve ser um inteiro ≥ 1.";
    }
  }
  if (v.has_minimum_date && v.minimum_date.trim() === "") {
    return "Informe a data mínima de entrada.";
  }
  return null;
}

/** Constrói o patch (campos desligados viram null). */
export function buildCapacityRulesPatch(v: CapacityRulesValues): CapacityRulesPatch {
  const threshold = v.near_capacity_threshold.trim();
  const message = v.near_capacity_message.trim();
  return {
    near_capacity_threshold: threshold === "" ? null : Number(threshold),
    near_capacity_message: message === "" ? null : message,
    has_minimum_stay: v.has_minimum_stay,
    minimum_stay_value: v.has_minimum_stay ? Number(v.minimum_stay_value) : null,
    minimum_stay_unit: v.has_minimum_stay ? v.minimum_stay_unit : null,
    has_minimum_date: v.has_minimum_date,
    minimum_date: v.has_minimum_date && v.minimum_date.trim() !== "" ? v.minimum_date : null,
  };
}
