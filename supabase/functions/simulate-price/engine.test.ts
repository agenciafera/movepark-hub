// Testa o segundo motor de preço (o TS do /simulate-price) com os MESMOS valores golden do
// motor canônico em SQL. É o teste que não existia quando o fonte só morava em produção, e é
// por isso que o R$ 0,00 do `hourly_capped` ficou publicado sem ninguém ver.
//
// Os valores vêm de `test/pricing/cases.ts` e de `docs/simulacao-precos.md`, nunca de um
// snapshot desta função: gerar o esperado a partir dela cravaria o bug como esperado.
//
// deno test --no-check --allow-env --allow-net --allow-read supabase/functions

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  applyStrategy,
  computePrice,
  ESTRATEGIAS_SUPORTADAS,
  fixedBracket,
  type PricingRow,
  type Tier,
  tieredProgressive,
  uniformByDuration,
} from "./engine.ts";

const tier = (t: Partial<Tier>): Tier => ({
  from_day: 1,
  to_day: null,
  unit_price: null,
  total_price: null,
  is_old_price: false,
  ...t,
});

const row = (r: Partial<PricingRow>): PricingRow => ({
  company_name: "Teste",
  company_slug: "teste",
  location_slug: "unidade",
  location_name: "Unidade",
  parking_type_code: "covered",
  parking_type_name: "Vaga Coberta",
  strategy: "uniform_by_duration",
  old_price_strategy: "none",
  old_price_multiplier: null,
  surcharge_multiplier: null,
  source_strategy: null,
  incremental_one_day_price: null,
  incremental_two_days_price: null,
  incremental_base: null,
  incremental_multiplier: null,
  monthly_fixed_price: null,
  monthly_daily_rate: null,
  tiers: [],
  source_tiers: [],
  ...r,
});

// ── incremental_formula: golden do airpark/faro/covered ─────────────────────
// 1d = 25, 2d = 28, 3+ = base 10 + dias × 9. Os valores são os da `simulate_price` do banco
// (verificados em 14/08/2026: 3d=37, 5d=55, 7d=73, 30d=280).
Deno.test("incremental_formula bate o golden do airpark", () => {
  const r = row({
    strategy: "incremental_formula",
    incremental_one_day_price: 25,
    incremental_two_days_price: 28,
    incremental_base: 10,
    incremental_multiplier: 9,
  });
  assertEquals(computePrice(r, 1).price, 25);
  assertEquals(computePrice(r, 2).price, 28);
  assertEquals(computePrice(r, 3).price, 37); // 10 + 3×9
  assertEquals(computePrice(r, 5).price, 55); // 10 + 5×9
  assertEquals(computePrice(r, 7).price, 73);
  assertEquals(computePrice(r, 30).price, 280);
});

Deno.test("incremental_formula não desconta os dois primeiros dias do multiplicador", () => {
  // Regressão de 14/08/2026: a conta era `base + (dias - 2) × mult` e cobrava 2 diárias a menos
  // que o motor canônico em toda estadia de 3 dias para cima.
  const r = row({
    strategy: "incremental_formula",
    incremental_one_day_price: 25,
    incremental_two_days_price: 28,
    incremental_base: 10,
    incremental_multiplier: 9,
  });
  assertEquals(computePrice(r, 5).price === 37, false);
});

// ── monthly_remainder: golden do ferapark/unidade-aeroporto/covered ─────────
Deno.test("monthly_remainder bate o golden do ferapark", () => {
  const r = row({
    strategy: "monthly_remainder",
    monthly_fixed_price: 310,
    monthly_daily_rate: 21.99,
  });
  assertEquals(computePrice(r, 1).price, 21.99);
  assertEquals(computePrice(r, 30).price, 310);
  assertEquals(computePrice(r, 35).price, 419.95); // 310 + 5×21,99
});

// ── hourly_capped: a regressão que motivou este arquivo ─────────────────────
Deno.test("hourly_capped não publica preço, publica que não sabe", () => {
  const r = row({ strategy: "hourly_capped" });
  const res = computePrice(r, 1);
  assertEquals(res.price, null);
  assertEquals(res.unsupported_strategy, "hourly_capped");
  // O sintoma antigo: R$ 0,00 com HTTP 200, que na vitrine lê como estacionamento de graça.
  assertEquals(res.price === 0, false);
});

Deno.test("estratégia desconhecida cai na mesma recusa", () => {
  const res = computePrice(row({ strategy: "estrategia_do_futuro" }), 7);
  assertEquals(res.price, null);
  assertEquals(res.unsupported_strategy, "estrategia_do_futuro");
});

Deno.test("a lista de suportadas não inclui hourly_capped", () => {
  assertEquals((ESTRATEGIAS_SUPORTADAS as readonly string[]).includes("hourly_capped"), false);
});

// ── as três estratégias de tabela ───────────────────────────────────────────
Deno.test("uniform_by_duration multiplica a diária da faixa", () => {
  const tiers = [
    tier({ from_day: 1, to_day: 6, unit_price: 30 }),
    tier({ from_day: 7, to_day: null, unit_price: 25 }),
  ];
  assertEquals(uniformByDuration(tiers, 3), 90);
  assertEquals(uniformByDuration(tiers, 10), 250); // a faixa de 7+ vale para TODOS os dias
});

