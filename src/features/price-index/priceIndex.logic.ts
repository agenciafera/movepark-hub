/**
 * Lógica pura do índice de preços (/precos e /precos/<slug>).
 *
 * Tudo aqui opera sobre o retorno da RPC `destination_price_index` (matriz de
 * preço do motor real por destino) e é testável sem rede: ordenação, melhor
 * preço por duração, economia contra o balcão, estadia mínima e os resumos
 * answer-first que saem no HTML, na meta description e no gêmeo Markdown.
 */

export const INDEX_DURATIONS = [1, 7, 15, 30] as const;

export type PriceEntry = {
  days: number;
  total: number | null;
  old_total: number | null;
};

export type PriceUnit = {
  company_slug: string;
  company_name: string;
  location_slug: string;
  location_name: string;
  parking_type_code: string;
  parking_type_name: string;
  checkout_mode: string;
  review_avg: number | null;
  review_count: number;
  has_shuttle: boolean;
  shuttle_minutes: number | null;
  distance_m: number | null;
  min_stay_days: number | null;
  price_updated_at: string | null;
  prices: PriceEntry[];
};

export type PriceDestination = {
  slug: string;
  code: string;
  name: string;
  short_name: string | null;
  type: string;
  city: string;
  state: string | null;
  units: PriceUnit[];
};

export type PriceIndexData = {
  days: number[];
  destinations: PriceDestination[];
};

/** Moto compara com moto: fica fora da tabela de carro e dos resumos. */
const MOTO_CODE = "motorcycle";

export function carUnits(units: PriceUnit[]): PriceUnit[] {
  return units.filter((u) => u.parking_type_code !== MOTO_CODE);
}

export function motoUnits(units: PriceUnit[]): PriceUnit[] {
  return units.filter((u) => u.parking_type_code === MOTO_CODE);
}

export function unitKey(u: PriceUnit): string {
  return `${u.company_slug}/${u.location_slug}/${u.parking_type_code}`;
}

export function listingPath(u: PriceUnit): string {
  return `/p/${u.company_slug}/${u.location_slug}/${u.parking_type_code}`;
}

/**
 * Nome da linha na tabela: a marca do parceiro. Quando a mesma empresa tem duas
 * unidades no destino, o nome da unidade desambigua.
 */
export function unitLabel(u: PriceUnit, all: PriceUnit[]): string {
  const mesmaEmpresa = all.filter((o) => o.company_slug === u.company_slug);
  const locations = new Set(mesmaEmpresa.map((o) => o.location_slug));
  return locations.size > 1 ? `${u.company_name} (${u.location_name})` : u.company_name;
}

export function priceFor(u: PriceUnit, days: number): PriceEntry | null {
  return u.prices.find((p) => p.days === days) ?? null;
}

/** Economia contra o balcão, em % inteiro. Balcão igual ou menor não é economia. */
export function economyPct(entry: PriceEntry | null): number | null {
  if (!entry || entry.total == null || entry.old_total == null) return null;
  if (entry.old_total <= entry.total) return null;
  return Math.round((1 - entry.total / entry.old_total) * 100);
}

export function perDay(entry: PriceEntry | null): number | null {
  if (!entry || entry.total == null) return null;
  return entry.total / entry.days;
}

export type MatrixCell = {
  days: number;
  total: number | null;
  /** Balcão, só quando maior que o preço online (senão não há o que riscar). */
  oldTotal: number | null;
  perDay: number | null;
  economyPct: number | null;
  /** Estadia mínima que explica a célula sem preço. */
  minStayDays: number | null;
  isCheapest: boolean;
};

export type MatrixRow = {
  key: string;
  unit: PriceUnit;
  label: string;
  cells: MatrixCell[];
};

export type Matrix = {
  days: number[];
  rows: MatrixRow[];
};

/**
 * A tabela do destino: uma linha por vaga de parceiro, uma coluna por duração.
 * Ordena pela duração de referência (7 diárias por default, a compra mais
 * comum); quem não tem preço nela vai para o fim, por estadia mínima e nome.
 * A célula mais barata de cada coluna é marcada para o destaque visual.
 */
export function buildMatrix(dest: PriceDestination, days: number[], refDays = 7): Matrix {
  const units = carUnits(dest.units);

  const cheapest = new Map<number, string>();
  for (const d of days) {
    let melhor: { key: string; total: number } | null = null;
    for (const u of units) {
      const total = priceFor(u, d)?.total ?? null;
      if (total != null && (melhor === null || total < melhor.total)) {
        melhor = { key: unitKey(u), total };
      }
    }
    if (melhor) cheapest.set(d, melhor.key);
  }

  const rows = units
    .map((u) => {
      const cells = days.map((d): MatrixCell => {
        const entry = priceFor(u, d);
        const total = entry?.total ?? null;
        const eco = economyPct(entry);
        return {
          days: d,
          total,
          oldTotal: eco != null ? (entry?.old_total ?? null) : null,
          perDay: perDay(entry),
          economyPct: eco,
          minStayDays:
            total == null && u.min_stay_days != null && u.min_stay_days > d
              ? u.min_stay_days
              : null,
          isCheapest: total != null && cheapest.get(d) === unitKey(u),
        };
      });
      return { key: unitKey(u), unit: u, label: unitLabel(u, units), cells };
    })
    .sort((a, b) => {
      const ta = a.cells.find((c) => c.days === refDays)?.total ?? null;
      const tb = b.cells.find((c) => c.days === refDays)?.total ?? null;
      if (ta != null && tb != null && ta !== tb) return ta - tb;
      if (ta != null && tb == null) return -1;
      if (ta == null && tb != null) return 1;
      return (
        (a.unit.min_stay_days ?? 0) - (b.unit.min_stay_days ?? 0) ||
        a.label.localeCompare(b.label, "pt-BR") ||
        a.unit.parking_type_name.localeCompare(b.unit.parking_type_name, "pt-BR")
      );
    });

  return { days, rows };
}

