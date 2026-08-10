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

/**
 * Uma faixa da tabela do parceiro, nas DUAS formas que ele pratica.
 *
 * `unitPrice`: diária uniforme. O total cresce a cada dia (5 diárias custam 5 × a diária).
 * `totalPrice`: preço fechado. A faixa inteira custa o mesmo, e ficar mais dias dentro dela
 * não muda a conta. O valet do Aeropark é assim: 6 a 10 diárias custam R$ 475,20, ponto.
 *
 * Exatamente uma das duas vem preenchida. Modelar preço fechado como diária foi o que produziu
 * a divergência de centavos que abriu esta correção: R$ 475,20 em 7 diárias vira R$ 67,8857 por
 * dia, arredonda para R$ 67,89, e o Hub passa a cobrar R$ 475,23. Três centavos que ninguém
 * pediu, num preço que é do parceiro.
 */
export type SampledTier = {
  fromDay: number;
  toDay: number | null;
  unitPrice: number | null;
  totalPrice: number | null;
};

export type SampledTable = {
  tiers: SampledTier[];
  /** Faixas da tabela de balcão do parceiro, quando ele devolve uma. Mesmas duas formas. */
  oldPriceTiers: SampledTier[] | null;
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
  const perDay: { days: number; total: number; unit: number | null; oldTotal: number | null }[] = [];
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
    const totalCents = cents(q.price);
    perDay.push({
      days: d,
      total: totalCents,
      // Diária só existe quando o total divide em centavo cheio. Quando não divide, este dia
      // não é diária: é preço fechado, e o agrupamento abaixo o trata como tal.
      unit: totalCents % d === 0 ? totalCents / d : null,
      oldTotal: q.oldPrice == null ? null : cents(q.oldPrice),
    });
  }

  // 2. Agrupa em faixas. Sem chute: a borda é onde o valor virou.
  const tiers = groupIntoTiers(perDay);

  // A última faixa fica aberta SÓ quando é diária: acima de MAX_DAYS ninguém mediu, e
  // extrapolar uma diária é o comportamento de sempre. Preço fechado aberto diria "qualquer
  // estadia maior custa isto", que é barato, inventado e o cliente teria razão em cobrar.
  const ultima = tiers[tiers.length - 1];
  if (ultima && ultima.unitPrice != null) ultima.toDay = null;

  // 3. Tabela de balcão. O parceiro pode ter uma própria (o Virapark tem: 40,00/dia fixo),
  //    que não é multiplicador do preço de venda.
  const oldPriceTiers = resolveOldPriceTiers(perDay);

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

  return { tiers, oldPriceTiers, toleranceMinutes: minutes, minimumDays, calls, anomalies };
}

/** Uma linha da amostragem: quanto custou aquela quantidade de diárias. */
type DayRow = { days: number; total: number; unit: number | null };

/**
 * Transforma a curva dia a dia nas faixas da tabela do parceiro.
 *
 * Duas passadas, porque o parceiro pratica duas formas de cobrança e a mesma unidade pode ter
 * as duas. No valet do Aeropark, por exemplo: 2 a 5 diárias somam R$ 79,20 por dia, 6 a 10
 * custam R$ 475,20 fechado, e de 31 em diante volta a ser diária (R$ 21,12).
 *
 * 1. **Preço fechado.** Dias seguidos que custam exatamente o mesmo total são uma faixa só, com
 *    `totalPrice`. É o que o parceiro está dizendo: dentro desta faixa, tanto faz quantos dias.
 * 2. **Diária.** O que sobra vira faixa de `unitPrice`, juntando dias consecutivos com a mesma
 *    diária exata. Um dia solto cuja diária não fecha em centavo cheio também vira preço
 *    fechado, de um dia só: é a única forma de reproduzir o parceiro sem arredondar.
 *
 * A ordem importa. Agrupar por diária primeiro quebraria a faixa fechada em vários pedaços de um
 * dia, cada um com uma diária inventada.
 */
