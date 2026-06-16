import { describe, expect, it } from "vitest";
import { buildSearchParams } from "./SearchBarPill.logic";

const from = new Date("2026-07-01T22:00:00.000Z");
const to = new Date("2026-07-05T08:00:00.000Z");

describe("buildSearchParams", () => {
  it("busca nova (sem base): só escopo dest/from/to/vehicle", () => {
    const p = buildSearchParams({ base: null, dest: "GRU", from, to, vehicle: "car" });
    expect(p.get("dest")).toBe("GRU");
    expect(p.get("from")).toBe(from.toISOString());
    expect(p.get("to")).toBe(to.toISOString());
    expect(p.get("vehicle")).toBe("car");
    expect(p.get("operator")).toBeNull();
  });

  it("preserva filtros existentes e sobrescreve o escopo", () => {
    const base = new URLSearchParams(
      "dest=CGH&operator=aerovalet,plenty&amenities=cameras_24h&sort=rating_desc&category=valet&max_distance_km=5",
    );
    const p = buildSearchParams({ base, dest: "GRU", from, to, vehicle: "motorcycle" });
    // escopo sobrescrito
    expect(p.get("dest")).toBe("GRU");
    expect(p.get("vehicle")).toBe("motorcycle");
    expect(p.get("from")).toBe(from.toISOString());
    // filtros preservados
    expect(p.get("operator")).toBe("aerovalet,plenty");
    expect(p.get("amenities")).toBe("cameras_24h");
    expect(p.get("sort")).toBe("rating_desc");
    expect(p.get("category")).toBe("valet");
    expect(p.get("max_distance_km")).toBe("5");
  });

  it("não muta o base original", () => {
    const base = new URLSearchParams("operator=plenty");
    buildSearchParams({ base, dest: "GRU", from, to, vehicle: "car" });
    expect(base.get("dest")).toBeNull();
    expect(base.get("operator")).toBe("plenty");
  });

  it("destino nulo remove o param dest do base", () => {
    const base = new URLSearchParams("dest=GRU&operator=plenty");
    const p = buildSearchParams({ base, dest: null, from, to, vehicle: "car" });
    expect(p.get("dest")).toBeNull();
    expect(p.get("operator")).toBe("plenty");
  });

  it("zera a paginação (offset) numa busca nova", () => {
    const base = new URLSearchParams("offset=40&operator=plenty");
    const p = buildSearchParams({ base, dest: "GRU", from, to, vehicle: "car" });
    expect(p.get("offset")).toBeNull();
    expect(p.get("operator")).toBe("plenty");
  });
});