export type DurationSummary = {
  days: number;
  /** Menor total entre as vagas com preço nessa duração. */
  from: number;
  fromPerDay: number;
  /** Quem pratica o menor preço (marca + tipo de vaga). */
  unitLabel: string;
  parkingTypeName: string;
};

export type DestinationSummary = {
  unitCount: number;
  partnerCount: number;
  byDuration: DurationSummary[];
  maxEconomyPct: number | null;
  /** Tabela de parceiro mais recente (ISO), para a página datar o dado. */
  lastUpdated: string | null;
};

export function destinationSummary(dest: PriceDestination, days: number[]): DestinationSummary {
  const units = carUnits(dest.units);
  const byDuration: DurationSummary[] = [];

  for (const d of days) {
    let melhor: { u: PriceUnit; total: number } | null = null;
    for (const u of units) {
      const total = priceFor(u, d)?.total ?? null;
      if (total != null && (melhor === null || total < melhor.total)) {
        melhor = { u, total };
      }
    }
    if (melhor) {
      byDuration.push({
        days: d,
        from: melhor.total,
        fromPerDay: melhor.total / d,
        unitLabel: unitLabel(melhor.u, units),
        parkingTypeName: melhor.u.parking_type_name,
      });
    }
  }

  let maxEco: number | null = null;
  let lastUpdated: string | null = null;
  for (const u of units) {
    for (const p of u.prices) {
      const eco = economyPct(p);
      if (eco != null && (maxEco === null || eco > maxEco)) maxEco = eco;
    }
    if (u.price_updated_at && (!lastUpdated || u.price_updated_at > lastUpdated)) {
      lastUpdated = u.price_updated_at;
    }
  }

  const locations = new Set(units.map((u) => `${u.company_slug}/${u.location_slug}`));
  const partners = new Set(units.map((u) => u.company_slug));

  return {
    unitCount: locations.size,
    partnerCount: partners.size,
    byDuration,
    maxEconomyPct: maxEco,
    lastUpdated,
  };
}

export type OverallStats = {
  destinationCount: number;
  unitCount: number;
  minDailyFrom: number | null;
  maxEconomyPct: number | null;
};

export function overallStats(data: PriceIndexData): OverallStats {
  let minDaily: number | null = null;
  let maxEco: number | null = null;
  const locations = new Set<string>();

  for (const dest of data.destinations) {
    for (const u of carUnits(dest.units)) {
      locations.add(`${u.company_slug}/${u.location_slug}`);
      const diaria = priceFor(u, 1)?.total ?? null;
      if (diaria != null && (minDaily === null || diaria < minDaily)) minDaily = diaria;
      for (const p of u.prices) {
        const eco = economyPct(p);
        if (eco != null && (maxEco === null || eco > maxEco)) maxEco = eco;
      }
    }
  }

  return {
    destinationCount: data.destinations.length,
    unitCount: locations.size,
    minDailyFrom: minDaily,
    maxEconomyPct: maxEco,
  };
}

export function durationLabel(days: number): string {
  return days === 1 ? "1 diária" : `${days} diárias`;
}

/** "280 m" até 949 m; acima disso, km com uma casa ("1,3 km"), sem ",0". */
export function formatDistance(m: number | null): string | null {
  if (m == null) return null;
  if (m < 950) return `${m} m`;
  const km = m / 1000;
  const arredondado = Math.round(km * 10) / 10;
  const texto = Number.isInteger(arredondado)
    ? String(arredondado)
    : arredondado.toFixed(1).replace(".", ",");
  return `${texto} km`;
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Meta description da página do destino, derivada do dado (não escrita à mão):
 * responde "quanto custa" já no snippet. Corta em 160 sem quebrar palavra.
 */
export function metaDescription(dest: PriceDestination, summary: DestinationSummary): string {
  const nome = dest.short_name ?? dest.name;
  const diaria = summary.byDuration.find((s) => s.days === 1);
  const sete = summary.byDuration.find((s) => s.days === 7);
  const partes: string[] = [];
  if (diaria) partes.push(`diária a partir de ${brl.format(diaria.from)}`);
  if (sete) partes.push(`7 diárias por ${brl.format(sete.from)}`);
  const precos = partes.length > 0 ? `: ${partes.join(", ")}` : "";
  const texto =
    `Preços de estacionamento perto de ${nome}${precos}. ` +
    `Tabela com ${summary.unitCount} ${summary.unitCount === 1 ? "opção de parceiro" : "opções de parceiros"}, preço de balcão e reserva online.`;
  if (texto.length <= 160) return texto;
  const corte = texto.slice(0, 157);
  return `${corte.slice(0, corte.lastIndexOf(" "))}…`;
}