export function groupIntoTiers(perDay: DayRow[]): SampledTier[] {
  // Passada 1: marca quem faz parte de um platô de total igual.
  const fechado = new Array<boolean>(perDay.length).fill(false);
  for (let a = 0; a < perDay.length; ) {
    let b = a;
    while (b + 1 < perDay.length && perDay[b + 1].total === perDay[a].total) b++;
    if (b > a) for (let k = a; k <= b; k++) fechado[k] = true;
    a = b + 1;
  }

  // Passada 2: emite as faixas, juntando o que é contíguo e do mesmo tipo.
  const tiers: SampledTier[] = [];
  perDay.forEach((row, k) => {
    const last = tiers[tiers.length - 1];
    const contiguo = last?.toDay === row.days - 1;

    if (fechado[k] || row.unit == null) {
      const total = toReais(row.total);
      if (contiguo && last!.totalPrice === total) last!.toDay = row.days;
      else tiers.push({ fromDay: row.days, toDay: row.days, unitPrice: null, totalPrice: total });
      return;
    }

    const unit = toReais(row.unit);
    if (contiguo && last!.unitPrice === unit) last!.toDay = row.days;
    else tiers.push({ fromDay: row.days, toDay: row.days, unitPrice: unit, totalPrice: null });
  });

  return tiers;
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
function resolveOldPriceTiers(
  perDay: { days: number; oldTotal: number | null }[],
): SampledTier[] | null {
  const comDados = perDay.filter((r) => r.oldTotal != null && r.oldTotal > 0);
  if (comDados.length === 0) return null;

  // A tabela de balcão passa pelo MESMO agrupamento da de venda, e pelo mesmo motivo: ela também
  // pode ser faixa de preço fechado. Achatá-la numa diária só (o que se fazia antes, pegando a
  // diária do primeiro dia e repetindo) inflava o "de R$ X" riscado nas durações mais longas, e
  // com ele a linha "X mais barato que o balcão". Economia é afirmação: tem que ser a do parceiro.
  const tiers = groupIntoTiers(
    comDados.map((r) => ({
      days: r.days,
      total: r.oldTotal!,
      unit: r.oldTotal! % r.days === 0 ? r.oldTotal! / r.days : null,
    })),
  );
  // Mesma regra da tabela de venda para a cauda: diária extrapola, preço fechado fecha no teto.
  const ultima = tiers[tiers.length - 1];
  if (ultima && ultima.unitPrice != null) ultima.toDay = null;
  return tiers;
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
 * `uniform_by_duration` e `fixed_bracket` são tratados de forma idêntica pelo `simulate_price`
 * (os dois aceitam `total_price` e `unit_price` por faixa). O nome escolhido é o que descreve a
 * curva: `fixed_bracket` quando há faixa de preço fechado, `uniform_by_duration` quando é diária
 * do começo ao fim. Quem abrir a regra no painel vê o que o parceiro faz.
 */
export function toHubPricing(table: SampledTable): {
  rule: Record<string, unknown>;
  tiers: {
    from_day: number;
    to_day: number | null;
    unit_price: number | null;
    total_price: number | null;
    is_old_price: boolean;
  }[];
} {
  const tiers = table.tiers.map((t) => ({
    from_day: t.fromDay,
    to_day: t.toDay,
    unit_price: t.unitPrice,
    total_price: t.totalPrice,
    is_old_price: false,
  }));
  const temFaixaFechada = table.tiers.some((t) => t.totalPrice != null);

  // As faixas de balcão já começam no piso, porque saem da mesma amostragem: cotar balcão para
  // uma estadia que o parceiro recusa mostraria um "de R$ X" que não existe em lugar nenhum.
  for (const t of table.oldPriceTiers ?? []) {
    tiers.push({
      from_day: t.fromDay,
      to_day: t.toDay,
      unit_price: t.unitPrice,
      total_price: t.totalPrice,
      is_old_price: true,
    });
  }

  return {
    rule: {
      strategy: temFaixaFechada ? "fixed_bracket" : "uniform_by_duration",
      fractional_day_policy: "hour_tolerance",
      // O motor guarda a tolerância em HORAS; o amostrador mede em minutos.
      fractional_day_tolerance: Math.round((table.toleranceMinutes / 60) * 100) / 100,
      old_price_strategy: table.oldPriceTiers != null ? "own_table" : "none",
    },
    tiers,
  };
}
