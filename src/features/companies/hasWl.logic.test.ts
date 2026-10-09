import { describe, expect, it } from "vitest";
import { anyCompanyHasWl, companyHasWl } from "./hasWl.logic";

describe("companyHasWl", () => {
  it("tem white-label só com domínio preenchido", () => {
    expect(companyHasWl({ wl_domain: "parceiro-app.movepark.co" })).toBe(true);
    expect(companyHasWl({ wl_domain: "  " })).toBe(false);
    expect(companyHasWl({ wl_domain: null })).toBe(false);
    expect(companyHasWl(null)).toBe(false);
  });
  it("o painel mostra quando alguma empresa em foco tem", () => {
    expect(anyCompanyHasWl([{ wl_domain: null }, { wl_domain: "x-app.movepark.co" }])).toBe(true);
    expect(anyCompanyHasWl([{ wl_domain: null }])).toBe(false);
    expect(anyCompanyHasWl([])).toBe(false);
  });
});
