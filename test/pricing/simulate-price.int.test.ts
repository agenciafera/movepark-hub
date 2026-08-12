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

describe.skipIf(!hasEnv)("simulate_price (motor de preço, banco vivo)", () => {
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
const ESTRATEGIAS_NO_BANCO_VIVO = ["incremental_formula", "monthly_remainder", "hourly_capped"];

it("guard: os casos golden cobrem as estratégias que o banco vivo ainda precifica", () => {
  const strategies = new Set(priceCases.map((c) => c.strategy));
  expect(strategies).toEqual(new Set(ESTRATEGIAS_NO_BANCO_VIVO));
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
