import { assert, assertEquals, assertRejects } from "jsr:@std/assert";
import {
  discoverMinimumDays,
  findCommercialAnomalies,
  MAX_DAYS,
  sampleWlPriceTable,
  toHubPricing,
  type Quote,
} from "./price-sampler.ts";
import { WlMinimumStayError } from "./client.ts";

/**
 * Parceiro com piso de estadia, como Abbapark, Nationpark e Plenty (3 diárias) e Aeroparking (2).
 * Abaixo do piso ele recusa com 400 dizendo o número, e é assim que o amostrador aprende onde a
 * tabela começa.
 */
function comPiso(piso: number, diaria = 25.9) {
  const asked: number[] = [];
  const quote = (days: number, extra: number): Promise<Quote> => {
    asked.push(days);
    const d = extra > 0 ? days + 1 : days;
    if (d < piso) {
      return Promise.reject(new WlMinimumStayError(piso, "teste"));
    }
    return Promise.resolve({ price: Math.round(d * diaria * 100) / 100, oldPrice: null });
  };
  return { quote, asked, get calls() { return asked.length; } };
}

/**
 * A tabela real do Virapark, amostrada à mão em 03/08/2026 e registrada na spec:
 * 1 dia R$ 40,00 · 2 a 6 dias R$ 32,90/dia · 7 a 31 dias R$ 24,90/dia.
 * Tolerância de fração de exatamente 60 minutos, e 61 min promove a diária seguinte
 * reprecificando tudo na faixa nova. Balcão fixo em R$ 40,00/dia.
 *
 * Serve de oráculo: se o amostrador reconstrói esta curva sem tocar na rede, ele reconstrói
 * a de verdade.
 */
function precoVirapark(days: number, extraMinutes: number): Quote {
  const d = extraMinutes > 60 ? days + 1 : days;
  const diaria = d === 1 ? 40 : d <= 6 ? 32.9 : 24.9;
  return {
    price: Math.round(d * diaria * 100) / 100,
    oldPrice: d * 40,
  };
}

function espiao() {
  let calls = 0;
  const quote = (days: number, extra: number) => {
    calls++;
    return Promise.resolve(precoVirapark(days, extra));
  };
  return { quote, get calls() { return calls; } };
}

Deno.test("reconstrói as três faixas do Virapark, com as bordas exatas", async () => {
  const t = await sampleWlPriceTable(espiao().quote);
  assertEquals(t.tiers, [
    { fromDay: 1, toDay: 1, unitPrice: 40, totalPrice: null },
    { fromDay: 2, toDay: 6, unitPrice: 32.9, totalPrice: null },
    // Aberta de propósito: acima de MAX_DAYS ninguém mediu, e fechar em 31 inventaria degrau.
    { fromDay: 7, toDay: null, unitPrice: 24.9, totalPrice: null },
  ]);
});

Deno.test("acha a tolerância de fração de 60 minutos", async () => {
  const t = await sampleWlPriceTable(espiao().quote);
  assertEquals(t.toleranceMinutes, 60);
});

Deno.test("lê a tabela de balcão como tabela própria, não como multiplicador", async () => {
  const t = await sampleWlPriceTable(espiao().quote);
  assertEquals(t.oldPriceTiers, [{ fromDay: 1, toDay: null, unitPrice: 40, totalPrice: null }]);
});

Deno.test("custa 42 chamadas: 31 bordas + 11 sondagens", async () => {
  const e = espiao();
  const t = await sampleWlPriceTable(e.quote);
  assertEquals(e.calls, MAX_DAYS + 11);
  assertEquals(t.calls, e.calls);
});

Deno.test("denuncia a anomalia comercial do dia 6 para o 7 (D-008)", async () => {
  const t = await sampleWlPriceTable(espiao().quote);
  // 6 dias custa 197,40 e 7 dias custa 174,30: ficar um dia a mais sai mais barato. Existe na
  // tabela do parceiro, e o job detectar sozinho é o que o torna também auditoria.
  assert(
    t.anomalies.some((a) => a.includes("mais tempo sai mais barato")),
    `esperava anomalia, veio: ${JSON.stringify(t.anomalies)}`,
  );
});

Deno.test("mapeia para o vocabulário do motor do Hub", async () => {
  const t = await sampleWlPriceTable(espiao().quote);
  const { rule, tiers } = toHubPricing(t);

  assertEquals(rule.strategy, "uniform_by_duration");
  assertEquals(rule.fractional_day_policy, "hour_tolerance");
  // O motor guarda em horas; o amostrador mede em minutos.
  assertEquals(rule.fractional_day_tolerance, 1);
  assertEquals(rule.old_price_strategy, "own_table");

  assertEquals(tiers.filter((t) => !t.is_old_price).length, 3);
  assertEquals(tiers.filter((t) => t.is_old_price), [
    { from_day: 1, to_day: null, unit_price: 40, total_price: null, is_old_price: true },
  ]);
});

