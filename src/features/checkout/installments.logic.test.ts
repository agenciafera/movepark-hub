import { describe, expect, it } from "vitest";
import { computeInstallmentPlan, DEFAULT_INSTALLMENT_POLICY } from "@/lib/installments";
import {
  cetAnualPct,
  describeInstallmentOption,
  formatPct,
  priceInstallmentCents,
  summarizeInstallmentOption,
} from "./installments.logic";

/**
 * O checkout tem que dizer, para cada parcela com juros, a taxa, o acréscimo em reais e o
 * CET ao mês e ao ano (CDC art. 52). O número que aparece precisa ser o mesmo que a Edge
 * `create-card-charge` cobra, então a parcela é conferida contra o plano do espelho do
 * servidor, e não contra um valor decorado.
 */
const policy = { ...DEFAULT_INSTALLMENT_POLICY, monthlyInterestPct: 2.99, interestFreeUpTo: 3 };

/** O `Intl` separa "R$" do valor com espaço duro; a comparação lê com espaço comum. */
const norm = (s: string) => s.replace(/\u00a0/g, " ");

describe("Tabela Price", () => {
  it("parcela = P * i / (1 - (1 + i)^-n), arredondada ao centavo", () => {
    // R$ 1.000,00 em 12x a 2,99% a.m.: 1000 * 0,0299 / (1 - 1,0299^-12) = 100,40
    expect(priceInstallmentCents(100_000, 2.99, 12)).toBe(10_040);
    expect(priceInstallmentCents(30_000, 2.99, 4)).toBe(8_069);
  });

  it("bate com o plano que o servidor calcula", () => {
    const plan = computeInstallmentPlan(100_000, policy);
    for (const o of plan.filter((x) => x.hasInterest)) {
      expect(o.installmentCents).toBe(priceInstallmentCents(100_000, 2.99, o.installments));
      expect(o.totalCents).toBe(o.installmentCents * o.installments);
    }
  });
});

describe("CET", () => {
  it("ao ano é a taxa mensal composta por doze meses", () => {
    expect(cetAnualPct(2.99)).toBeCloseTo(42.41, 2);
    expect(cetAnualPct(0)).toBe(0);
  });

  it("formata com duas casas e vírgula", () => {
    expect(formatPct(2.99)).toBe("2,99%");
    expect(formatPct(cetAnualPct(2.99))).toBe("42,41%");
    expect(formatPct(3)).toBe("3,00%");
  });
});

describe("texto da opção", () => {
  const plan = computeInstallmentPlan(100_000, policy);
  const semJuros = plan.find((o) => o.installments === 3)!;
  const comJuros = plan.find((o) => o.installments === 12)!;

  it("sem juros continua 'sem juros'", () => {
    const label = describeInstallmentOption(semJuros, policy);
    expect(norm(label.titulo)).toBe("3x de R$ 333,33");
    expect(label.detalhe).toBe("sem juros");
  });

  it("com juros traz taxa, acréscimo em reais e CET ao mês e ao ano", () => {
    const label = describeInstallmentOption(comJuros, policy);
    expect(norm(label.titulo)).toBe("12x de R$ 100,40");
    expect(norm(label.detalhe)).toBe(
      "juros de 2,99% a.m. Acréscimo de R$ 204,80. CET 2,99% a.m. (42,41% a.a.)",
    );
  });

  it("usa a taxa da política, não um número fixo", () => {
    const outra = { ...policy, monthlyInterestPct: 1.5 };
    const opcao = computeInstallmentPlan(100_000, outra).find((o) => o.installments === 12)!;
    expect(describeInstallmentOption(opcao, outra).detalhe).toContain("juros de 1,50% a.m.");
    expect(describeInstallmentOption(opcao, outra).detalhe).toContain("(19,56% a.a.)");
  });
});

describe("resumo da opção escolhida", () => {
  const plan = computeInstallmentPlan(100_000, policy);

  it("sem juros", () => {
    const opcao = plan.find((o) => o.installments === 1)!;
    expect(norm(summarizeInstallmentOption(opcao, policy))).toBe(
      "1x de R$ 1.000,00. Total R$ 1.000,00, sem juros.",
    );
  });

  it("com juros: parcela, total, acréscimo, juros e CET", () => {
    const opcao = plan.find((o) => o.installments === 12)!;
    expect(norm(summarizeInstallmentOption(opcao, policy))).toBe(
      "12x de R$ 100,40. Total R$ 1.204,80, acréscimo de R$ 204,80. Juros 2,99% a.m., CET 2,99% a.m. (42,41% a.a.).",
    );
  });
});
