import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export type MonthOption = { value: string; label: string; from: string; to: string };

/** Meia-noite em Brasília, em horas de UTC. O Brasil não tem horário de verão desde 2019. */
const BRT_OFFSET_HOURS = 3;

/**
 * Os últimos `n` meses de referência do extrato de repasses, do atual para trás.
 *
 * O mês é o de Brasília, não o de UTC: a venda das 22h de 31/08 é de agosto para quem fecha o
 * caixa aqui. E o rótulo sai do próprio ano-mês, nunca de um `Date` formatado no fuso local:
 * antes, `format(Date.UTC(ano, mes, 1))` num navegador em Brasília caía em 21h do dia
 * anterior e a tela dizia "agosto 2026" mostrando os números de setembro (16/09/2026).
 */
export function recentMonths(n: number, now: Date = new Date()): MonthOption[] {
  // Ano e mês vigentes em Brasília, sem depender do fuso do navegador.
  const brt = new Date(now.getTime() - BRT_OFFSET_HOURS * 3_600_000);
  const year = brt.getUTCFullYear();
  const month = brt.getUTCMonth();
  const out: MonthOption[] = [];
  for (let i = 0; i < n; i++) {
    const start = new Date(Date.UTC(year, month - i, 1, BRT_OFFSET_HOURS));
    const end = new Date(Date.UTC(year, month - i + 1, 1, BRT_OFFSET_HOURS));
    const y = new Date(Date.UTC(year, month - i, 1)).getUTCFullYear();
    const m = new Date(Date.UTC(year, month - i, 1)).getUTCMonth();
    out.push({
      value: `${y}-${String(m + 1).padStart(2, "0")}`,
      // Data local com o mesmo ano e mês: o rótulo bate com o valor em qualquer fuso.
      label: format(new Date(y, m, 1), "MMMM yyyy", { locale: ptBR }),
      from: start.toISOString(),
      to: end.toISOString(),
    });
  }
  return out;
}
