// A matriz de benefícios das tarifas, montada a partir do CATÁLOGO (`get_unit_fares`), e não de
// booleanos escritos no componente. Antes, o comparativo e os tooltips do card tinham a matriz
// cravada no código: mudar um benefício ou a janela de cancelamento em Manager › Tarifas trocava
// o que a reserva gravava, mas a ficha continuava prometendo o antigo. Lógica pura, sem React.
//
// Catálogo muda o futuro, nunca o passado: quem já reservou decide pelos `fare_*` da reserva.

import { cancelWindowLabel, FARE_BENEFIT_LABELS, type FareBenefitKey, type FareBenefits, type FareOption, type FareTier } from "@/lib/fares";

/** Ids da UI ("basic") contra os do banco ("basica"). */
export type FareUiTier = "basic" | "flex" | "superflex";
export const UI_TIER_OF: Record<FareTier, FareUiTier> = { basica: "basic", flex: "flex", superflex: "superflex" };
const TIER_ORDER: FareTier[] = ["basica", "flex", "superflex"];

/**
 * O catálogo de referência, usado só até `get_unit_fares` responder (ou quando falha). É uma
 * cópia do seed de 30/06/2026; a verdade é o banco.
 */
export const DEFAULT_CATALOG: FareOption[] = [
  { tier: "basica", label: "Básica", price_cents: 0, is_popular: false, sort_order: 0, cancel_window_minutes: 1440,
    benefits: { guaranteed_spot: true, email_confirmation: true, free_cancellation: true } },
  { tier: "flex", label: "Flex", price_cents: 1290, is_popular: true, sort_order: 1, cancel_window_minutes: 1440,
    benefits: { guaranteed_spot: true, email_confirmation: true, free_cancellation: true, notifications_sms: true, plate_change: true, date_change: true } },
  { tier: "superflex", label: "Superflex", price_cents: 2490, is_popular: false, sort_order: 2, cancel_window_minutes: 1,
    benefits: { guaranteed_spot: true, email_confirmation: true, free_cancellation: true, notifications_sms: true, plate_change: true, date_change: true, flight_delay_protection: true, priority_support: true } },
];

/** Benefícios que aparecem como linha da matriz. Cancelamento é janela (linha própria); vaga garantida vale em qualquer tarifa e fica fora do grid. */
const GRID_BENEFITS: FareBenefitKey[] = FARE_BENEFIT_LABELS.map((b) => b.key).filter(
  (k) => k !== "free_cancellation" && k !== "guaranteed_spot",
);

export type MatrixRow = { label: string; included: boolean[] };
export type MatrixTier = { id: FareUiTier; tier: FareTier; label: string; priceCents: number; popular: boolean };

export function sortCatalog(fares: FareOption[]): FareOption[] {
  return [...fares].sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier));
}

/** Rótulo curto da janela ("até 24h antes", "até 1 min antes"); nulo sem cancelamento grátis. */
export function cancelLabelOf(fare: Pick<FareOption, "cancel_window_minutes">): string | null {
  return cancelWindowLabel(fare.cancel_window_minutes);
}

/**
 * Linhas da matriz. Cancelamento vira uma linha por janela distinta (da maior para a menor):
 * "Cancelamento grátis até 24h antes" marca quem tem janela de 24h ou melhor; "até 1 min antes"
 * só quem tem 1 min. Tarifa sem janela não marca nenhuma.
 */
export function buildFareMatrix(fares: FareOption[]): { tiers: MatrixTier[]; rows: MatrixRow[] } {
  const cat = sortCatalog(fares.length ? fares : DEFAULT_CATALOG);
  const tiers: MatrixTier[] = cat.map((f) => ({
    id: UI_TIER_OF[f.tier], tier: f.tier, label: f.label, priceCents: f.price_cents, popular: f.is_popular,
  }));
  const windows = [...new Set(cat.map((f) => f.cancel_window_minutes).filter((w): w is number => w != null))].sort((a, b) => b - a);
  const rows: MatrixRow[] = windows.map((w) => ({
    label: `Cancelamento grátis ${cancelWindowLabel(w)}`,
    included: cat.map((f) => f.cancel_window_minutes != null && f.cancel_window_minutes <= w),
  }));
  for (const key of GRID_BENEFITS) {
    const label = FARE_BENEFIT_LABELS.find((b) => b.key === key)!.label;
    const included = cat.map((f) => f.benefits?.[key] === true);
    if (included.some(Boolean)) rows.push({ label, included });
  }
  return { tiers, rows };
}

/** O que a tarifa oferece e a anterior não: é o que o tooltip do card lista depois de "Tudo da X". */
function extraBenefits(fare: FareBenefits | undefined, previous: FareBenefits | undefined): FareBenefitKey[] {
  return GRID_BENEFITS.filter((k) => fare?.[k] === true && previous?.[k] !== true);
}

export type FarePresentation = {
  /** Linhas do tooltip do seletor. */
  tooltip: string[];
  /** Selo curto no card e no CTA fixo do mobile. */
  badgeText: string;
  /** Linha completa sob o seletor. */
  cancellationLine: string;
};

/**
 * Texto do card para uma tarifa, derivado do catálogo. A primeira tarifa lista tudo que tem; as
 * seguintes dizem "Tudo da <anterior>" mais o que acrescentam. Cancelamento entra pela janela.
 */
export function farePresentation(fare: FareOption, previous: FareOption | null): FarePresentation {
  const cancel = cancelLabelOf(fare);
  const cancelShort = cancel ? `Cancele grátis ${cancel}` : "Sem cancelamento grátis";
  const badgeText = cancel ? `Cancelamento grátis ${cancel}` : "Sem cancelamento grátis";
  const lines: string[] = [];
  if (previous) {
    lines.push(`Tudo da ${previous.label}`);
    if (cancel && fare.cancel_window_minutes !== previous.cancel_window_minutes) lines.push(cancelShort);
    for (const k of extraBenefits(fare.benefits, previous.benefits)) lines.push(FARE_BENEFIT_LABELS.find((b) => b.key === k)!.label);
  } else {
    lines.push(cancelShort);
    for (const k of GRID_BENEFITS) if (fare.benefits?.[k]) lines.push(FARE_BENEFIT_LABELS.find((b) => b.key === k)!.label);
    if (fare.benefits?.guaranteed_spot) lines.push("Vaga garantida");
  }
  const extras: string[] = [];
  if (fare.benefits?.plate_change) extras.push("troca de placa liberada");
  const cancellationLine = [badgeText.replace("Cancelamento grátis", "Cancelamento grátis"), ...extras].join(" · ");
  return { tooltip: lines, badgeText, cancellationLine };
}

/** A janela da Básica, para a barra de confiança e o resumo SSG ("até 24h antes"). */
export function basicCancelLabel(fares: FareOption[] | null | undefined): string | null {
  const cat = fares?.length ? fares : DEFAULT_CATALOG;
  const basica = cat.find((f) => f.tier === "basica") ?? sortCatalog(cat)[0];
  return basica ? cancelLabelOf(basica) : null;
}
