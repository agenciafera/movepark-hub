/**
 * Bloco de preço e de proximidade da página de destino (/destinos/<slug>).
 *
 * Existe porque a página do destino disputa "estacionamento aeroporto <X>", que é
 * consulta de preço, e até 17/08/2026 respondia em prosa: os valores só apareciam
 * dentro de uma resposta de FAQ e a página não tinha uma única `<table>`. Quem
 * compara a mesma consulta em tabela, com número e data, é citado; quem descreve
 * não é.
 *
 * As contas NÃO moram aqui. `buildMatrix` e `destinationSummary` continuam sendo os
 * do índice de preços (`price-index/priceIndex.logic`), e este módulo só compõe em
 * cima deles. É de propósito: /destinos/<slug> e /precos/<slug> mostram a mesma
 * tabela do mesmo motor, e duas implementações da mesma conta viram duas respostas
 * diferentes para a mesma pergunta na mesma sessão. Foi exatamente o que a auditoria
 * do concorrente encontrou (a tabela dizia R$ 25,00/dia e a FAQ da mesma página
 * dizia R$ 75,00/dia).
 *
 * Layout pode divergir entre as duas páginas. Número não pode.
 */

import { caminhoFicha } from "@/lib/urls";
import {
  buildMatrix,
  carUnits,
  destinationSummary,
  formatDistance,
  perDay,
  priceFor,
  unitLabel,
  type DestinationSummary,
  type Matrix,
  type PriceDestination,
  type PriceUnit,
} from "@/features/price-index/priceIndex.logic";

/** As mesmas durações do índice de preços: a página não inventa um corte próprio. */
export const DESTINO_DURATIONS = [1, 7, 15, 30];

/**
 * A queda do preço por diária conforme a estadia cresce.
 *
 * É a pergunta que o comparador responde e a vitrine não: "compensa deixar mais
 * dias?". Sai do dado real (diária avulsa contra a maior duração cotada da mesma
 * vaga), nunca de uma faixa genérica de mercado, e a unidade é nomeada para a frase
 * ser verificável na própria tabela logo acima.
 */
export type LongStayInsight = {
  unitLabel: string;
  parkingTypeName: string;
  fromDays: number;
  toDays: number;
  perDayFrom: number;
  perDayTo: number;
  /** Queda percentual inteira do preço por diária. Sempre >= 1. */
  dropPct: number;
};

export type DestinoPrices = {
  matrix: Matrix;
  summary: DestinationSummary;
  longStay: LongStayInsight | null;
  /** Tabela de parceiro mais recente (ISO), para a página datar o dado. */
  lastUpdated: string | null;
};

/**
 * Uma linha da tabela de preço vinda de PESQUISA, não do motor.
 *
 * Existe porque em 21 dos 26 destinos não há unidade vendável, e até 29/08/2026 a
 * tabela de preço simplesmente não renderizava neles: a página respondia "onde fica"
 * e "a que distância", e ficava muda na consulta que tem intenção de compra. O dado
 * já existia em prosa no blog (o guia de Confins compara cinco pátios com valores de
 * agosto de 2026); o que faltava era ele estar em tabela, com data ao lado.
 *
 * Nunca é oferta: não tem link de reserva, não vira `Offer` no JSON-LD e carrega a
 * data em que foi conferido, porque preço de terceiro sem carimbo é afirmação nossa
 * sobre o negócio do outro (ADR-009).
 */
export type PesquisadoRow = {
  key: string;
  label: string;
  /** A marca sozinha ("Central Park"), para caber numa frase em vez de numa coluna. */
  shortLabel: string;
  /** Ficha do lote mapeado. Nulo enquanto faltar slug público. */
  path: string | null;
  /** Um total por duração, na mesma ordem de `days`. Nulo onde a pesquisa não cobriu. */
  totals: (number | null)[];
  /** Data da pesquisa (ISO), a mesma para a linha inteira. */
  researchedAt: string;
};