Deno.test("curva sem degrau vira uma faixa só", async () => {
  const plano = (days: number) => Promise.resolve({ price: days * 25, oldPrice: null });
  const t = await sampleWlPriceTable(plano);
  assertEquals(t.tiers, [{ fromDay: 1, toDay: null, unitPrice: 25, totalPrice: null }]);
  assertEquals(t.oldPriceTiers, null);
  assertEquals(toHubPricing(t).rule.old_price_strategy, "none");
});

Deno.test("sem tolerância, a fração promove na hora", async () => {
  // Parceiro que cobra diária nova a qualquer minuto extra.
  const semTolerancia = (days: number, extra: number) =>
    Promise.resolve({ price: (extra > 0 ? days + 1 : days) * 30, oldPrice: null });
  const t = await sampleWlPriceTable(semTolerancia);
  assertEquals(t.toleranceMinutes, 0);
  assertEquals(toHubPricing(t).rule.fractional_day_tolerance, 0);
});

Deno.test("dia que não fecha em diária exata vira preço fechado, sem arredondar", async () => {
  // 3 dias por 100,00 dá 33,3333 por dia. Arredondar para 33,33 faria o Hub cobrar 99,99, e
  // para 33,34 faria cobrar 100,02. Nenhum dos dois é o preço do parceiro.
  const torto = (days: number) =>
    Promise.resolve({ price: days === 3 ? 100 : days * 30, oldPrice: null });
  const t = await sampleWlPriceTable(torto);
  const faixa = t.tiers.find((x) => x.fromDay === 3)!;
  assertEquals(faixa, { fromDay: 3, toDay: 3, unitPrice: null, totalPrice: 100 });
});

Deno.test("findCommercialAnomalies fica quieto em curva monotônica", () => {
  const curva = [1, 2, 3].map((d) => ({ days: d, total: d * 3000 }));
  assertEquals(findCommercialAnomalies(curva), []);
});

// ───────────────────────── Estadia mínima do parceiro ─────────────────────────

Deno.test("sem piso, a descoberta custa uma chamada e devolve 1", async () => {
  const e = espiao();
  const { minimumDays, calls } = await discoverMinimumDays(e.quote);
  assertEquals(minimumDays, 1);
  assertEquals(calls, 1);
});

Deno.test("o piso vem do número que o parceiro diz, sem subir de um em um", async () => {
  const p = comPiso(3);
  const { minimumDays, calls } = await discoverMinimumDays(p.quote);
  assertEquals(minimumDays, 3);
  // Duas chamadas: a recusa no dia 1 (que já entrega o "3") e o acerto no dia 3. Sem o salto,
  // seriam três.
  assertEquals(calls, 2);
});

Deno.test("recusa que não é de estadia mínima sobe como erro, não vira piso", async () => {
  const quebrado = () => Promise.reject(new Error("WL calculation-price 500: boom"));
  await assertRejects(() => discoverMinimumDays(quebrado), Error, "boom");
});

Deno.test("a tabela de um parceiro com piso começa no piso, não no dia 1", async () => {
  const t = await sampleWlPriceTable(comPiso(3).quote);
  assertEquals(t.minimumDays, 3);
  assertEquals(t.tiers, [{ fromDay: 3, toDay: null, unitPrice: 25.9, totalPrice: null }]);
});

Deno.test("o piso entra nas anomalias, para aparecer no log da passada", async () => {
  const t = await sampleWlPriceTable(comPiso(3).quote);
  assert(
    t.anomalies.some((a) => a.includes("estadia mínima do parceiro: 3")),
    `esperava o piso nas anomalias, veio: ${JSON.stringify(t.anomalies)}`,
  );
});

Deno.test("a faixa de balcão também começa no piso", async () => {
  // Parceiro com piso 2 E tabela de balcão: o "de R$ X" não pode existir abaixo do piso.
  const quote = (days: number, extra: number): Promise<Quote> => {
    const d = extra > 0 ? days + 1 : days;
    if (d < 2) return Promise.reject(new WlMinimumStayError(2, "teste"));
    return Promise.resolve({ price: d * 30, oldPrice: d * 40 });
  };
  const t = await sampleWlPriceTable(quote);
  assertEquals(
    toHubPricing(t).tiers.filter((x) => x.is_old_price),
    [{ from_day: 2, to_day: null, unit_price: 40, total_price: null, is_old_price: true }],
  );
});

Deno.test("depois de achar o piso, o amostrador não pergunta mais abaixo dele", async () => {
  const p = comPiso(3);
  const t = await sampleWlPriceTable(p.quote);

  // A sondagem que descobre o piso é a única que pode cair abaixo dele.
  assertEquals(p.asked[0], 1);
  assertEquals(p.asked.slice(1).filter((d) => d < 3), []);
  assertEquals(t.calls, p.calls);
});

