import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PricingRuleSummary } from "@/features/parking-types/PricingSummary";

// Tabela da Pare Seguro (19/11/2026): diária até 14, pacote de 15 a 30 e, acima de 30, pacote +
// diária extra. A faixa 31+ tem total E diária, e o resumo precisa mostrar os dois.
describe("PricingRuleSummary · fixed_bracket", () => {
  it("mostra pacote + diária extra quando a faixa tem os dois valores", () => {
    const { container } = render(
      <PricingRuleSummary
        rule={{
          strategy: "fixed_bracket",
          tiers: [
            { from_day: 1, to_day: 14, unit_price: 18.9, total_price: null },
            { from_day: 15, to_day: 30, unit_price: null, total_price: 290 },
            { from_day: 31, to_day: null, unit_price: 18.9, total_price: 290 },
            { from_day: 31, to_day: null, unit_price: 19.9, total_price: 290, is_old_price: true },
          ],
        }}
      />,
    );
    const linhas = [...container.querySelectorAll("span.tabular-nums")].map((el) =>
      (el.textContent ?? "").replace(/\s+/g, " "),
    );
    expect(linhas).toEqual([
      "1 a 14d: R$ 18,90/dia",
      "15 a 30d: R$ 290,00",
      "31+d: R$ 290,00 + R$ 18,90/dia",
    ]);
  });
});
