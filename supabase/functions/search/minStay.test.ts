import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildMinStayMap, minSellableDays } from "./minStay.ts";

Deno.test("minSellableDays: tabela que começa em 3 diárias devolve 3", () => {
  // Abbapark e Nationpark em CWB: nenhum tier cobre 1 ou 2 diárias.
  assertEquals(
    minSellableDays({
      id: "lpt-1",
      has_minimum_stay: true,
      minimum_stay_value: 3,
      minimum_stay_unit: "days",
      pricing_rule: {
        pricing_tier: [
          { from_day: 3, is_old_price: false },
          { from_day: 7, is_old_price: false },
          { from_day: 15, is_old_price: false },
        ],
      },
    }),
    3,
  );
});

Deno.test("minSellableDays: vale a maior das duas fontes", () => {
  // Exigência de 5 diárias com tabela a partir de 3: quem manda é a exigência.
  assertEquals(
    minSellableDays({
      id: "lpt-2",
      has_minimum_stay: true,
      minimum_stay_value: 5,
      minimum_stay_unit: "days",
      pricing_rule: { pricing_tier: [{ from_day: 3, is_old_price: false }] },
    }),
    5,
  );
  // Sem exigência declarada, o piso vem da tabela.
  assertEquals(
    minSellableDays({
      id: "lpt-3",
      has_minimum_stay: false,
      minimum_stay_value: null,
      minimum_stay_unit: null,
      pricing_rule: { pricing_tier: [{ from_day: 4, is_old_price: false }] },
    }),
    4,
  );
});

Deno.test("minSellableDays: tabela de preço antigo não conta como piso", () => {
  // A linha is_old_price é o "de", não o que se vende.
  assertEquals(
    minSellableDays({
      id: "lpt-4",
      pricing_rule: {
        pricing_tier: [
          { from_day: 1, is_old_price: false },
          { from_day: 9, is_old_price: true },
        ],
      },
    }),
    null,
  );
});

Deno.test("minSellableDays: lote que já vende 1 diária não tem piso", () => {
  assertEquals(
    minSellableDays({
      id: "lpt-5",
      has_minimum_stay: true,
      minimum_stay_value: 1,
      minimum_stay_unit: "days",
      pricing_rule: { pricing_tier: [{ from_day: 1, is_old_price: false }] },
    }),
    null,
  );
});

Deno.test("minSellableDays: mínimo em horas não vira diária", () => {
  assertEquals(
    minSellableDays({
      id: "lpt-6",
      has_minimum_stay: true,
      minimum_stay_value: 6,
      minimum_stay_unit: "hours",
      pricing_rule: null,
    }),
    null,
  );
});

Deno.test("minSellableDays: sem tabela e sem exigência, não há o que inferir", () => {
  assertEquals(minSellableDays({ id: "lpt-7" }), null);
  assertEquals(minSellableDays({ id: "lpt-8", pricing_rule: [] }), null);
});

Deno.test("minSellableDays: aceita pricing_rule embrulhada em array", () => {
  assertEquals(
    minSellableDays({
      id: "lpt-9",
      pricing_rule: [{ pricing_tier: [{ from_day: 3, is_old_price: false }] }],
    }),
    3,
  );
});

Deno.test("buildMinStayMap: só entra quem tem piso", () => {
  const map = buildMinStayMap([
    { id: "com-piso", pricing_rule: { pricing_tier: [{ from_day: 3, is_old_price: false }] } },
    { id: "sem-piso", pricing_rule: { pricing_tier: [{ from_day: 1, is_old_price: false }] } },
  ]);
  assertEquals(map.get("com-piso"), 3);
  assertEquals(map.has("sem-piso"), false);
  assertEquals(buildMinStayMap(null).size, 0);
});
