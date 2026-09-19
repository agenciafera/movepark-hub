import { describe, expect, it } from "vitest";
import { channelLabel, recentMonths } from "./report.logic";

describe("recentMonths", () => {
  it("do mês atual para trás, atravessando o ano, com intervalo semiaberto em UTC", () => {
    const m = recentMonths(3, new Date("2026-01-15T12:00:00Z"));
    expect(m.map((x) => x.value)).toEqual(["2026-01", "2025-12", "2025-11"]);
    expect(m[0]).toMatchObject({ from: "2026-01-01T00:00:00.000Z", to: "2026-02-01T00:00:00.000Z" });
    expect(m[1].label).toMatch(/dezembro de 2025/);
  });
});

describe("channelLabel", () => {
  it("hub vira Movepark; regra mostra o nome dela", () => {
    expect(channelLabel("hub", false)).toBe("Movepark (busca e site)");
    expect(channelLabel("Site do Abbapark", true)).toBe("Site do Abbapark");
  });
});
