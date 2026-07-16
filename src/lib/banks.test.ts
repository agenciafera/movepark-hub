import { describe, it, expect } from "vitest";
import { searchBanks, bankName, BANKS } from "./banks";

describe("banks", () => {
  it("busca por código (prefixo)", () => {
    const r = searchBanks("341");
    expect(r.some((b) => b.code === "341")).toBe(true);
    expect(r.every((b) => b.code.startsWith("341"))).toBe(true);
  });

  it("busca por nome (substring, case-insensitive)", () => {
    const r = searchBanks("nubank");
    expect(r.some((b) => b.code === "260")).toBe(true);
  });

  it("prefixo de código traz vários (ex.: '0')", () => {
    const r = searchBanks("00");
    expect(r.length).toBeGreaterThan(1);
    expect(r.every((b) => b.code.startsWith("00"))).toBe(true);
  });

  it("query vazia devolve a lista toda", () => {
    expect(searchBanks("")).toHaveLength(BANKS.length);
  });

  it("bankName resolve o nome pelo código", () => {
    expect(bankName("237")).toBe("Bradesco");
    expect(bankName("999")).toBeNull();
  });
});
