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
  /** Nome canônico da ficha. Nulo em unidade que ainda não foi nomeada. */
  location_public_name?: string | null;
  /** `/estacionamentos/<destino>/<lote>`, montado no banco (uma gramática só). */
  public_path?: string | null;
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
  /** Capa da unidade (`location.photos[1]` no Postgres, a mesma da busca). Vira `image` no JSON-LD. */
  photo?: string | null;
  prices: PriceEntry[];
};

export type PriceDestination = {
  slug: string;
  /** Slug da URL pública do destino. Nulo só em destino que nunca foi publicado. */
  public_slug: string | null;
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
  return u.public_path ?? "";
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
      // Cascata: compara a duração de referência e, em empate ou vazio dos dois
      // lados, segue para as demais durações. Linha com preço vem antes de linha
      // sem preço na mesma duração (a estadia mínima manda pro fim, não pro meio).
      const seq = [refDays, ...days.filter((d) => d !== refDays)];
      const totalDe = (row: MatrixRow, d: number) =>
        row.cells.find((c) => c.days === d)?.total ?? null;
      for (const d of seq) {
        const ta = totalDe(a, d);
        const tb = totalDe(b, d);
        if (ta != null && tb != null) {
          if (ta !== tb) return ta - tb;
          continue;
        }
        if (ta != null) return -1;
        if (tb != null) return 1;
      }
      return (
        a.label.localeCompare(b.label, "pt-BR") ||
        a.unit.parking_type_name.localeCompare(b.unit.parking_type_name, "pt-BR")
      );
    });

  return { days, rows };
}

/** Durações da tabela do índice (/precos): o corte editorial de comparação. */
export const INDEX_TOP_DAYS = [1, 7, 15];

export type TopRows = {
  rows: MatrixRow[];
  /** Quantas linhas ficaram de fora do corte (vão para a tabela completa). */
  hiddenCount: number;
};

/**
 * As linhas da tabela por destino no índice: até `limit` vagas, ordenadas pela
 * diária avulsa (quem não cota diária entra depois, pela duração seguinte).
 */
export function topRows(dest: PriceDestination, limit = 5): TopRows {
  const { rows } = buildMatrix(dest, INDEX_TOP_DAYS, 1);
  return { rows: rows.slice(0, limit), hiddenCount: Math.max(0, rows.length - limit) };
}

/** Aeroporto publicado no catálogo, com ou sem parceiro precificado. */
export type AirportMeta = {
  slug: string;
  /** Slug da URL pública do destino (`/estacionamentos/<public_slug>`). */
  public_slug: string | null;
  code: string | null;
  name: string;
  short_name: string | null;
  city: string | null;
  state: string | null;
};

/** Lote mapeado sem contrato (ADR-010), compacto para a tabela do índice. */
export type IndexProspect = {
  name: string;
  /** Slug do lote como veio da RPC. Não serve para montar URL: use `public_path`. */
  slug: string;
  /** Caminho da ficha, montado no banco. */
  public_path: string | null;
  distance_km: number | null;
};

export type AirportSection = {
  meta: AirportMeta;
  /** Destino do motor quando existe parceiro precificado. */
  dest: PriceDestination | null;
  /** Vagas de parceiro dentro do corte: sempre abrem a tabela. */
  rows: MatrixRow[];
  /** Lotes mapeados que completam a tabela até o limite. */
  mapeados: IndexProspect[];
  /** Vagas de parceiro além do corte (vivem na tabela completa). */
  hiddenPartnerCount: number;
  /** Lotes mapeados além do corte (vivem na página do destino). */
  hiddenProspectCount: number;
};

/**
 * A seção de cada aeroporto no índice: TODO aeroporto publicado entra, com ou
 * sem parceiro. Parceiro tem prioridade nas linhas (topRows, ordenado pela
 * diária avulsa); lote mapeado sem contrato completa a tabela até `limit`,
 * sem preço (ADR-010). Quem não tem nada ainda entra com a seção vazia, para a
 * página cobrir o catálogo inteiro.
 */
export function buildAirportSections(
  aeroportos: AirportMeta[],
  index: PriceIndexData,
  prospects: Record<string, IndexProspect[]>,
  limit = 5,
): AirportSection[] {
  return aeroportos.map((meta) => {
    const dest = index.destinations.find((d) => d.slug === meta.slug) ?? null;
    const top = dest ? topRows(dest, limit) : { rows: [], hiddenCount: 0 };
    const todos = prospects[meta.slug] ?? [];
    const vagasLivres = Math.max(0, limit - top.rows.length);
    return {
      meta,
      dest,
      rows: top.rows,
      mapeados: todos.slice(0, vagasLivres),
      hiddenPartnerCount: top.hiddenCount,
      hiddenProspectCount: Math.max(0, todos.length - vagasLivres),
    };
  });
}

