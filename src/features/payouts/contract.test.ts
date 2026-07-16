import { describe, it, expect } from "vitest";
import { buildContractText, CONTRACT_VERSION, CONTRACT_SUMMARY } from "./contract";

describe("buildContractText", () => {
  it("inclui o parceiro, a versão e as cláusulas principais", () => {
    const t = buildContractText({ companyName: "Virapark" });
    expect(t).toContain("Virapark");
    expect(t).toContain(CONTRACT_VERSION);
    expect(t).toContain("OBJETO");
    expect(t).toContain("REPASSE");
    expect(t).toContain("ENCERRAMENTO");
  });

  it("usa PARCEIRO como padrão quando não há nome", () => {
    expect(buildContractText()).toContain("PARCEIRO");
  });

  it("registra a data quando há aceite", () => {
    const t = buildContractText({ acceptedAt: "2026-07-14T12:00:00Z" });
    expect(t).toContain("Assinado em:");
  });

  it("o resumo tem os tópicos principais", () => {
    expect(CONTRACT_SUMMARY.length).toBeGreaterThanOrEqual(4);
    expect(CONTRACT_SUMMARY.join(" ")).toContain("comissão");
  });
});
