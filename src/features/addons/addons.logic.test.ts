import { describe, expect, it } from "vitest";
import {
  activeLocationCount,
  buildAddonUpsertArgs,
  buildLocationAddonArgs,
  effectiveAddonPrice,
  validateAddonForm,
  type AddonFormValues,
} from "./addons.logic";

const base: AddonFormValues = {
  name: "Lava-jato",
  description: "",
  base_price: 30,
  is_active: true,
  sort_order: 0,
};

describe("effectiveAddonPrice", () => {
  it("usa o override quando definido", () => {
    expect(effectiveAddonPrice(30, 45)).toBe(45);
  });
  it("usa o preço base quando não há override", () => {
    expect(effectiveAddonPrice(30, null)).toBe(30);
    expect(effectiveAddonPrice(30, undefined)).toBe(30);
  });
  it("respeita override igual a zero como valor explícito", () => {
    expect(effectiveAddonPrice(30, 0)).toBe(0);
  });
});

describe("validateAddonForm", () => {
  it("exige nome", () => {
    expect(validateAddonForm({ ...base, name: "   " })).toMatch(/obrigatório/i);
  });
  it("rejeita preço negativo", () => {
    expect(validateAddonForm({ ...base, base_price: -1 })).toMatch(/negativo/i);
  });
  it("rejeita ordem negativa", () => {
    expect(validateAddonForm({ ...base, sort_order: -3 })).toMatch(/[Oo]rdem/);
  });
  it("aceita um form válido", () => {
    expect(validateAddonForm(base)).toBeNull();
  });
});

describe("buildAddonUpsertArgs", () => {
  it("monta args de criação com trim e descrição nula", () => {
    const args = buildAddonUpsertArgs("c1", null, { ...base, name: "  Lava  ", description: "  " });
    expect(args).toEqual({
      p_company_id: "c1",
      p_id: null,
      p_code: null,
      p_name: "Lava",
      p_description: null,
      p_base_price: 30,
      p_is_active: true,
      p_sort_order: 0,
    });
  });
  it("preserva o id na edição e o preço/descrição", () => {
    const args = buildAddonUpsertArgs("c1", "a1", { ...base, description: "Externa", base_price: null });
    expect(args.p_id).toBe("a1");
    expect(args.p_description).toBe("Externa");
    expect(args.p_base_price).toBe(0);
  });
});

describe("buildLocationAddonArgs", () => {
  it("mantém override positivo quando ativo", () => {
    expect(buildLocationAddonArgs("a1", "l1", true, 50)).toEqual({
      p_add_on_service_id: "a1",
      p_location_id: "l1",
      p_is_active: true,
      p_price_override: 50,
    });
  });
  it("descarta override quando inativo", () => {
    expect(buildLocationAddonArgs("a1", "l1", false, 50).p_price_override).toBeNull();
  });
  it("trata 0/negativo como sem override", () => {
    expect(buildLocationAddonArgs("a1", "l1", true, 0).p_price_override).toBeNull();
    expect(buildLocationAddonArgs("a1", "l1", true, -5).p_price_override).toBeNull();
  });
});

describe("activeLocationCount", () => {
  it("conta apenas unidades ativas", () => {
    expect(
      activeLocationCount([{ is_active: true }, { is_active: false }, { is_active: true }]),
    ).toBe(2);
  });
  it("lida com indefinido", () => {
    expect(activeLocationCount(undefined)).toBe(0);
  });
});
