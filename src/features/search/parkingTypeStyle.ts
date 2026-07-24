/**
 * Cor do rótulo de tipo de vaga no card, mapeada num ÚNICO lugar: todos os cards
 * (home, /search, /destinos) consomem daqui, então cada tipo tem a mesma cor onde
 * quer que apareça. O chip usa tinta clara de fundo + texto escuro do mesmo tom,
 * com contraste AA no rótulo.
 *
 * Nenhuma cor da paleta é o violeta da marca (`mp-primary`/`mp-indigo`): ele é
 * reservado a elemento acionável (regra do `harmonizar-paginas`), não a badge
 * estático. Também não reaproveita os tokens de status (`badge-active/pending/
 * cancelled`), que carregam significado de estado e confundiriam com o tipo.
 *
 * As classes são strings literais completas de propósito: é assim que o scanner do
 * Tailwind as inclui no build (classe montada por concatenação não seria detectada).
 *
 * O enum tem 6 tipos hoje (a atividade citava só 3): cada um ganha sua cor; um tipo
 * novo cai no fallback neutro até receber a sua aqui.
 */
const PARKING_TYPE_CHIP: Record<string, string> = {
  covered: "bg-blue-50 text-blue-700",
  uncovered: "bg-amber-50 text-amber-800",
  valet: "bg-teal-50 text-teal-700",
  garage: "bg-slate-100 text-slate-700",
  motorcycle: "bg-rose-50 text-rose-700",
  premium: "bg-emerald-50 text-emerald-700",
};

/** Neutro para tipo sem cor própria: não quebra o layout, só não destaca. */
export const PARKING_TYPE_CHIP_FALLBACK = "bg-surface-strong text-ink";

/** Classes de cor do chip de tipo de vaga a partir do código do `parking_type`. */
export function parkingTypeChipClass(code: string | null | undefined): string {
  return (code && PARKING_TYPE_CHIP[code]) || PARKING_TYPE_CHIP_FALLBACK;
}
