import { describe, expect, it } from "vitest";

import {
  extractAssertions,
  extractLinks,
  findDrift,
  formatReport,
  normalizeForMatch,
  normalizeMoney,
  normalizePhone,
} from "@/features/partner-sites/llms-drift.logic";

const LLMS = `# Virapark

> Diária de R$ 24,90 na reserva online a partir de 7 dias.

| Período | Preço de balcão | Preço online |
| --- | --- | --- |
| 7 dias | R$ 280,00 | R$ 174,30 |
| 30 dias | R$ 1.200,00 | R$ 747,00 |

- WhatsApp e telefone: (19) 98801-3420
- E-mail: pergunte@virapark.com.br

- [Tabela de preços](https://www.virapark.com.br/precos): valores por período.
- [FAQ](https://www.virapark.com.br/faq): dúvidas comuns.
`;

describe("normalização", () => {
  it("tira acento, nbsp e caixa para a comparação não brigar com o HTML do Wix", () => {
    expect(normalizeForMatch("Diária  R$ 174,30")).toBe("diaria r$ 174,30");
  });

  it("canoniza dinheiro com e sem separador de milhar", () => {
    expect(normalizeMoney("R$ 1.200,00")).toBe("r$ 1200,00");
    expect(normalizeMoney("R$174,30")).toBe("r$ 174,30");
  });

  it("reduz telefone a dígitos, para máscara diferente ainda casar", () => {
    expect(normalizePhone("(19) 98801-3420")).toBe("19988013420");
  });
});

describe("extractAssertions", () => {
  it("colhe dinheiro, e-mail e telefone, sem repetir", () => {
    const a = extractAssertions(LLMS);
    expect(a.filter((x) => x.kind === "dinheiro").map((x) => x.value)).toEqual([
      "R$ 24,90",
      "R$ 280,00",
      "R$ 174,30",
      "R$ 1.200,00",
      "R$ 747,00",
    ]);
    expect(a.filter((x) => x.kind === "email").map((x) => x.value)).toEqual([
      "pergunte@virapark.com.br",
    ]);
    expect(a.filter((x) => x.kind === "telefone").map((x) => x.value)).toEqual(["(19) 98801-3420"]);
  });

  it("ignora prosa: só entra fato conferível", () => {
    const a = extractAssertions("> Estacionamento com vagas cobertas e traslado 24 horas.");
    expect(a).toEqual([]);
  });
});

describe("extractLinks", () => {
  it("colhe os links markdown uma vez cada", () => {
    expect(extractLinks(LLMS)).toEqual([
      { label: "Tabela de preços", url: "https://www.virapark.com.br/precos" },
      { label: "FAQ", url: "https://www.virapark.com.br/faq" },
    ]);
  });
});

describe("findDrift", () => {
  const site = [
    "Estacione com diárias a partir de R$ 24,90",
    "7 dias R$ 280,00 R$ 174,30",
    "30 dias R$ 1.200,00 R$ 747,00",
    "WhatsApp: (19) 98801-3420",
    "Email: pergunte@virapark.com.br",
  ].join("\n");

  it("não acusa nada quando o site ainda sustenta tudo", () => {
    expect(findDrift(extractAssertions(LLMS), site)).toEqual([]);
  });

  it("casa mesmo quando o site escreve sem espaço depois do R$", () => {
    expect(findDrift(extractAssertions("R$ 24,90"), "menor preço R$24,90/dia")).toEqual([]);
  });

  it("casa valor com separador de milhar (o falso positivo do primeiro run)", () => {
    expect(findDrift(extractAssertions("R$ 1.200,00"), "30 dias R$ 1.200,00")).toEqual([]);
  });

  it("não confunde 24,90 com 124,90: comparação é de valor, não de substring", () => {
    const drift = findDrift(extractAssertions("R$ 24,90"), "diária de R$ 124,90");
    expect(drift.map((d) => d.value)).toEqual(["R$ 24,90"]);
  });

  it("casa telefone com máscara diferente", () => {
    expect(findDrift(extractAssertions("(19) 98801-3420"), "fone 19 98801 3420")).toEqual([]);
  });

  it("acusa o preço que sumiu do site, que é o caso da virada de tabela", () => {
    const semSeteDias = site.replace("R$ 174,30", "R$ 199,90");
    const drift = findDrift(extractAssertions(LLMS), semSeteDias);
    expect(drift.map((d) => d.value)).toEqual(["R$ 174,30"]);
    expect(drift[0].reason).toContain("não aparece mais");
  });

  it("acusa e-mail trocado, que foi como o contato do concorrente ficou de pé", () => {
    const outroEmail = site.replace("pergunte@virapark.com.br", "pergunte@garageinn.com.br");
    const drift = findDrift(extractAssertions(LLMS), outroEmail);
    expect(drift.map((d) => d.kind)).toEqual(["email"]);
  });
});

describe("formatReport", () => {
  it("devolve vazio quando está tudo em pé", () => {
    expect(formatReport("virapark.com.br", [], [])).toBe("");
  });

  it("lista drift e link quebrado no mesmo relatório", () => {
    const texto = formatReport(
      "virapark.com.br",
      [{ kind: "dinheiro", value: "R$ 174,30", reason: "sumiu" }],
      [{ label: "FAQ", url: "https://www.virapark.com.br/faq" }],
    );
    expect(texto).toContain("R$ 174,30: sumiu");
    expect(texto).toContain("não responde 200");
  });
});
