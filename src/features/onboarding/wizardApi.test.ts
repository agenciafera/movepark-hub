import { describe, expect, it } from "vitest";
import { WIZARD_LPT_SELECT } from "./wizardApi";

// Regressão: o embed de pricing_rule precisa do hint do FK, senão o PostgREST
// retorna PGRST201 (pricing_rule tem 2 FKs p/ location_parking_type) e o wizard
// de onboarding fica sem itens/preços (etapa de precificação quebrada).
describe("WIZARD_LPT_SELECT", () => {
  it("desambigua o embed de pricing_rule com o hint do FK", () => {
    expect(WIZARD_LPT_SELECT).toContain(
      "pricing_rule:pricing_rule!pricing_rule_location_parking_type_id_fkey(",
    );
  });
  it("não usa o embed ambíguo 'pricing_rule(' sem hint", () => {
    expect(WIZARD_LPT_SELECT).not.toMatch(/(^|[^!])pricing_rule\(/);
  });
});
