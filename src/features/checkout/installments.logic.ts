import { formatBRL } from "@/lib/format";
import type { InstallmentOption, InstallmentPolicy } from "@/lib/installments";

/**
 * O que o seletor de parcelas do checkout escreve em cada opção (CDC art. 52).
 *
 * A conta das parcelas mora em `@/lib/installments` (espelho do módulo Deno que a Edge
 * `create-card-charge` usa para revalidar). Aqui só se lê a opção pronta e se monta a
 * informação obrigatória do parcelamento com juros: a taxa mensal, o acréscimo em reais e
 * o custo efetivo total (CET) ao mês e ao ano. Como não há tarifa fora dos juros, o CET
 * mensal é a própria taxa e o anual é a taxa composta por doze meses.
 */

const pct = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "2,99%": duas casas sempre, para a taxa e o CET saírem com a mesma forma. */
export function formatPct(value: number): string {
  return `${pct.format(value)}%`;
}

/** CET ao ano equivalente à taxa mensal: (1 + i)^12 - 1, em porcentagem. */
export function cetAnualPct(monthlyInterestPct: number): number {
  const i = monthlyInterestPct / 100;
  return (Math.pow(1 + i, 12) - 1) * 100;
}

/**
 * Parcela pela Tabela Price, arredondada ao centavo: P * i / (1 - (1 + i)^-n).
 * É a mesma expressão e o mesmo arredondamento do servidor; o teste compara um caso com
 * `computeInstallmentPlan` para nenhum dos dois lados mudar sozinho.
 */
export function priceInstallmentCents(
  baseCents: number,
  monthlyInterestPct: number,
  n: number,
): number {
  const i = monthlyInterestPct / 100;
  return Math.round((baseCents * i) / (1 - Math.pow(1 + i, -n)));
}

export interface InstallmentLabel {
  /** "12x de R$ 100,40": o que aparece no gatilho do seletor. */
  titulo: string;
  /** A linha de baixo da opção: "sem juros" ou taxa, acréscimo e CET. */
  detalhe: string;
}

/** Texto de uma opção do seletor. Sem juros continua "sem juros"; com juros, tudo à vista. */
export function describeInstallmentOption(
  option: InstallmentOption,
  policy: Pick<InstallmentPolicy, "monthlyInterestPct">,
): InstallmentLabel {
  const titulo = `${option.installments}x de ${formatBRL(option.installmentCents / 100)}`;
  if (!option.hasInterest) return { titulo, detalhe: "sem juros" };

  const juros = formatPct(policy.monthlyInterestPct);
  const cetAno = formatPct(cetAnualPct(policy.monthlyInterestPct));
  return {
    titulo,
    detalhe:
      `juros de ${juros} a.m. Acréscimo de ${formatBRL(option.interestCents / 100)}. ` +
      `CET ${juros} a.m. (${cetAno} a.a.)`,
  };
}

/** Resumo fixo abaixo do seletor, com a opção escolhida por extenso. */
export function summarizeInstallmentOption(
  option: InstallmentOption,
  policy: Pick<InstallmentPolicy, "monthlyInterestPct">,
): string {
  const parcelas = `${option.installments}x de ${formatBRL(option.installmentCents / 100)}`;
  const total = `Total ${formatBRL(option.totalCents / 100)}`;
  if (!option.hasInterest) return `${parcelas}. ${total}, sem juros.`;

  const juros = formatPct(policy.monthlyInterestPct);
  const cetAno = formatPct(cetAnualPct(policy.monthlyInterestPct));
  return (
    `${parcelas}. ${total}, acréscimo de ${formatBRL(option.interestCents / 100)}. ` +
    `Juros ${juros} a.m., CET ${juros} a.m. (${cetAno} a.a.).`
  );
}
