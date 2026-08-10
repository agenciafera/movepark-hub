/**
 * Amostrador da tabela de preço do white-label (E0.13).
 *
 * Reconstrói no Hub a tabela de uma unidade externa perguntando o preço ao parceiro em pontos
 * escolhidos, e não em grade uniforme. O perigo mora nas viradas (tolerância de fração, virada
 * de diária, fronteira entre faixas); grade uniforme passa por cima de um degrau e interpola
 * errado exatamente onde o preço muda.
 *
 * **Determinístico por decisão.** Nada de modelo em runtime: se alucinar uma célula, vende-se
 * vaga com preço errado e tem que honrar. Toda a lógica aqui é aritmética sobre respostas do
 * parceiro, e a rede entra por injeção (`QuoteFn`), para o algoritmo ser testável sem rede.
 */

/** Uma cotação do parceiro. `oldPrice` é a tabela de balcão dele, quando existe. */
export type Quote = { price: number; oldPrice: number | null };

/** Pergunta o preço de `days` diárias mais `extraMinutes` de fração. Injetado. */
export type QuoteFn = (days: number, extraMinutes: number) => Promise<Quote>;

export type SampledTier = { fromDay: number; toDay: number | null; unitPrice: number };

export type SampledTable = {
  tiers: SampledTier[];
  /** Diária da tabela de balcão (`old_price / dias`), quando o parceiro devolve uma. */
  oldPriceDaily: number | null;
  /** Minutos de fração que ainda cabem na diária corrente, sem promover para a próxima. */
  toleranceMinutes: number;
  /** Piso da tabela: menos que isso o parceiro recusa a reserva. 1 quando não há mínimo. */
  minimumDays: number;
  calls: number;
  /** Achados que merecem olho humano. Não impedem a gravação. */
  anomalies: string[];
};

/** Até onde a curva é amostrada dia a dia. Acima disso a última faixa é aberta. */
export const MAX_DAYS = 31;
/** Teto da busca binária da fração: um dia inteiro de minutos. */
const DAY_MINUTES = 1440;
/**
 * Até onde subir procurando o piso quando o parceiro recusa sem dizer o número.
 *
 * Sete é o maior mínimo plausível numa tabela de estacionamento de aeroporto (uma semana).
 * Acima disso é mais provável que a recusa seja outra coisa, e insistir só gastaria chamada
 * escondendo o erro de verdade.
 */
const MAX_MINIMUM_PROBE = 7;

/** Centavos, para comparar preço sem herdar o erro do ponto flutuante. */
function cents(v: number): number {
  return Math.round(v * 100);
}

function toReais(c: number): number {
  return Math.round(c) / 100;
}

/**
 * Descobre o piso da tabela do parceiro.
 *
 * Caminho normal: uma chamada. Pergunta-se o preço de 1 diária; se o parceiro recusar dizendo
 * o mínimo, é ele quem informa o número e acabou. A subida dia a dia é só a rede para o dia em
 * que a mensagem mudar de formato: sem ela, uma vírgula no texto do parceiro voltaria a derrubar
 * a vaga inteira.
 */
export async function discoverMinimumDays(
  quote: QuoteFn,
): Promise<{ minimumDays: number; firstQuote: Quote; calls: number }> {
  let calls = 0;
  for (let d = 1; d <= MAX_MINIMUM_PROBE; d++) {
    try {
      const firstQuote = await quote(d, 0);
      calls++;
      return { minimumDays: d, firstQuote, calls };
    } catch (e) {
      calls++;
      const declared = (e as { minimumDays?: number }).minimumDays;
      // Recusa por outro motivo (500, produto errado, tenant fora do ar) sobe como está: tratar
      // como piso mascararia a falha e gravaria uma tabela truncada.
      if (typeof declared !== "number") throw e;
      if (declared > MAX_MINIMUM_PROBE) {
        throw new Error(`estadia mínima de ${declared} dias, acima do teto de ${MAX_MINIMUM_PROBE}`);
      }
      // O parceiro disse o número: pula direto para ele em vez de subir de um em um.
      if (declared > d) d = declared - 1;
    }
  }
  throw new Error(`o parceiro recusou até ${MAX_MINIMUM_PROBE} diárias sem informar um piso`);
}