Deno.test("as bordas vão do piso ao teto, e a fração é medida no piso", async () => {
  const PISO = 3;
  const p = comPiso(PISO);
  await sampleWlPriceTable(p.quote);

  // Bordas: um dia de cada, do piso ao teto. A do piso é a própria sondagem que o descobriu.
  const bordas = MAX_DAYS - PISO + 1;
  assertEquals(
    p.asked.slice(1, 1 + bordas),
    Array.from({ length: bordas }, (_, i) => PISO + i),
  );

  // O resto é a busca binária da fração, e ela pergunta SEMPRE sobre o piso. Ancorada no dia 1,
  // toda sondagem voltaria 400 e a tolerância sairia errada sem ninguém perceber.
  assertEquals([...new Set(p.asked.slice(1 + bordas))], [PISO]);
});

// ──────────────────── Faixa de preço fechado (valet do Aeropark) ────────────────────

/**
 * A tabela real do valet do Aeropark, medida contra o parceiro em 10/08/2026.
 *
 * Piso de 2 diárias. De 2 a 6 soma R$ 79,20 por dia. De 6 a 10 custa **R$ 475,20 fechado**: o
 * dia 7 custa o mesmo que o dia 6, e o 10 também. De 11 a 17, R$ 554,40. De 18 a 30, R$ 633,60.
 * De 31 em diante volta a ser diária, R$ 21,12.
 *
 * É a curva que denunciou o defeito: modelada como diária, 7 diárias viravam R$ 67,89/dia e o
 * Hub cobrava R$ 475,23 onde o parceiro cobra R$ 475,20.
 */
function precoValetAeropark(days: number): number {
  if (days <= 6) return Math.round(days * 79.2 * 100) / 100;
  if (days <= 10) return 475.2;
  if (days <= 17) return 554.4;
  if (days <= 30) return 633.6;
  return Math.round(days * 21.12 * 100) / 100;
}

function valetAeropark(days: number, extra: number): Promise<Quote> {
  const d = extra > 0 ? days + 1 : days;
  if (d < 2) return Promise.reject(new WlMinimumStayError(2, "teste"));
  return Promise.resolve({ price: precoValetAeropark(d), oldPrice: null });
}

Deno.test("reconhece faixa de preço fechado em vez de inventar diária", async () => {
  const t = await sampleWlPriceTable(valetAeropark);
  assertEquals(t.tiers, [
    { fromDay: 2, toDay: 5, unitPrice: 79.2, totalPrice: null },
    { fromDay: 6, toDay: 10, unitPrice: null, totalPrice: 475.2 },
    { fromDay: 11, toDay: 17, unitPrice: null, totalPrice: 554.4 },
    { fromDay: 18, toDay: 30, unitPrice: null, totalPrice: 633.6 },
    // A cauda volta a ser diária, então segue aberta: 45 diárias × 21,12 = R$ 950,40, que é o
    // que o parceiro cobra.
    { fromDay: 31, toDay: null, unitPrice: 21.12, totalPrice: null },
  ]);
});

Deno.test("a tabela reproduz o parceiro ao centavo, inclusive onde não divide", async () => {
  const t = await sampleWlPriceTable(valetAeropark);
  const { tiers } = toHubPricing(t);

  // Espelha o que o `_apply_pricing` faz: acha a faixa e aplica total fechado ou dias × diária.
  const hub = (days: number) => {
    const faixa = tiers
      .filter((x) => !x.is_old_price)
      .find((x) => (x.to_day == null ? days >= x.from_day : days >= x.from_day && days <= x.to_day));
    if (!faixa) return null;
    return faixa.total_price ?? Math.round(days * faixa.unit_price! * 100) / 100;
  };

  for (let d = 2; d <= 31; d++) {
    assertEquals(hub(d), precoValetAeropark(d), `${d} diárias`);
  }
  // Os três dias que o modelo antigo errava, nomeados: eram 475,23 / 554,45 / 554,37.
  assertEquals(hub(7), 475.2);
  assertEquals(hub(13), 554.4);
  assertEquals(hub(17), 554.4);
});

Deno.test("curva com faixa fechada é gravada como fixed_bracket", async () => {
  const t = await sampleWlPriceTable(valetAeropark);
  assertEquals(toHubPricing(t).rule.strategy, "fixed_bracket");
});

Deno.test("faixa fechada no fim da amostragem não fica aberta", async () => {
  // Preço fechado aberto diria "qualquer estadia acima disto custa o mesmo", que ninguém mediu.
  // Sem faixa, o motor devolve NULL e a busca descarta, que é o honesto.
  const platoNoFim = (days: number) => Promise.resolve({ price: days <= 5 ? days * 30 : 200, oldPrice: null });
  const t = await sampleWlPriceTable(platoNoFim);
  assertEquals(t.tiers[t.tiers.length - 1], {
    fromDay: 6,
    toDay: MAX_DAYS,
    unitPrice: null,
    totalPrice: 200,
  });
});
