/**
 * Lógica pura do comparador "de app ou de carro" (/uber-ou-estacionamento-aeroporto).
 *
 * O lado do ESTACIONAMENTO é dado vivo do motor (o mesmo do checkout). O lado do
 * APP é estimativa declarada: Uber e 99 não oferecem API de preço para terceiros
 * (a do Uber proíbe comparação de preços nos termos), então a conta usa a tarifa
 * de referência abaixo, com fonte e data à vista, mais os controles de tarifa
 * dinâmica e de valor manual para o usuário aproximar da realidade dele.
 */

import { carUnits, priceFor, type PriceDestination, type PriceUnit } from "./priceIndex.logic";

/** Tarifa de referência de app (categoria básica). Fonte e data saem na página. */
export type TarifaApp = {
  bandeirada: number;
  porKm: number;
  porMinuto: number;
  minima: number;
  fonte: string;
  fonteUrl: string;
  coletadoEm: string;
};

export const TARIFA_APP_PADRAO: TarifaApp = {
  bandeirada: 2.5,
  porKm: 1.65,
  porMinuto: 0.35,
  minima: 10,
  fonte: "Calculauto, tarifas UberX de referência (a Uber não publica tabela oficial)",
  fonteUrl: "https://www.calculauto.com.br/blog/quanto-custa-viagem-uber-brasil-2026",
  coletadoEm: "2026-08",
};

/** Combustível do trajeto de carro, para quem quiser a conta completa. */
export const COMBUSTIVEL = {
  precoLitro: 6.2,
  kmPorLitro: 11,
  fonte: "referência de gasolina comum, ago/2026",
};

/** Multiplicadores de tarifa dinâmica oferecidos na página. */
export const SURGE_OPCOES = [1, 1.25, 1.5, 2] as const;

export const KM_MIN = 2;
export const KM_MAX = 120;

export function sanitizeKm(value: string | number): number | null {
  const n = typeof value === "number" ? value : Number.parseInt(value, 10);
  if (!Number.isInteger(n) || n < KM_MIN || n > KM_MAX) return null;
  return n;
}

/** Minutos estimados do trajeto: média urbana de 30 km/h, declarada na metodologia. */
export function minutosEstimados(km: number): number {
  return Math.round(km * 2);
}

/** Uma corrida (um trecho), na tarifa de referência com o multiplicador aplicado. */
export function estimativaCorrida(km: number, surge: number, tarifa = TARIFA_APP_PADRAO): number {
  const base = tarifa.bandeirada + tarifa.porKm * km + tarifa.porMinuto * minutosEstimados(km);
  return Math.max(tarifa.minima, base) * surge;
}

export function custoCombustivel(km: number): number {
  // Ida e volta de carro próprio.
  return ((km * 2) / COMBUSTIVEL.kmPorLitro) * COMBUSTIVEL.precoLitro;
}

export type Comparacao = {
  days: number;
  km: number;
  surge: number;
  /** Duas corridas: ida no embarque, volta no desembarque. */
  appTotal: number;
  /** Veio do campo manual (tarifa real que o app mostrou) em vez da estimativa. */
  appManual: boolean;
  /** Menor total de estacionamento do destino para a duração. */
  estacionarTotal: number | null;
  estacionarLabel: string | null;
  /** A vaga que pratica o menor total, para o CTA de reserva do veredito. */
  melhorUnidade: PriceUnit | null;
  combustivel: number | null;
  /** app menos (estacionar + combustível). Positivo = estacionar economiza. */
  economia: number | null;
};

export function comparar(
  dest: PriceDestination,
  days: number,
  km: number,
  surge: number,
  opts: { tarifaManualIda?: number | null; incluirCombustivel?: boolean } = {},
): Comparacao {
  const manual = opts.tarifaManualIda != null && opts.tarifaManualIda > 0;
  const corrida = manual ? (opts.tarifaManualIda as number) : estimativaCorrida(km, surge);
  const appTotal = corrida * 2;

  let melhor: { total: number; label: string; unidade: PriceUnit } | null = null;
  for (const u of carUnits(dest.units)) {
    const total = priceFor(u, days)?.total ?? null;
    if (total != null && (melhor === null || total < melhor.total)) {
      melhor = { total, label: `${u.company_name} (${u.parking_type_name})`, unidade: u };
    }
  }

  const combustivel = opts.incluirCombustivel ? custoCombustivel(km) : null;
  const custoEstacionar = melhor ? melhor.total + (combustivel ?? 0) : null;

  return {
    days,
    km,
    surge,
    appTotal,
    appManual: manual,
    estacionarTotal: melhor?.total ?? null,
    estacionarLabel: melhor?.label ?? null,
    melhorUnidade: melhor?.unidade ?? null,
    combustivel,
    economia: custoEstacionar != null ? appTotal - custoEstacionar : null,
  };
}

/**
 * Janela de reserva que fecha exatamente N diárias no motor: entrada no dia
 * seguinte às 22h, saída N dias depois às 08h (o mesmo padrão do widget de
 * busca; a tolerância de 60 min mantém a conta em N diárias). Alimenta o CTA
 * do veredito, e as datas seguem ajustáveis na página da vaga.
 */
export function reservaWindow(base: Date, days: number): { from: string; to: string } {
  const from = new Date(base);
  from.setDate(from.getDate() + 1);
  from.setHours(22, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + days);
  to.setHours(8, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
}

/**
 * A menor duração (entre as conhecidas) em que estacionar já sai mais barato que
 * as duas corridas. O custo do app não muda com os dias; o do estacionamento sobe.
 */
export function breakEvenDays(
  dest: PriceDestination,
  km: number,
  surge: number,
  durations: number[],
): number | null {
  const appTotal = estimativaCorrida(km, surge) * 2;
  for (const d of [...durations].sort((a, b) => a - b)) {
    let melhor: number | null = null;
    for (const u of carUnits(dest.units)) {
      const total = priceFor(u, d)?.total ?? null;
      if (total != null && (melhor === null || total < melhor)) melhor = total;
    }
    if (melhor != null && melhor < appTotal) return d;
  }
  return null;
}
