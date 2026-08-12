/**
 * Estadia mínima: qual é a menor duração que um lote de fato vende.
 *
 * A busca simula o preço para a janela pedida e descarta quem não tem preço. Isso é
 * certo quando o cliente escolheu as datas, mas mata a vitrine: a página de destino
 * monta a lista com uma janela fixa (D+7 por 2 diárias), e quem só vende a partir de 3
 * diárias sumia da página inteira. Foi o que aconteceu com Abbapark e Nationpark, que
 * respondem sozinhos pelo destino CWB: a página dizia "ainda não temos reserva online"
 * com duas unidades ativas e precificadas no catálogo.
 *
 * Com `price_mode: "from"` a busca deixa de descartar e passa a mostrar o preço da menor
 * estadia vendável, junto com a duração usada, para o card não prometer um preço de 2
 * diárias que ninguém vende.
 */

/** O que a query em lote traz por lote sem preço na janela pedida. */
export type MinStayRow = {
  id: string;
  has_minimum_stay?: boolean | null;
  minimum_stay_value?: number | null;
  minimum_stay_unit?: string | null;
  pricing_rule?:
    | { pricing_tier?: { from_day: number; is_old_price: boolean }[] | null }
    | { pricing_tier?: { from_day: number; is_old_price: boolean }[] | null }[]
    | null;
};

function firstRule(row: MinStayRow) {
  const r = row.pricing_rule;
  if (!r) return null;
  return Array.isArray(r) ? (r[0] ?? null) : r;
}

/**
 * Menor duração em diárias que o lote vende, ou `null` quando nada indica um piso.
 *
 * Duas fontes, e vale a maior das duas: a estadia mínima declarada
 * (`location_parking_type.has_minimum_stay`, a mesma que a página do lote já mostra) e o
 * início da tabela de preço (`min(pricing_tier.from_day)`). Elas costumam concordar, mas
 * não é obrigatório: um lote pode exigir 3 diárias e ter tabela a partir de 1, e aí quem
 * manda é a exigência. Só `days` é considerado; mínimo em horas não muda a diária.
 */
export function minSellableDays(row: MinStayRow): number | null {
  const candidates: number[] = [];

  if (row.has_minimum_stay && row.minimum_stay_unit === "days" && row.minimum_stay_value) {
    candidates.push(row.minimum_stay_value);
  }

  const tiers = (firstRule(row)?.pricing_tier ?? []).filter((t) => !t.is_old_price);
  if (tiers.length > 0) {
    candidates.push(Math.min(...tiers.map((t) => t.from_day)));
  }

  const floor = candidates.length > 0 ? Math.max(...candidates) : null;
  // Piso de 1 ou menos não é piso: o lote já vendia na janela pedida e o preço nulo veio
  // de outra coisa (estratégia sem tabela, dado incompleto). Aí não há o que tentar.
  return floor != null && floor > 1 ? floor : null;
}

/** Mapa `lpt.id → menor duração vendável`, pronto para a re-simulação em lote. */
export function buildMinStayMap(rows: MinStayRow[] | null): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows ?? []) {
    const days = minSellableDays(row);
    if (days != null) map.set(row.id, days);
  }
  return map;
}
