// Lógica pura da reserva (add-ons + total). Sem React/Supabase → testável (Vitest).

/**
 * Resumo da reserva que o ReservationCard publica pra fora (pro CTA fixo do mobile
 * espelhar o total real, estilo Airbnb, em vez de "A partir de").
 */
export type ReservationSummary = {
  /** Datas válidas + preço + disponibilidade prontos (o total faz sentido). */
  canReserve: boolean;
  /** Total da reserva quando `canReserve`; caso contrário, o preço de balcão (base). */
  total: number;
  days: number;
  from: Date | null;
  to: Date | null;
  /** Selo curto de cancelamento da tarifa escolhida (ex.: "Cancelamento grátis até 24h"). */
  /** Null na unidade externa: a Movepark não cumpre cancelamento ali (ADR-009). */
  cancellationLine: string | null;
};

export type AddOnOption = {
  id: string;
  name: string;
  description: string | null;
  price: number;
};

/** Add-ons selecionados, preservando a ordem do catálogo. */
export function selectedAddOns(options: AddOnOption[], selectedIds: string[]): AddOnOption[] {
  const set = new Set(selectedIds);
  return options.filter((o) => set.has(o.id));
}

/** Soma dos add-ons selecionados. */
export function addOnsTotal(options: AddOnOption[], selectedIds: string[]): number {
  return selectedAddOns(options, selectedIds).reduce((sum, o) => sum + o.price, 0);
}

/** Linha de tarifa vinda de `get_unit_fares` (tier no padrão do banco: `basica`/`flex`/`superflex`). */
export type UnitFareRow = { tier: string; price_cents: number };

/** UI usa `basic`; o banco usa `basica`. Demais tiers são idênticos. */
export const FARE_UI_TO_DB_TIER: Record<string, string> = {
  basic: "basica",
  flex: "flex",
  superflex: "superflex",
};

/**
 * Aplica preço/on-off REAIS da unidade (E2.8-f) sobre as tarifas-padrão:
 * sobrescreve `surcharge`/`tagline` com o preço efetivo e descarta tiers desativados.
 * Sem dados da unidade (catálogo não carregou) devolve os defaults intactos.
 */
export function mergeUnitFares<T extends { id: string; surcharge: number; tagline: string }>(
  defaults: T[],
  unitFares: UnitFareRow[],
  fmt: { reais: (cents: number) => number; brl: (reais: number) => string },
): T[] {
  if (unitFares.length === 0) return defaults;
  return defaults.flatMap((f) => {
    const dbTier = FARE_UI_TO_DB_TIER[f.id] ?? f.id;
    const uf = unitFares.find((u) => u.tier === dbTier);
    if (!uf) return []; // Tarifa desativada nesta unidade
    const surcharge = fmt.reais(uf.price_cents);
    return [{ ...f, surcharge, tagline: surcharge === 0 ? "Grátis" : `+ ${fmt.brl(surcharge)}` }];
  });
}

/**
 * Total da reserva: o desconto do cupom incide apenas no estacionamento
 * (nunca negativo); os serviços adicionais e a Tarifa (E2.8) entram por cima.
 */
export function bookingTotal(
  parkingPrice: number,
  discount: number,
  addOnsSum: number,
  farePrice = 0,
): number {
  return Math.max(0, parkingPrice - discount) + addOnsSum + farePrice;
}

/**
 * Valor POR DIÁRIA a partir do total da estadia.
 *
 * O card mostra o número grande com o rótulo "/ diária", e o motor de preço devolve o TOTAL.
 * Exibir o total com esse rótulo afirmava que cada uma das 9 diárias custava R$ 224,10, quando
 * esse era o valor da estadia inteira. Valia para toda unidade com mais de uma diária.
 *
 * Sem datas escolhidas não há o que dividir, e uma diária só já é o próprio valor.
 *
 * A divisão pode não fechar de volta ao centavo (100 em 3 diárias dá 33,33 e volta 99,99). É
 * esperado num valor por diária, e o total continua vindo do motor, não desta conta.
 */
