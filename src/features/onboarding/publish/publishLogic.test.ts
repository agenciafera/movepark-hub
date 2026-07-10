import { describe, it, expect } from "vitest";
import {
  buildParkingItems,
  validateParkingItems,
  validateAddress,
  type PublishRow,
} from "./publishLogic";

const catalog = [{ id: "pt-covered" }, { id: "pt-valet" }];

function rows(partial: Record<string, Partial<PublishRow>>): Record<string, PublishRow> {
  const base: Record<string, PublishRow> = {
    "pt-covered": { selected: false, base_price: null, capacity: "" },
    "pt-valet": { selected: false, base_price: null, capacity: "" },
  };
  for (const k of Object.keys(partial)) base[k] = { ...base[k], ...partial[k] };
  return base;
}

describe("buildParkingItems", () => {
  it("coleta só os tipos selecionados, no formato da RPC", () => {
    const items = buildParkingItems(
      catalog,
      rows({ "pt-covered": { selected: true, base_price: 40, capacity: "20" } }),
    );
    expect(items).toEqual([{ parking_type_id: "pt-covered", base_price: 40, capacity: 20 }]);
  });

  it("trata preço/capacidade ausentes como 0", () => {
    const items = buildParkingItems(catalog, rows({ "pt-valet": { selected: true } }));
    expect(items).toEqual([{ parking_type_id: "pt-valet", base_price: 0, capacity: 0 }]);
  });
});

describe("validateParkingItems", () => {
  it("exige ao menos um tipo", () => {
    expect(validateParkingItems([])).toMatch(/ao menos um/i);
  });
  it("exige capacidade > 0", () => {
    expect(
      validateParkingItems([{ parking_type_id: "x", base_price: 40, capacity: 0 }]),
    ).toMatch(/capacidade/i);
  });
  it("exige preço de balcão > 0", () => {
    expect(
      validateParkingItems([{ parking_type_id: "x", base_price: 0, capacity: 10 }]),
    ).toMatch(/balcão/i);
  });
  it("aceita item completo", () => {
    expect(
      validateParkingItems([{ parking_type_id: "x", base_price: 40, capacity: 10 }]),
    ).toBeNull();
  });
});

describe("validateAddress", () => {
  const ok = { name: "Unidade", address: "Rua X, 100", lat: -23.5, lng: -46.6 };
  it("aceita endereço com geo", () => {
    expect(validateAddress(ok)).toBeNull();
  });
  it("exige nome", () => {
    expect(validateAddress({ ...ok, name: " " })).toMatch(/nome/i);
  });
  it("exige endereço", () => {
    expect(validateAddress({ ...ok, address: "" })).toMatch(/endereço/i);
  });
  it("exige geo resolvida", () => {
    expect(validateAddress({ ...ok, lat: null })).toMatch(/localização|mapa/i);
  });
});
