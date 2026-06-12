import { describe, expect, it } from "vitest";
import {
  buildCapacityRulesPatch,
  capacityRulesFromLpt,
  validateCapacityRules,
  type CapacityRulesValues,
} from "./capacity-rules.logic";

const lpt = {
  near_capacity_threshold: 5,
  near_capacity_message: "Últimas vagas",
  has_minimum_stay: true,
  minimum_stay_value: 3,
  minimum_stay_unit: "days" as const,
  has_minimum_date: false,
  minimum_date: null,
};

function form(overrides: Partial<CapacityRulesValues> = {}): CapacityRulesValues {
  return {
    near_capacity_threshold: "",
    near_capacity_message: "",
    has_minimum_stay: false,
    minimum_stay_value: "",
    minimum_stay_unit: "days",
    has_minimum_date: false,
    minimum_date: "",
    ...overrides,
  };
}

describe("capacityRulesFromLpt", () => {
  it("converte a linha em valores de form (string)", () => {
    expect(capacityRulesFromLpt(lpt)).toEqual({
      near_capacity_threshold: "5",
      near_capacity_message: "Últimas vagas",
      has_minimum_stay: true,
      minimum_stay_value: "3",
      minimum_stay_unit: "days",
      has_minimum_date: false,
      minimum_date: "",
    });
  });

  it("defaults para unit quando null", () => {
    expect(
      capacityRulesFromLpt({ ...lpt, minimum_stay_unit: null }).minimum_stay_unit,
    ).toBe("days");
  });
});

describe("validateCapacityRules", () => {
  it("aceita form vazio", () => {
    expect(validateCapacityRules(form())).toBeNull();
  });

  it("rejeita threshold negativo ou não inteiro", () => {
    expect(validateCapacityRules(form({ near_capacity_threshold: "-1" }))).toMatch(/quase-lotação/);
    expect(validateCapacityRules(form({ near_capacity_threshold: "2.5" }))).toMatch(/quase-lotação/);
  });

  it("exige estadia mínima >= 1 quando habilitada", () => {
    expect(validateCapacityRules(form({ has_minimum_stay: true, minimum_stay_value: "0" }))).toMatch(
      /estadia mínima/i,
    );
    expect(
      validateCapacityRules(form({ has_minimum_stay: true, minimum_stay_value: "2" })),
    ).toBeNull();
  });

  it("exige data quando data mínima habilitada", () => {
    expect(validateCapacityRules(form({ has_minimum_date: true }))).toMatch(/data mínima/);
    expect(
      validateCapacityRules(form({ has_minimum_date: true, minimum_date: "2027-01-01" })),
    ).toBeNull();
  });
});

describe("buildCapacityRulesPatch", () => {
  it("strings vazias viram null", () => {
    expect(buildCapacityRulesPatch(form())).toEqual({
      near_capacity_threshold: null,
      near_capacity_message: null,
      has_minimum_stay: false,
      minimum_stay_value: null,
      minimum_stay_unit: null,
      has_minimum_date: false,
      minimum_date: null,
    });
  });

  it("inclui valores quando regras ligadas", () => {
    const patch = buildCapacityRulesPatch(
      form({
        near_capacity_threshold: "3",
        near_capacity_message: " Aviso ",
        has_minimum_stay: true,
        minimum_stay_value: "5",
        minimum_stay_unit: "hours",
        has_minimum_date: true,
        minimum_date: "2027-02-01",
      }),
    );
    expect(patch).toEqual({
      near_capacity_threshold: 3,
      near_capacity_message: "Aviso",
      has_minimum_stay: true,
      minimum_stay_value: 5,
      minimum_stay_unit: "hours",
      has_minimum_date: true,
      minimum_date: "2027-02-01",
    });
  });

  it("desligar a regra zera value/unit mesmo com dados no form", () => {
    const patch = buildCapacityRulesPatch(
      form({ has_minimum_stay: false, minimum_stay_value: "5", minimum_stay_unit: "days" }),
    );
    expect(patch.minimum_stay_value).toBeNull();
    expect(patch.minimum_stay_unit).toBeNull();
  });
});