/** O que a página de destino precisa de um lote mapeado para virar linha de preço. */
export type PesquisadoInput = {
  name: string;
  public_name?: string | null;
  slug: string;
  public_path?: string | null;
  /**
   * Último segmento da URL pública. O fallback usa ELE, nunca o `slug`, que é o slug
   * legado: `/estacionamentos/<destino>/<slug legado>` não é rota nenhuma. Num clique
   * dentro do app não há requisição HTTP, então o 301 do Worker nunca roda e a pessoa
   * cai em "Vaga não encontrada" (30/08/2026, 131 links da lista de distância).
   */
  public_slug?: string | null;

  researched_daily_brl: number | null;
  researched_weekly_brl: number | null;
  researched_biweekly_brl: number | null;
  researched_monthly_brl: number | null;
  researched_at: string | null;
};

/**
 * Quanto tempo um preço de terceiro continua sendo uma afirmação defensável.
 *
 * Gêmeo em SQL: `public.preco_pesquisado_fresco` (20261111091500), que já devolve nulo
 * no vencido. Se um dia mudar, os dois mudam juntos.
 */
export const PRECO_PESQUISADO_TTL_DIAS = 90;

/**
 * A segunda porta da validade.
 *
 * A primeira é a RPC, que nem entrega o vencido. Esta existe porque a página de destino
 * é SSG: o HTML sai congelado no dia do build, e sem checar de novo na renderização uma
 * página construída no dia 89 seguiria mostrando o preço no dia 200. É o mesmo desenho
 * do `isSnapshotFresh` da nota do Google.
 */
export function isPesquisaFresca(researchedAt: string, now: Date = new Date()): boolean {
  const idade = now.getTime() - new Date(`${researchedAt}T12:00:00Z`).getTime();
  return idade < PRECO_PESQUISADO_TTL_DIAS * 24 * 60 * 60 * 1000;
}

/**
 * Lote mapeado com preço pesquisado, pronto para a tabela.
 *
 * Fica de fora quem não tem NENHUM valor, quem não tem data e quem tem data vencida: a
 * constraint do banco já garante o par, e a checagem aqui é a segunda porta, para uma
 * leitura antiga em cache não escapar sem carimbo. Ordena pela semana, que é a compra
 * mais comum e a mesma referência da matriz de parceiro; quem não tem semana cai para a
 * diária e depois para o nome.
 */
export function pesquisadoRows(
  prospects: PesquisadoInput[],
  destinationSlug: string,
  days: number[] = DESTINO_DURATIONS,
  now: Date = new Date(),
): PesquisadoRow[] {
  const porDuracao = (p: PesquisadoInput, d: number): number | null => {
    if (d === 1) return p.researched_daily_brl;
    if (d === 7) return p.researched_weekly_brl;
    if (d === 15) return p.researched_biweekly_brl;
    if (d === 30) return p.researched_monthly_brl;
    return null;
  };

  return prospects
    .filter((p) => p.researched_at != null && isPesquisaFresca(p.researched_at, now))
    .map((p) => ({ p, totals: days.map((d) => porDuracao(p, d)) }))
    .filter(({ totals }) => totals.some((t) => t != null))
    .map(({ p, totals }) => ({
      key: `pesquisado:${p.slug}`,
      label: (p.public_name ?? "").trim() || p.name,
      shortLabel: p.name,
      path: p.public_path ?? caminhoFicha(destinationSlug, p.public_slug ?? p.slug),
      totals,
      researchedAt: p.researched_at as string,
    }))
    .sort((a, b) => {
      const ref = (r: PesquisadoRow) =>
        r.totals[days.indexOf(7)] ?? r.totals[days.indexOf(1)] ?? Infinity;
      const d = ref(a) - ref(b);
      return d !== 0 ? d : a.label.localeCompare(b.label, "pt-BR");
    });
}

/**
 * A resposta curta quando o destino não tem parceiro nenhum.
 *
 * Nesse caso o preço pesquisado é a única resposta possível para "quanto custa", e é
 * a frase que um motor de IA extrai. Some assim que existe parceiro: aí a resposta
 * curta é a nossa oferta, com data do motor, e duas respostas curtas na mesma página
 * seriam duas verdades para a mesma pergunta.
 */