/**
 * Reconstrói a tabela inteira de uma vaga.
 *
 * Custo: `MAX_DAYS - piso + 1` chamadas nas bordas (a do piso serve também para descobri-lo) e
 * 11 na busca binária. Para uma vaga sem mínimo e 31 dias, 42 chamadas; com piso de 3, 40.
 */
export async function sampleWlPriceTable(quote: QuoteFn): Promise<SampledTable> {
  const anomalies: string[] = [];
  let calls = 0;

  // 0. Piso da tabela. Amostrar abaixo dele não é "faltar dado", é gravar preço que o parceiro
  //    recusa: a busca ordenaria a unidade como a mais barata e o cliente bateria na recusa
  //    depois do clique.
  const { minimumDays, firstQuote, calls: minimumCalls } = await discoverMinimumDays(quote);
  calls += minimumCalls;
  if (minimumDays > 1) anomalies.push(`estadia mínima do parceiro: ${minimumDays} diárias`);

  // 1. Bordas exatas, dia a dia. É isto que encontra a fronteira sem chute, inclusive a do
  //    dia 6 para o 7, que uma grade de 5 em 5 pularia.
  const perDay: { days: number; total: number; unit: number; oldTotal: number | null }[] = [];
  for (let d = minimumDays; d <= MAX_DAYS; d++) {
    let q: Quote;
    if (d === minimumDays) {
      // O piso já foi cotado quando foi descoberto. Perguntar de novo seria uma chamada a mais
      // por vaga, todo dia, para receber a mesma resposta.
      q = firstQuote;
    } else {
      q = await quote(d, 0);
      calls++;
    }
    const unitCents = cents(q.price) / d;
    if (!Number.isInteger(Math.round(unitCents * 1000) / 1000)) {
      // Diária que não fecha em centavo exato: o parceiro não está usando diária uniforme
      // nesta faixa, e forçar o mapeamento esconderia isso.
      anomalies.push(`dia ${d}: ${q.price} não divide em diária exata`);
    }
    perDay.push({
      days: d,
      total: cents(q.price),
      unit: Math.round(unitCents),
      oldTotal: q.oldPrice == null ? null : cents(q.oldPrice),
    });
  }

  // 2. Agrupa faixas onde a diária muda. Sem chute: a borda é onde o valor virou.
  const tiers: SampledTier[] = [];
  for (const row of perDay) {
    const last = tiers[tiers.length - 1];
    if (last && last.unitPrice === toReais(row.unit)) {
      last.toDay = row.days;
    } else {
      tiers.push({ fromDay: row.days, toDay: row.days, unitPrice: toReais(row.unit) });
    }
  }
  // A última faixa segue aberta: acima de MAX_DAYS não foi medido, e fechar em 31 inventaria
  // um degrau que ninguém observou.
  if (tiers.length > 0) tiers[tiers.length - 1].toDay = null;

  // 3. Tabela de balcão. O parceiro pode ter uma própria (o Virapark tem: 40,00/dia fixo),
  //    que não é multiplicador do preço de venda.
  const oldPriceDaily = resolveOldPriceDaily(perDay, anomalies);

  // 4. Tolerância de fração, por busca binária num dia fixo. Procura o maior extra que ainda
  //    cabe na diária corrente. O dia fixo é o PISO, não o dia 1: abaixo do piso o parceiro
  //    recusa, e a busca binária inteira responderia erro em vez de preço.
  const base = perDay[0];
  const { minutes, calls: toleranceCalls } = await findToleranceMinutes(
    quote,
    base.total,
    minimumDays,
  );
  calls += toleranceCalls;

  anomalies.push(...findCommercialAnomalies(perDay));

  return { tiers, oldPriceDaily, toleranceMinutes: minutes, minimumDays, calls, anomalies };
}

