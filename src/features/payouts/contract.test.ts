import { describe, it, expect } from "vitest";
import {
  abbreviateHash,
  buildContractText,
  contractPdfFilename,
  CONTRACT_SUMMARY,
} from "./contract";

const V1 = {
  version: "v1",
  sha256: "20aa30ee25bb776d1ac92d68e8e2ff09a4c7e2848c0667821eb86a658e543a9a",
  body: "CONTRATO DE PARCERIA - MOVEPARK\nVersão v1\n\n1. OBJETO\nTexto.\n\n4. REPASSE\n\n5. VIGÊNCIA E ENCERRAMENTO",
};

describe("buildContractText", () => {
  it("usa o corpo vindo do banco e acrescenta parceiro, versão e hash", () => {
    const t = buildContractText(V1, { companyName: "Virapark" });
    expect(t.startsWith(V1.body)).toBe(true);
    expect(t).toContain("Parceiro: Virapark");
    expect(t).toContain("OBJETO");
    expect(t).toContain("REPASSE");
    expect(t).toContain("ENCERRAMENTO");
    expect(t).toContain("Versão: v1");
    expect(t).toContain(`SHA-256 do texto: ${V1.sha256}`);
  });

  it("usa PARCEIRO como padrão quando não há nome", () => {
    expect(buildContractText(V1)).toContain("Parceiro: PARCEIRO");
  });

  it("registra a data quando há aceite", () => {
    const t = buildContractText(V1, { acceptedAt: "2026-07-14T12:00:00Z" });
    expect(t).toContain("Assinado em:");
  });

  it("o resumo tem os tópicos principais", () => {
    expect(CONTRACT_SUMMARY.length).toBeGreaterThanOrEqual(4);
    expect(CONTRACT_SUMMARY.join(" ")).toContain("comissão");
  });
});

describe("abbreviateHash", () => {
  it("mostra os 12 primeiros hex com reticências", () => {
    expect(abbreviateHash(V1.sha256)).toBe("20aa30ee25bb…");
  });
  it("hash curto sai inteiro; nulo continua nulo", () => {
    expect(abbreviateHash("abc")).toBe("abc");
    expect(abbreviateHash(null)).toBeNull();
    expect(abbreviateHash(undefined)).toBeNull();
  });
});

describe("contractPdfFilename", () => {
  it("um arquivo por versão, igual ao da Edge", () => {
    expect(contractPdfFilename("v1")).toBe("contrato-parceria-movepark-v1.pdf");
    expect(contractPdfFilename("2026 09/B")).toBe("contrato-parceria-movepark-2026-09-b.pdf");
  });
});
