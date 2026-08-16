import { describe, expect, it } from "vitest";
import { buildVanVCard, vanContactName, vanVCardFilename } from "./vcard";

const VIRAPARK = { companyName: "Virapark", locationName: "Aeroporto de Viracopos" };

describe("vanContactName", () => {
  it("abre com Van, porque é isso que a pessoa procura na agenda no aeroporto", () => {
    expect(vanContactName(VIRAPARK)).toBe("Van Virapark · Aeroporto de Viracopos");
  });

  it("não repete o nome quando a unidade se chama igual à empresa", () => {
    expect(vanContactName({ companyName: "Virapark", locationName: "Virapark" })).toBe(
      "Van Virapark",
    );
  });
});

describe("buildVanVCard", () => {
  it("gera um vCard 3.0 com o telefone em formato internacional", () => {
    const vcf = buildVanVCard({ ...VIRAPARK, phone: "+5519988013420" });

    expect(vcf).toContain("BEGIN:VCARD");
    expect(vcf).toContain("VERSION:3.0");
    expect(vcf).toContain("FN:Van Virapark · Aeroporto de Viracopos");
    expect(vcf).toContain("ORG:Virapark");
    expect(vcf).toContain("TEL;TYPE=CELL:+5519988013420");
    expect(vcf.endsWith("END:VCARD\r\n")).toBe(true);
  });

  it("completa o código do país de um número local, senão o contato não disca", () => {
    const vcf = buildVanVCard({ ...VIRAPARK, phone: "(19) 98801-3420" });
    expect(vcf).toContain("TEL;TYPE=CELL:+5519988013420");
  });

  it("usa CRLF, que é o que o Android importa sem reclamar", () => {
    const vcf = buildVanVCard({ ...VIRAPARK, phone: "+5519988013420" });
    expect(vcf.split("\r\n").length).toBeGreaterThan(5);
    expect(vcf).not.toMatch(/[^\r]\n/);
  });

  /**
   * Vírgula e ponto-e-vírgula são sintaxe no vCard. Sem escapar, um parceiro chamado "Park, Inc."
   * chegaria na agenda com o nome cortado no meio.
   */
  it("escapa vírgula e ponto-e-vírgula do nome do parceiro", () => {
    const vcf = buildVanVCard({
      companyName: "Park, Inc.",
      locationName: "Guarulhos; T3",
      phone: "+5511988887777",
    });
    expect(vcf).toContain("ORG:Park\\, Inc.");
    expect(vcf).toContain("FN:Van Park\\, Inc. · Guarulhos\\; T3");
  });
});

describe("vanVCardFilename", () => {
  it("tira acento e espaço, que é o que sobrevive a qualquer sistema", () => {
    expect(vanVCardFilename({ companyName: "Nationpark", locationName: "Aeroporto Afonso Pena" }))
      .toBe("van-nationpark-aeroporto-afonso-pena.vcf");
  });
});