/**
 * Busca binária do limite da fração, entre 0 e 24h, num dia fixo.
 *
 * Invariante: em 0 o preço é o da diária cheia; em 1440 já é a diária seguinte. Procura-se a
 * maior fração que ainda não promove.
 */
export async function findToleranceMinutes(
  quote: QuoteFn,
  baseTotalCents: number,
  baseDays = 1,
): Promise<{ minutes: number; calls: number }> {
  let low = 0;
  let high = DAY_MINUTES;
  let calls = 0;

  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    const q = await quote(baseDays, mid);
    calls++;
    if (cents(q.price) === baseTotalCents) low = mid;
    else high = mid;
  }
  return { minutes: low, calls };
}

/** Diária de balcão, se o parceiro devolve `old_price` coerente ao longo da curva. */
function resolveOldPriceDaily(
  perDay: { days: number; oldTotal: number | null }[],
  anomalies: string[],
): number | null {
  const comDados = perDay.filter((r) => r.oldTotal != null && r.oldTotal > 0);
  if (comDados.length === 0) return null;

  const diarias = new Set(comDados.map((r) => Math.round(r.oldTotal! / r.days)));
  if (diarias.size > 1) {
    anomalies.push(
      `old_price não é diária uniforme (valores por dia: ${[...diarias].map(toReais).join(", ")})`,
    );
  }
  return toReais(Math.round(comDados[0].oldTotal! / comDados[0].days));
}

/**
 * Anomalia comercial: ficar mais tempo sair mais barato (D-008).
 *
 * O Virapark tem esse degrau entre 6 e 7 dias. Existe na tabela do parceiro, não é bug nosso,
 * e o amostrador detectar sozinho é o que transforma este job também em auditoria de tabela.
 */
export function findCommercialAnomalies(
  perDay: { days: number; total: number }[],
): string[] {
  const out: string[] = [];
  for (let i = 1; i < perDay.length; i++) {
    const antes = perDay[i - 1];
    const agora = perDay[i];
    if (agora.total < antes.total) {
      out.push(
        `ficar mais tempo sai mais barato: ${antes.days} dias custa ${toReais(antes.total)} e ` +
          `${agora.days} dias custa ${toReais(agora.total)}`,
      );
    }
  }
  return out;
}

/**
 * Mapeia o resultado para o vocabulário do motor do Hub.
 *
 * `uniform_by_duration` e `fixed_bracket` são tratados de forma idêntica pelo `simulate_price`;
 * usa-se o primeiro por ser o que descreve a curva do parceiro (diária uniforme por faixa).
 */
export function toHubPricing(table: SampledTable): {
  rule: Record<string, unknown>;
  tiers: { from_day: number; to_day: number | null; unit_price: number; is_old_price: boolean }[];
} {
  const tiers = table.tiers.map((t) => ({
    from_day: t.fromDay,
    to_day: t.toDay,
    unit_price: t.unitPrice,
    is_old_price: false,
  }));

  if (table.oldPriceDaily != null) {
    tiers.push({
      // Começa no piso, igual à tabela de venda: cotar balcão para uma estadia que o parceiro
      // recusa mostraria um "de R$ X" que não existe em lugar nenhum.
      from_day: table.minimumDays,
      to_day: null,
      unit_price: table.oldPriceDaily,
      is_old_price: true,
    });
  }

  return {
    rule: {
      strategy: "uniform_by_duration",
      fractional_day_policy: "hour_tolerance",
      // O motor guarda a tolerância em HORAS; o amostrador mede em minutos.
      fractional_day_tolerance: Math.round((table.toleranceMinutes / 60) * 100) / 100,
      old_price_strategy: table.oldPriceDaily != null ? "own_table" : "none",
    },
    tiers,
  };
}
