/**
 * Lógica pura do comparador "de app ou de carro" (/calculadora-estacionamento-aeroporto?modo=app).
 *
 * O lado do ESTACIONAMENTO é dado vivo do motor (o mesmo do checkout). O lado do
 * APP é estimativa declarada: Uber e 99 não oferecem API de preço para terceiros
 * (a do Uber proíbe comparação de preços nos termos), então a conta usa o preço
 * médio do UberX que a própria Uber publica na página de cada aeroporto
 * (`uber.com/global/pt-br/r/airports/<iata>/`), dividido pela distância média da
 * mesma página. O resultado é um R$ por km de cada praça, com fonte e data à
 * vista, mais os controles de tarifa dinâmica e de valor manual para o usuário
 * aproximar da realidade dele.
 *
 * Até 23/11/2026 a conta usava uma tarifa genérica (bandeirada + km + minuto, da
 * Calculauto), que dava cerca de R$ 73 para 30 km enquanto a Uber publicava R$ 100
 * entre São Paulo e Guarulhos. O post "vale a pena deixar o carro no aeroporto ou
 * ir de Uber" usa estes mesmos números, então a calculadora e o post batem.
 *
 * Os números mudam todo mês: ao atualizar, reconfira as cinco páginas e troque
 * `consultadoEm` junto.
 */

import { carUnits, priceFor, type PriceDestination, type PriceUnit } from "./priceIndex.logic";

/** Preço médio publicado pela Uber para um aeroporto. Fonte e data saem na página. */
export type ReferenciaApp = {
  /** IATA, igual a `destination.code`. */
  codigo: string;
  aeroporto: string;
  /** Cidade de saída que a Uber usa na média ("entre São Paulo e GRU"). */
  origem: string;
  /** Preço médio do UberX no último mês, em reais. */
  precoMedio: number;
  /** Distância média da viagem no último mês, em km. */
  km: number;
  /** Tempo médio da viagem no último mês, em minutos. */
  minutos: number;
  fonteUrl: string;
};

/** Data da última conferência das páginas da Uber (ISO). */
export const UBER_CONSULTADO_EM = "2026-11-23";

const uberUrl = (iata: string) =>
  `https://www.uber.com/global/pt-br/r/airports/${iata.toLowerCase()}/`;

export const REFERENCIAS_UBER: readonly ReferenciaApp[] = [
  {
    codigo: "GRU",
    aeroporto: "Guarulhos",
    origem: "São Paulo",
    precoMedio: 100,
    km: 30,
    minutos: 46,
    fonteUrl: uberUrl("GRU"),
  },
  {
    codigo: "CGH",
    aeroporto: "Congonhas",
    origem: "São Paulo",
    precoMedio: 43,
    km: 11,
    minutos: 26,
    fonteUrl: uberUrl("CGH"),
  },
  {
    codigo: "VCP",
    aeroporto: "Viracopos",
    origem: "Campinas",
    precoMedio: 38,
    km: 17,
    minutos: 19,
    fonteUrl: uberUrl("VCP"),
  },
  {
    codigo: "CNF",
    aeroporto: "Confins",
    origem: "Belo Horizonte",
    precoMedio: 96,
    km: 41,
    minutos: 45,
    fonteUrl: uberUrl("CNF"),
  },
  {
    codigo: "CWB",
    aeroporto: "Afonso Pena",
    origem: "Curitiba",
    precoMedio: 40,
    km: 19,
    minutos: 29,
    fonteUrl: uberUrl("CWB"),
  },
];

/** R$ por km de uma referência: preço médio dividido pela distância média. */
export function porKmDe(ref: ReferenciaApp): number {
  return ref.precoMedio / ref.km;
}

/**
 * Destino sem página de aeroporto da Uber (o Terminal Tietê, por exemplo): usa a
 * média simples do R$ por km das referências publicadas. Declarado na página.
 */
export const POR_KM_MEDIO =
  REFERENCIAS_UBER.reduce((soma, r) => soma + porKmDe(r), 0) / REFERENCIAS_UBER.length;

/** Piso da corrida em trajeto curto, para a conta proporcional não dar R$ 4. */
export const CORRIDA_MINIMA = 10;

export function referenciaApp(codigo: string | null | undefined): ReferenciaApp | null {
  if (!codigo) return null;
  const c = codigo.toUpperCase();
  return REFERENCIAS_UBER.find((r) => r.codigo === c) ?? null;
}

/** R$ por km do destino: o do aeroporto, ou a média quando a Uber não publica. */
export function porKmDoDestino(codigo: string | null | undefined): number {
  const ref = referenciaApp(codigo);
  return ref ? porKmDe(ref) : POR_KM_MEDIO;
}

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

/**
 * Uma corrida (um trecho): a distância vezes o R$ por km do destino, com o
 * multiplicador de dinâmica aplicado e o piso de trajeto curto.
 */
export function estimativaCorrida(km: number, surge: number, porKm: number = POR_KM_MEDIO): number {
  return Math.max(CORRIDA_MINIMA, porKm * km) * surge;
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
  const corrida = manual
    ? (opts.tarifaManualIda as number)
    : estimativaCorrida(km, surge, porKmDoDestino(dest.code));
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
  const appTotal = estimativaCorrida(km, surge, porKmDoDestino(dest.code)) * 2;
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
