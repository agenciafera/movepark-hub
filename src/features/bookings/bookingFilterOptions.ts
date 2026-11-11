/**
 * Opções dos filtros da lista de reservas, iguais no Manager e no Operator (13/10/2026). Valem para
 * as duas origens: no site, a forma de pagamento sai do código da forma de pagamento do pedido e o
 * comparecimento do que o site registrou.
 */
import type { PaymentMethodFilter } from "./bookingList.logic";

export const PAYMENT_OPTIONS: { value: PaymentMethodFilter | "all"; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "pix", label: "PIX" },
  { value: "card", label: "Cartão de crédito" },
  { value: "none", label: "Sem pagamento" },
];

export type AttendanceFilter = "all" | "compareceu" | "no_show" | "pendente";

export const ATTENDANCE_OPTIONS: { value: AttendanceFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "compareceu", label: "Chegou" },
  { value: "pendente", label: "Ainda não chegou" },
  { value: "no_show", label: "Não veio" },
];

export type PcdFilter = "all" | "sim" | "nao";

export const PCD_OPTIONS: { value: PcdFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "sim", label: "Com PCD" },
  { value: "nao", label: "Sem PCD" },
];

export function pcdParam(v: string): boolean | undefined {
  return v === "sim" ? true : v === "nao" ? false : undefined;
}

export function attendanceParam(v: string): "compareceu" | "no_show" | "pendente" | undefined {
  return v === "compareceu" || v === "no_show" || v === "pendente" ? v : undefined;
}

/** Afiliado só existe no site white-label: quem não tem site não vê este filtro. */
export const AFFILIATE_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "sim", label: "De afiliado" },
  { value: "nao", label: "Sem afiliado" },
];

export const PLATE_CHANGE_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "sim", label: "Com troca de placa" },
  { value: "nao", label: "Sem troca de placa" },
];

/** "sim"/"nao" do endereço para o filtro booleano do servidor. */
export function yesNoParam(v: string): boolean | undefined {
  return v === "sim" ? true : v === "nao" ? false : undefined;
}

/**
 * Opções do select de adicional: as duas genéricas e, depois, os adicionais que existem no recorte
 * (vindos do servidor). "all" não filtra.
 */
export function addOnOptions(names: string[]): { value: string; label: string }[] {
  return [
    { value: "all", label: "Todas" },
    { value: "any", label: "Com algum adicional" },
    { value: "none", label: "Sem adicional" },
    ...names
      .filter((n) => n !== "all" && n !== "any" && n !== "none")
      .map((n) => ({ value: n, label: n })),
  ];
}

export function addOnParam(v: string): string | undefined {
  return v && v !== "all" ? v : undefined;
}

export function utmOptions(sources: string[]): { value: string; label: string }[] {
  return [
    { value: "all", label: "Todas" },
    ...sources.filter((s) => s !== "all").map((s) => ({ value: s, label: s })),
  ];
}

/** Filtros que moram em "Mais filtros" (11/11/2026): contam no selo do botão e abrem o painel. */
export const MORE_FILTER_KEYS = ["pcd", "adicional", "campanha", "placa", "afiliado"] as const;

/**
 * Quantos filtros de "Mais filtros" estão ligados. Quem não tem white-label passa as chaves sem
 * `afiliado`, porque o filtro nem aparece e um `?afiliado=` perdido no link não pode contar.
 */
export function countActiveFilters(
  values: Record<string, string>,
  keys: readonly string[] = MORE_FILTER_KEYS,
): number {
  return keys.filter((k) => values[k] !== undefined && values[k] !== "all").length;
}
