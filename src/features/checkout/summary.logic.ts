// Lógica pura do resumo da reserva.

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export type DateCell = { dia: string; hora: string };

/**
 * Data de uma célula do resumo, quebrada em dia e hora.
 *
 * O ano só entra quando a reserva não é do ano corrente. Numa reserva pra daqui a
 * duas semanas ele é ruído e rouba espaço da célula; numa reserva de dezembro
 * feita em janeiro seguinte, a falta dele é confusão na última tela antes de
 * pagar. `agora` é injetável pro teste não depender do relógio.
 */
export function dateCell(value: string | Date, agora: Date = new Date()): DateCell {
  const d = new Date(value);
  const mesmoAno = d.getFullYear() === agora.getFullYear();
  const padrao = mesmoAno ? "dd MMM" : "dd MMM yyyy";
  return {
    // O locale pt-BR abrevia o mês com ponto ("ago."), que aqui vira sujeira.
    dia: format(d, padrao, { locale: ptBR }).replace(/\./g, ""),
    hora: format(d, "HH:mm", { locale: ptBR }),
  };
}
