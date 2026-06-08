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

it("guard: há casos golden cobrindo as 7 estratégias", () => {
  const strategies = new Set(priceCases.map((c) => c.strategy));
  expect(strategies).toEqual(
    new Set([
      "uniform_by_duration",
      "surcharge",
      "fixed_bracket",
      "tiered_progressive",
      "incremental_formula",
      "monthly_remainder",
      "hourly_capped",
    ]),
  );
});