export function pesquisadoSummary(
  rows: PesquisadoRow[],
  days: number[] = DESTINO_DURATIONS,
): { total: number; label: string; researchedAt: string } | null {
  const i = days.indexOf(1);
  if (i < 0) return null;
  let melhor: { total: number; label: string; researchedAt: string } | null = null;
  for (const r of rows) {
    const t = r.totals[i];
    if (t == null) continue;
    if (melhor === null || t < melhor.total) {
      melhor = { total: t, label: r.shortLabel, researchedAt: r.researchedAt };
    }
  }
  return melhor;
}

/**
 * A maior queda de preço por diária entre as vagas do destino.
 *
 * Escolhe a maior, e não a da vaga mais barata, porque a frase responde "existe
 * desconto por permanência aqui?". Uma vaga de diária fixa (queda zero) não
 * responde isso e não deve calar as que respondem. Queda abaixo de 1% não vira
 * frase: arredondaria para "0%" e afirmaria desconto onde não há.
 */
export function longStayInsight(dest: PriceDestination, days: number[]): LongStayInsight | null {
  const units = carUnits(dest.units);
  const ordenadas = [...days].sort((a, b) => a - b);
  const menor = ordenadas[0];
  if (menor == null) return null;

  let melhor: LongStayInsight | null = null;
  for (const u of units) {
    const base = perDay(priceFor(u, menor));
    if (base == null || base <= 0) continue;
    // A maior duração que essa vaga de fato cota. Vaga sem preço em 30 diárias
    // compara com a maior que tiver, em vez de sumir da conta.
    let alvo: { days: number; perDay: number } | null = null;
    for (const d of ordenadas) {
      if (d === menor) continue;
      const pd = perDay(priceFor(u, d));
      if (pd != null) alvo = { days: d, perDay: pd };
    }
    if (!alvo) continue;
    const dropPct = Math.round((1 - alvo.perDay / base) * 100);
    if (dropPct < 1) continue;
    if (melhor === null || dropPct > melhor.dropPct) {
      melhor = {
        unitLabel: unitLabel(u, units),
        parkingTypeName: u.parking_type_name,
        fromDays: menor,
        toDays: alvo.days,
        perDayFrom: base,
        perDayTo: alvo.perDay,
        dropPct,
      };
    }
  }
  return melhor;
}