export function perDayPrice(total: number, days: number): number {
  return days > 1 ? total / days : total;
}

/**
 * Quanto a reserva sai abaixo do preço de balcão, ou null quando não há o que comparar.
 *
 * Compara o balcão com o que a pessoa vai PAGAR (total com tarifa e desconto), não com o preço
 * da vaga sozinho: economia anunciada tem que sobreviver ao valor final da tela.
 *
 * Devolve null quando não há balcão ou quando ele não é maior. Preço riscado sem lastro é
 * âncora falsa, e é isso que o CDC art. 37 trata como enganoso. O balcão da unidade externa vem
 * medido da API do parceiro e reamostrado todo dia (E0.13); o da unidade própria depende de
 * alguém ter preenchido.
 */
export function counterSavings(oldPrice: number | null | undefined, total: number): number | null {
  if (oldPrice == null || !Number.isFinite(oldPrice)) return null;
  const diff = oldPrice - total;
  return diff > 0 ? diff : null;
}

/**
 * Preço de vitrine quando a estadia escolhida não tem total: sem datas, esgotada, ou abaixo do
 * mínimo do parceiro.
 *
 * O `base_price` do catálogo serve de "a partir de" nas unidades nativas. Nas espelhadas ele é
 * 0: a tabela vem do parceiro e esse campo nunca foi preenchido. Zero não é preço, e "Total
 * R$ 0,00" numa vaga que o parceiro só vende a partir de 3 diárias é pior do que não mostrar
 * preço nenhum.
 */
export function showcaseFromPrice(basePrice: number | null | undefined): number | null {
  const n = Number(basePrice ?? 0);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Faixa de diária da unidade, calculada pelo motor de preço nas durações de referência. */
export type PriceShowcase = {
  /** Menor diária entre as durações com preço. É o "a partir de". */
  lowDaily: number;
  /** Maior diária. Igual à menor quando a tabela é plana. */
  highDaily: number;
  /** Quantas durações têm preço. Vira `offerCount` no JSON-LD. */
  offerCount: number;
  /** A escada por duração (total do motor), ordenada por dias. É o que vira
   *  `UnitPriceSpecification` com `eligibleQuantity` no schema: a tarifa
   *  progressiva inteira legível por máquina, não só a faixa. */
  porDuracao: { days: number; total: number }[];
};

/**
 * A faixa de diária a partir dos totais por duração que o motor devolveu.
 *
 * Existe porque `company_parking_type.base_price` não é o preço da unidade: nas espelhadas ele
 * é 0 e o motor (`simulate_price`) nunca lê esse campo, então ele conta zero sobre quanto a
 * vaga custa. O preço de verdade mora em `pricing_rule` + faixas, e é o mesmo número que o card
 * mostra quando a pessoa escolhe as datas.
 *
 * A faixa é de DIÁRIA, não de total, porque a tabela é escalonada e o total não se compara
 * entre durações: na Aerovalet, o valet sai por R$ 119,20 a diária em 1 dia e R$ 21,12 em 30.
 * Um número só esconderia essa distância; por isso o schema emite `AggregateOffer`.
 *
 * Duração sem preço (estadia mínima do parceiro) simplesmente não entra: é ausência de oferta
 * naquela janela, não oferta de graça.
 */
export function buildPriceShowcase(
  totais: { days: number; total: number | null }[],
): PriceShowcase | null {
  const validas = totais
    .filter((t): t is { days: number; total: number } => t.days > 0 && t.total != null && t.total > 0)
    .sort((a, b) => a.days - b.days);
  const diarias = validas.map((t) => Math.round((t.total / t.days) * 100) / 100);
  if (diarias.length === 0) return null;
  return {
    lowDaily: Math.min(...diarias),
    highDaily: Math.max(...diarias),
    offerCount: diarias.length,
    porDuracao: validas.map((t) => ({ days: t.days, total: t.total })),
  };
}