Deno.test("uniform_by_duration devolve null quando nenhuma faixa cobre o período", () => {
  // Estadia mínima: a unidade só vende a partir de 3 dias, e 1 dia saía R$ 0,00 na produção
  // antiga. O motor canônico devolve ausência de preço, e é isso que o endpoint publica agora.
  assertEquals(uniformByDuration([tier({ from_day: 3, to_day: 20, unit_price: 30 })], 1), null);
});

Deno.test("computePrice propaga a ausência de preço da tabela", () => {
  const r = row({ tiers: [tier({ from_day: 3, to_day: null, unit_price: 30 })] });
  const res = computePrice(r, 1);
  assertEquals(res.price, null);
  assertEquals(res.old_price, null);
});

Deno.test("tiered_progressive devolve null quando a tabela não alcança a duração", () => {
  const tiers = [tier({ from_day: 1, to_day: 3, unit_price: 40 })];
  assertEquals(tieredProgressive(tiers, 5), null);
});

Deno.test("fixed_bracket devolve null fora das faixas", () => {
  assertEquals(fixedBracket([tier({ from_day: 3, to_day: 7, total_price: 150 })], 1), null);
});

Deno.test("surcharge sem preço de origem não inventa preço", () => {
  const r = row({
    strategy: "surcharge",
    surcharge_multiplier: 1.5,
    source_strategy: "uniform_by_duration",
    source_tiers: [tier({ from_day: 3, to_day: null, unit_price: 20 })],
  });
  assertEquals(computePrice(r, 1).price, null);
});

Deno.test("tiered_progressive cobra cada faixa pelo trecho que ela ocupa", () => {
  const tiers = [
    tier({ from_day: 1, to_day: 3, unit_price: 40 }),
    tier({ from_day: 4, to_day: 7, unit_price: 30 }),
    tier({ from_day: 8, to_day: null, unit_price: 20 }),
  ];
  assertEquals(tieredProgressive(tiers, 2), 80); // 2×40
  assertEquals(tieredProgressive(tiers, 5), 180); // 3×40 + 2×30
  assertEquals(tieredProgressive(tiers, 10), 300); // 3×40 + 4×30 + 3×20
});

Deno.test("fixed_bracket usa o total da faixa, e soma o excedente quando há diária", () => {
  assertEquals(fixedBracket([tier({ from_day: 1, to_day: 7, total_price: 150 })], 5), 150);
  // total no from_day + diária por dia excedente (o valet de 30+ dias)
  const comExcedente = [tier({ from_day: 30, to_day: null, total_price: 600, unit_price: 15 })];
  assertEquals(fixedBracket(comExcedente, 30), 600);
  assertEquals(fixedBracket(comExcedente, 34), 660);
  // só unit_price: vira diária pura
  assertEquals(fixedBracket([tier({ from_day: 1, to_day: null, unit_price: 12 })], 4), 48);
});

// ── surcharge: usa a tabela da unidade de origem e multiplica ───────────────
Deno.test("surcharge multiplica o preço calculado na tabela de origem", () => {
  const r = row({
    strategy: "surcharge",
    surcharge_multiplier: 1.5,
    source_strategy: "uniform_by_duration",
    source_tiers: [tier({ from_day: 1, to_day: null, unit_price: 20 })],
  });
  assertEquals(computePrice(r, 3).price, 90); // 3×20×1,5
});

Deno.test("surcharge sem multiplicador repassa o preço de origem", () => {
  const r = row({
    strategy: "surcharge",
    surcharge_multiplier: null,
    source_strategy: "uniform_by_duration",
    source_tiers: [tier({ from_day: 1, to_day: null, unit_price: 20 })],
  });
  assertEquals(computePrice(r, 3).price, 60);
});

// ── preço antigo (o "de/por" da vitrine) ────────────────────────────────────
Deno.test("old_price por multiplicador arredonda em dois dígitos", () => {
  const r = row({
    strategy: "uniform_by_duration",
    old_price_strategy: "multiplier",
    old_price_multiplier: 1.2,
    tiers: [tier({ from_day: 1, to_day: null, unit_price: 18.9 })],
  });
  const res = computePrice(r, 1);
  assertEquals(res.price, 18.9);
  assertEquals(res.old_price, 22.68);
});

Deno.test("old_price por tabela própria lê as faixas marcadas como antigas", () => {
  const r = row({
    strategy: "uniform_by_duration",
    old_price_strategy: "own_table",
    tiers: [
      tier({ from_day: 1, to_day: null, unit_price: 30 }),
      tier({ from_day: 1, to_day: null, unit_price: 45, is_old_price: true }),
    ],
  });
  const res = computePrice(r, 2);
  assertEquals(res.price, 60);
  assertEquals(res.old_price, 90);
});

Deno.test("sem política de preço antigo, old_price fica null", () => {
  const r = row({ tiers: [tier({ from_day: 1, to_day: null, unit_price: 30 })] });
  assertEquals(computePrice(r, 2).old_price, null);
});

Deno.test("applyStrategy não conhece incremental_formula (ela é tratada antes)", () => {
  // Guard: estratégia sem implementação de tabela responde ausência de preço, nunca 0.
  assertEquals(applyStrategy("incremental_formula", [], 5), null);
});