/** Tudo que o bloco de preço da página de destino precisa, numa passada só. */
export function buildDestinoPrices(
  dest: PriceDestination,
  days: number[] = DESTINO_DURATIONS,
): DestinoPrices {
  const summary = destinationSummary(dest, days);
  return {
    matrix: buildMatrix(dest, days),
    summary,
    longStay: longStayInsight(dest, days),
    lastUpdated: summary.lastUpdated,
  };
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const MAX_META = 160;
/**
 * Piso do texto escrito à mão que precisa sobrar para valer a pena abrir espaço ao
 * preço. Abaixo disso a frase que sobra vira um toco (o caso de Guarulhos, cuja
 * primeira frase é só "Procurando estacionamento perto do Aeroporto de Guarulhos
 * (GRU)?"), e a geografia local vale mais que o número.
 */
const PISO_AUTORAL = 80;

/**
 * Meta description da página de destino: geografia escrita à mão MAIS o preço do dado.
 *
 * Snippet sem número perde para snippet com número na mesma SERP, e nenhuma das 26
 * descrições do banco traz um valor. Mas elas trazem o que dado nenhum sabe (os
 * Terminais 1/2/3 de Guarulhos, "na Ilha do Governador", "traslado a Curitiba"), então
 * a saída não é escolher entre as duas: é encaixar as duas dentro dos 160.
 *
 * A ordem de tentativa vai da mais informativa para a mais conservadora, e a última é
 * sempre devolver o texto humano intacto. Frase escrita por gente **nunca** é cortada no
 * meio: o encurtamento só acontece descartando frases inteiras a partir do fim, que é
 * onde mora o fecho genérico ("Compare preços e reserve a sua vaga pela Movepark").
 */
export function destinationMetaDescription(args: {
  label: string;
  city: string;
  /** Texto escrito à mão no banco (`destination.meta_description`). */
  authored?: string | null;
  /** Usado quando não há texto autoral nem preço. */
  fallback: string;
  summary?: DestinationSummary | null;
  prospectCount?: number;
}): string {
  const s = args.summary;
  const diaria = s?.byDuration.find((d) => d.days === 1);
  const sete = s?.byDuration.find((d) => d.days === 7);
  const autoral = args.authored?.trim() || null;

  // Sem preço não há o que acrescentar: manda o texto humano, ou o genérico.
  if (!s || !diaria) return autoral ?? args.fallback;

  const longa = sete
    ? `Diária a partir de ${brl.format(diaria.from)}, 7 diárias por ${brl.format(sete.from)}.`
    : `Diária a partir de ${brl.format(diaria.from)}.`;
  const curta = `Diária a partir de ${brl.format(diaria.from)}.`;

  if (autoral) {
    // Quem já escreveu um preço à mão sabe o que quer: não mexemos.
    if (/R\$/.test(autoral)) return autoral;
    for (const bloco of frasesDecrescentes(autoral)) {
      if (bloco.length < PISO_AUTORAL) break;
      for (const preco of [longa, curta]) {
        const junto = `${bloco} ${preco}`;
        if (junto.length <= MAX_META) return junto;
      }
    }
    return autoral;
  }

  const quantos =
    s.unitCount === 1 ? "1 estacionamento parceiro" : `${s.unitCount} estacionamentos parceiros`;
  const comparados = args.prospectCount
    ? `${quantos} e mais ${args.prospectCount} mapeados`
    : quantos;
  const texto =
    `Estacionamento perto do ${args.label}, em ${args.city}. ${longa} ` +
    `${comparados}, com preço do motor de reservas.`;
  return cortar(texto, MAX_META);
}

/**
 * O texto autoral inteiro, depois sem a última frase, depois sem as duas últimas, e
 * assim por diante. Quebra em `.`, `!` e `?`, preservando a pontuação.
 */
function frasesDecrescentes(texto: string): string[] {
  const frases = texto
    .match(/[^.!?]+[.!?]*/g)
    ?.map((f) => f.trim())
    .filter(Boolean) ?? [texto];
  const saidas: string[] = [];
  for (let n = frases.length; n >= 1; n--) saidas.push(frases.slice(0, n).join(" "));
  return saidas;
}

/** Corta em `max` sem quebrar palavra, com reticência. */
function cortar(texto: string, max: number): string {
  if (texto.length <= max) return texto;
  const corte = texto.slice(0, max - 1);
  const espaco = corte.lastIndexOf(" ");
  return `${(espaco > 0 ? corte.slice(0, espaco) : corte).replace(/[.,;:]$/, "")}…`;
}

/**
 * Uma linha do ranking de distância até o destino.
 *
 * `kind` separa quem vende de quem só está mapeado, porque a ordem da lista é por
 * distância e o lote mapeado pode muito bem ser o mais perto. Misturar sem marcar
 * faria a linha parecer reservável (ADR-010).
 */
export type ProximityRow = {
  key: string;
  name: string;
  detail: string | null;
  /** Endereço do lote, quando existe. Vinha do card mapeado, que a lista absorveu. */
  address: string | null;
  /** Nota do Google, só no lote mapeado e só quando o snapshot ainda vale. */
  rating: { avg: number; count: number } | null;
  /** `null` no lote sem coordenada aproveitável: ele entra no fim da lista, sem número. */
  meters: number | null;
  distanceLabel: string | null;
  path: string;
  kind: "partner" | "mapped";
};

/** O que a lista precisa saber de um lote mapeado para desenhar a linha. */
export type ProximityProspect = {
  name: string;
  slug: string;
  /** Caminho da ficha, montado no banco. É o valor bom: quem chama repassa o da RPC. */
  public_path?: string | null;
  /**
   * Último segmento da URL pública. O fallback usa ELE, nunca o `slug`, que é o slug
   * legado: `/estacionamentos/<destino>/<slug legado>` não é rota nenhuma. Num clique
   * dentro do app não há requisição HTTP, então o 301 do Worker nunca roda e a pessoa
   * cai em "Vaga não encontrada" (30/08/2026, 131 links da lista de distância).
   */
  public_slug?: string | null;

  address?: string | null;
  distance_km: number | null;
  /** Ponto do destino mais perto deste lote ("Terminal 2"), quando o destino tem pontos. */
  reference_name?: string | null;
  rating?: { avg: number; count: number } | null;
};

/**
 * Ranking de distância até o destino, medido no banco (PostGIS, ADR-001).
 *
 * É o bloco que o concorrente digita à mão e erra: para a mesma unidade em
 * Viracopos ele publica 4,5 km e a nossa geodésica mede 1,289 km. Aqui nenhuma
 * distância é escrita por humano, e por isso a lista só mostra quem tem medida.
 *
 * Uma linha por LOCATION, não por vaga: a mesma unidade com vaga coberta e
 * descoberta está no mesmo endereço, e repetir o endereço em duas linhas com a
 * mesma distância transformaria a lista num eco da tabela de preços.
 */
export function proximityRanking(args: {
  units: PriceUnit[];
  prospects: ProximityProspect[];
  /** Slug PÚBLICO do destino. O legado aqui monta URL que só existe atrás de um 301. */
  destinationSlug: string;
  /** Rótulo do que fica no fim da frase de distância ("do terminal"). */
  anchorLabel?: string | null;
  /**
   * Endereço do parceiro por `company_slug/location_slug`. A matriz de preço não
   * carrega endereço (ela é do motor), e quem tem é a vitrine; sem o mapa a linha
   * do parceiro sai sem endereço, e a lista continua de pé.
   */
  addressByLocation?: Map<string, string | null>;
}): ProximityRow[] {
  const sufixo = args.anchorLabel ? ` ${args.anchorLabel}` : "";
  const carros = carUnits(args.units);
  const porLocation = new Map<string, PriceUnit>();
  for (const u of carros) {
    if (u.distance_m == null) continue;
    const chave = `${u.company_slug}/${u.location_slug}`;
    // A vaga mais perto manda quando o mesmo endereço aparece duas vezes (a
    // distância é da location, então na prática é a mesma).
    const atual = porLocation.get(chave);
    if (!atual || (atual.distance_m ?? Infinity) > u.distance_m) porLocation.set(chave, u);
  }

  const parceiros: ProximityRow[] = [...porLocation.entries()].map(([chave, u]) => ({
    key: `p:${chave}`,
    name: unitLabel(u, carros),
    // Sem rótulo de traslado aqui, de propósito. `location.has_shuttle` está `false` nas
    // duas unidades de Viracopos enquanto os cards logo acima mostram "Transfer grátis"
    // pelas amenidades: o campo não é confiável hoje. Ficar em silêncio ao lado de um card
    // que promete transfer já lê como incoerência, e renderizar o inverso seria pior. O
    // traslado continua no card e na página da unidade, que é onde ele é verdade.
    detail: null,
    address: args.addressByLocation?.get(chave) ?? null,
    rating: null,
    meters: u.distance_m as number,
    distanceLabel: `${formatDistance(u.distance_m)}${sufixo}`,
    path: u.public_path ?? "",
    kind: "partner",
  }));

  const mapeados: ProximityRow[] = args.prospects.map((p) => {
    const meters = p.distance_km == null ? null : Math.round(p.distance_km * 1000);
    return {
      key: `m:${p.slug}`,
      name: p.name,
      detail: "sem reserva online",
      address: p.address ?? null,
      rating: p.rating ?? null,
      meters,
      // O nome do ponto vence o rótulo genérico do destino: "400 m do Terminal 2"
      // localiza, "400 m do terminal" só repete o que a seção já disse.
      distanceLabel:
        meters == null
          ? null
          : `${formatDistance(meters)}${p.reference_name ? ` do ${p.reference_name}` : sufixo}`,
      path: p.public_path ?? caminhoFicha(args.destinationSlug, p.public_slug ?? p.slug),
      kind: "mapped" as const,
    };
  });

  // Lote sem medida vai para o fim: a lista promete ordem por distância, e um
  // "sem medida" no meio quebraria a leitura de quem está comparando número.
  return [...parceiros, ...mapeados].sort(
    (a, b) => (a.meters ?? Infinity) - (b.meters ?? Infinity),
  );
}
