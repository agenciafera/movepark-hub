import { describe, expect, it } from "vitest";
import { priceCases } from "./cases";

// Lê env do Vite (.env carregado pelo Vitest). Sem credenciais → suíte é pulada.
const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const hasEnv = !!URL && !!ANON && !URL.includes("placeholder");

type SimResult = { price?: number | string; strategy?: string; error?: string };

// Chama a RPC simulate_price via PostgREST (evita o supabase-js/realtime no node).
async function simulate(p: {
  p_company: string;
  p_location: string;
  p_parking_type: string;
  p_days: number;
}): Promise<SimResult> {
  const res = await fetch(`${URL}/rest/v1/rpc/simulate_price`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON!,
      Authorization: `Bearer ${ANON}`,
    },
    body: JSON.stringify(p),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return (await res.json()) as SimResult;
}

/** Índice de preço do site: a mesma fonte que a página de destino publica. */
async function priceIndex(): Promise<{
  destinations: {
    units: {
      company_slug: string;
      location_slug: string;
      parking_type_code: string;
      checkout_mode: string;
      prices: { days: number; total: number | null }[];
    }[];
  }[];
}> {
  const res = await fetch(`${URL}/rest/v1/rpc/destination_price_index`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON!, Authorization: `Bearer ${ANON}` },
    body: "{}",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

describe.skipIf(!hasEnv)("simulate_price (motor de preço, banco vivo)", () => {
  // Registro condicional porque `it.each([])` quebra na COLETA do vitest, antes de qualquer
  // skip valer. A lista está vazia desde 12/09/2026; ver o cabeçalho de `cases.ts`.
  if (priceCases.length > 0) {
    it.each(priceCases)(
      "$company/$location/$parking_type $days d → R$ $expected ($strategy)",
      async (c) => {
        const res = await simulate({
          p_company: c.company,
          p_location: c.location,
          p_parking_type: c.parking_type,
          p_days: c.days,
        });
        expect(res.error, `simulate_price retornou erro: ${res.error}`).toBeUndefined();
        expect(res.strategy).toBe(c.strategy);
        expect(Number(res.price)).toBeCloseTo(c.expected, 2);
      },
    );
  }

  it("retorna erro estruturado para tipo de vaga inexistente", async () => {
    const res = await simulate({
      p_company: "inexistente",
      p_location: "nada",
      p_parking_type: "covered",
      p_days: 1,
    });
    expect(res.error).toBeTruthy();
  });
});

/**
 * Estratégias que o banco VIVO ainda consegue exercitar.
 *
 * `tiered_progressive` e `surcharge` saíram daqui em 10/08/2026, quando Aeropark e Abbapark
 * viraram unidades externas: a tabela delas passou a ser espelhada do parceiro, então o valor
 * golden deixou de descrever aquelas linhas. O `surcharge` sumiu por tabela de arrasto, porque o
 * único caso vivo dele era o valet do Aerovalet emprestando a tabela do Aeropark, vínculo que
 * teve de ser cortado.
 *
 * `uniform_by_duration` e `fixed_bracket` saíram em 12/08/2026, pelo mesmo motivo: as três
 * unidades da Aerovalet (Congonhas, Tietê e Guarulhos) viraram externas, e eram as últimas
 * `hub` que praticavam essas duas.
 *
 * As quatro continuam cobertas em `supabase/tests/pricing.test.sql`, que roda contra o seed
 * congelado, e lá existe o guard das SETE. Ver o cabeçalho de `cases.ts`.
 *
 * Sobram aqui as três que só unidade nossa pratica. A lista é exata de propósito: perder uma
 * estratégia daqui sem perceber é o defeito que este guard existe para pegar, e ganhar uma sem
 * atualizar a lista também merece um olhar.
 */
const ESTRATEGIAS_NO_BANCO_VIVO: string[] = [];

it("guard: os casos golden cobrem as estratégias que o banco vivo ainda precifica", () => {
  const strategies = new Set(priceCases.map((c) => c.strategy));
  expect(
    strategies,
    "a lista esvaziou em 12/09/2026 com a desativação das fixtures; se uma unidade NOSSA voltar a\n" +
      "praticar incremental_formula, monthly_remainder ou hourly_capped, traga o caso de volta",
  ).toEqual(new Set(ESTRATEGIAS_NO_BANCO_VIVO));
});

it("guard: nenhum caso golden aponta para unidade externa", () => {
  // Unidade externa tem tabela espelhada do parceiro: ela muda quando ele mexe no preço dele, e
  // o caso vira vermelho sem que nada esteja errado do nosso lado.
  const EXTERNAS = [
    "abbapark",
    "nationpark",
    "plenty",
    "garageinn",
    "aeropark",
    "virapark",
    "aerovalet",
  ];
  const intrusos = priceCases.filter((c) => EXTERNAS.includes(c.company));
  expect(
    intrusos.map((c) => `${c.company}/${c.parking_type}`),
    "caso golden em unidade externa: mova a cobertura para o pgTAP (seed congelado)",
  ).toEqual([]);
});

/**
 * O que substituiu o valor golden: a produção conferida contra ela mesma.
 *
 * Existe porque em 12/08/2026 as fixtures de demonstração foram desativadas e os casos golden
 * viraram todos "Tipo de vaga não encontrado", deixando o `live-integration` vermelho na `main`
 * por quase um mês. O defeito de fundo não foi a desativação: foi o teste depender de linhas
 * específicas de um banco que muda por operação, e não por deploy.
 *
 * Estes dois não apodrecem, porque leem o que estiver vivo no dia. E cobrem o risco que
 * importa de verdade: o índice de preço é o que a página de destino publica, e o
 * `simulate_price` é o que o checkout cobra. Se os dois divergirem, o site anuncia um número e
 * cobra outro, que é o mesmo defeito de "duas respostas para a mesma pergunta" que a auditoria
 * de 08/09/2026 apontou no comparador concorrente.
 */
/**
 * Estes dois batem no banco vivo dezenas de vezes, e o runner do CI tem latência bem maior que
 * a máquina de quem desenvolve: local rodam em ~4 s e no GitHub estouraram os 5 s padrão do
 * vitest na primeira tentativa. As chamadas passaram a ir em paralelo e o teto é generoso de
 * propósito, porque o que se mede aqui é divergência de preço, não tempo de resposta.
 */
const TIMEOUT = 60_000;

describe.skipIf(!hasEnv)("produção: preço publicado contra preço calculado", () => {
  it("toda unidade que o site lista é precificável", { timeout: TIMEOUT }, async () => {
    const idx = await priceIndex();
    const units = idx.destinations.flatMap((d) => d.units);
    expect(units.length, "o índice de preço voltou vazio; isso já é o defeito").toBeGreaterThan(0);

    const quebradas = (
      await Promise.all(
        units.map(async (u) => {
          const res = await simulate({
            p_company: u.company_slug,
            p_location: u.location_slug,
            p_parking_type: u.parking_type_code,
            p_days: 7,
          });
          const rotulo = `${u.company_slug}/${u.location_slug}/${u.parking_type_code}`;
          return res.error || !(Number(res.price) > 0)
            ? `${rotulo}: ${res.error ?? res.price}`
            : null;
        }),
      )
    ).filter((x): x is string => x !== null);

    expect(quebradas, "unidade listada que o motor não consegue precificar").toEqual([]);
  });

  it(
    "o preço publicado no índice é o mesmo que o motor calcula",
    { timeout: TIMEOUT },
    async () => {
      const idx = await priceIndex();
      // `total` nulo é legítimo: unidade com estadia mínima não cota durações curtas.
      const pares = idx.destinations
        .flatMap((d) => d.units)
        .flatMap((u) => u.prices.filter((p) => p.total != null).map((p) => ({ u, p })));

      const divergentes = (
        await Promise.all(
          pares.map(async ({ u, p }) => {
            const res = await simulate({
              p_company: u.company_slug,
              p_location: u.location_slug,
              p_parking_type: u.parking_type_code,
              p_days: p.days,
            });
            return Math.abs(Number(res.price) - p.total!) > 0.01
              ? `${u.company_slug}/${u.location_slug}/${u.parking_type_code} ${p.days}d: ` +
                  `índice R$ ${p.total} contra motor R$ ${res.price}`
              : null;
          }),
        )
      ).filter((x): x is string => x !== null);

      expect(
        divergentes,
        "a página anuncia um preço e o motor cobra outro para a mesma unidade e duração",
      ).toEqual([]);
    },
  );
});