export type AirportFilter = {
  /** Texto livre: nome, cidade, estado ou código IATA. */
  busca: string;
  /** UF exata, ou null para todas. */
  uf: string | null;
  /** Só aeroportos com parceiro precificado (reserva online). */
  soComReserva: boolean;
};

export const EMPTY_AIRPORT_FILTER: AirportFilter = { busca: "", uf: null, soComReserva: false };

const semAcento = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export function matchesAirportFilter(section: AirportSection, f: AirportFilter): boolean {
  if (f.soComReserva && section.rows.length === 0) return false;
  if (f.uf && section.meta.state !== f.uf) return false;
  const busca = semAcento(f.busca.trim());
  if (busca) {
    const alvo = semAcento(
      [
        section.meta.name,
        section.meta.short_name ?? "",
        section.meta.city ?? "",
        section.meta.state ?? "",
        section.meta.code ?? "",
      ].join(" "),
    );
    if (!alvo.includes(busca)) return false;
  }
  return true;
}

/** UFs presentes no catálogo, ordenadas, para o filtro de estado. */
export function airportStates(aeroportos: AirportMeta[]): string[] {
  return [...new Set(aeroportos.map((a) => a.state).filter((s): s is string => !!s))].sort();
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

/**
 * Os três períodos do índice, na ordem em que o seletor mostra. São os mesmos
 * de `INDEX_TOP_DAYS`, com o rótulo que a página escreve.
 */
export const INDEX_PERIODS = [
  { days: 1, label: "Diária avulsa", note: "diária avulsa", unit: "na diária avulsa" },
  { days: 7, label: "7 diárias", note: "7 diárias", unit: "por diária" },
  { days: 15, label: "15 diárias", note: "15 diárias", unit: "por diária" },
] as const;

/** O período que abre a página. 7 diárias é a compra mais comum. */
export const INDEX_DEFAULT_PERIOD = 7;

export function periodLabel(days: number): string {
  return INDEX_PERIODS.find((p) => p.days === days)?.note ?? durationLabel(days);
}

/**
 * Ordena as linhas pelo preço do período escolhido, do menor para o maior.
 * Linha sem preço naquele período (estadia mínima, tipicamente) cai para o fim,
 * porque um "sob consulta" no topo da lista de menor preço confunde a leitura.
 *
 * Não muda QUAIS linhas aparecem: o corte de até 5 continua sendo o de
 * `topRows`, feito pela diária avulsa. Aqui só a ordem responde ao seletor.
 */
export function sortRowsByPeriod(rows: MatrixRow[], days: number): MatrixRow[] {
  const chave = (r: MatrixRow) => {
    const cell = r.cells.find((c) => c.days === days);
    return cell?.perDay ?? Number.POSITIVE_INFINITY;
  };
  return [...rows].sort((a, b) => {
    const d = chave(a) - chave(b);
    return d !== 0 ? d : a.label.localeCompare(b.label, "pt-BR");
  });
}

export type AirportGroups = {
  /** Tem parceiro precificado: dá para reservar online por aquele valor. */
  comReserva: AirportSection[];
  /** Sem parceiro, mas com ficha mapeada pela equipe (ADR-010). */
  mapeados: AirportSection[];
  /** Nem parceiro nem ficha: o aeroporto está no catálogo e nada mais. */
  aindaMapeando: AirportSection[];
};

/**
 * Separa os aeroportos pelo que a Movepark consegue prometer em cada um.
 *
 * A lista corrida tratava os três casos igual, e um aeroporto sem nada ocupava o
 * mesmo espaço de um com cinco parceiros, cada um repetindo o mesmo parágrafo de
 * "ainda estamos mapeando". Separado, cada grupo diz de uma vez só o que vale
 * para todos dentro dele, que é também o que o ADR-009 pede: promessa de
 * transação só onde ela existe.
 */
export function groupAirports(sections: AirportSection[]): AirportGroups {
  const comReserva: AirportSection[] = [];
  const mapeados: AirportSection[] = [];
  const aindaMapeando: AirportSection[] = [];
  for (const s of sections) {
    if (s.rows.length > 0) comReserva.push(s);
    else if (s.mapeados.length > 0 || s.hiddenProspectCount > 0) mapeados.push(s);
    else aindaMapeando.push(s);
  }
  return { comReserva, mapeados, aindaMapeando };
}

/**
 * Menor preço por diária do índice inteiro numa duração. Acompanha o seletor de
 * período: anunciar "menor diária" da avulsa enquanto a tabela mostra 7 diárias
 * põe dois números diferentes lado a lado dizendo a mesma coisa.
 */
export function minPerDay(data: PriceIndexData, days: number): number | null {
  let menor: number | null = null;
  for (const dest of data.destinations) {
    for (const u of carUnits(dest.units)) {
      const valor = perDay(priceFor(u, days));
      if (valor != null && (menor === null || valor < menor)) menor = valor;
    }
  }
  return menor;
}
