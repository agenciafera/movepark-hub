/**
 * Lógica pura do detalhe da reserva (design "Detalhe da Reserva"). O desenho abre
 * com uma manchete e três passos de entrada; os dois dependem do estado da reserva,
 * então moram aqui, testáveis, em vez de virar `if` espalhado no JSX.
 */

import type { BookingStatus } from "@/types/domain";
import { formatDate, formatDayTimeInline, formatTime } from "@/lib/format";

export type DetailHeadline = { title: string; subtitle: string };

/**
 * A manchete do topo. O design mostra só o caso confirmado ("Sua vaga está
 * garantida"), mas a mesma tela serve reserva pendente, cancelada e concluída, e
 * dizer "garantida" numa reserva cancelada seria mentir para quem abriu.
 */
export function detailHeadline(status: BookingStatus): DetailHeadline {
  switch (status) {
    case "confirmed":
      return {
        title: "Sua vaga está garantida",
        subtitle: "Apresente o QR code na portaria. A entrada leva menos de um minuto.",
      };
    case "checked_in":
      return {
        title: "Seu carro está na vaga",
        subtitle: "Retire até o horário do check-out pra não pagar diária extra.",
      };
    case "completed":
      return {
        title: "Estadia concluída",
        subtitle: "Seu comprovante fica salvo aqui, caso precise prestar contas.",
      };
    case "pending":
      return {
        title: "Falta pagar pra garantir a vaga",
        subtitle: "A reserva fica de pé assim que o pagamento entrar.",
      };
    case "cancelled":
      return {
        title: "Reserva cancelada",
        subtitle: "A vaga foi liberada. O histórico fica aqui pra consulta.",
      };
    case "expired":
      return {
        title: "Reserva expirada",
        subtitle: "O pagamento não entrou no prazo e a vaga voltou pra busca.",
      };
    case "no_show":
      return {
        title: "Entrada não registrada",
        subtitle: "A portaria não registrou a chegada do veículo nesta reserva.",
      };
  }
}

/** Rótulo do selo de status, com a distância até o check-in quando ela existe. */
export function statusPillDetail(
  status: BookingStatus,
  checkInAt: string,
  now: Date = new Date(),
): string | null {
  if (status !== "confirmed" && status !== "pending") return null;
  const target = new Date(checkInAt);
  if (Number.isNaN(target.getTime())) return null;
  const startOfDay = (d: Date) => new Date(d).setHours(0, 0, 0, 0);
  const dias = Math.round((startOfDay(target) - startOfDay(now)) / 86_400_000);
  if (dias < 0) return null;
  if (dias === 0) return "check-in hoje";
  if (dias === 1) return "check-in amanhã";
  return `check-in em ${dias} dias`;
}

export type EntryStepState = "done" | "current" | "next";
export type EntryStep = {
  n: number;
  title: string;
  text: string;
  state: EntryStepState;
};

type StepInput = {
  status: BookingStatus;
  checkOutAt: string;
  /** Minutos de tolerância da unidade. Null quando a unidade não configurou. */
  toleranceMinutes?: number | null;
};

/** Traduz minutos em algo que se lê ("40 minutos", "2 horas", "1 hora e 30"). */
function toleranceLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} minutos`;
  const horas = Math.floor(minutes / 60);
  const resto = minutes % 60;
  const h = horas === 1 ? "1 hora" : `${horas} horas`;
  return resto === 0 ? h : `${h} e ${resto}`;
}

/**
 * Os três passos da entrada. O estado vem do status da reserva: pintar o passo 2
 * como concluído numa reserva que ainda nem fez check-in ensinaria errado.
 */
export function entrySteps({ status, checkOutAt, toleranceMinutes }: StepInput): EntryStep[] {
  const entrou = status === "checked_in" || status === "completed";
  const saiu = status === "completed";

  const tolerancia =
    toleranceMinutes && toleranceMinutes > 0
      ? `Sua vaga fica reservada por ${toleranceLabel(toleranceMinutes)} após o horário. Se for atrasar mais que isso, avise o estacionamento.`
      : "Se for atrasar, avise o estacionamento pelo contato da unidade.";

  return [
    {
      n: 1,
      title: "Chegue no horário do check-in",
      text: tolerancia,
      state: entrou ? "done" : "current",
    },
    {
      n: 2,
      title: "Mostre o QR code na portaria",
      text: "O operador lê o código e confirma a entrada. Não precisa imprimir nada.",
      state: entrou ? "done" : "next",
    },
    {
      n: 3,
      title: "Retire o veículo até o check-out",
      text: `Depois de ${formatDayTimeInline(checkOutAt)}, as diárias extras são cobradas no balcão.`,
      state: saiu ? "done" : entrou ? "current" : "next",
    },
  ];
}

/** Frase do prazo de cancelamento grátis. Null quando não há prazo ou ele já passou. */
export function freeCancelNote(
  fareCancelUntil: string | null,
  now: Date = new Date(),
): string | null {
  if (!fareCancelUntil) return null;
  const prazo = new Date(fareCancelUntil);
  if (Number.isNaN(prazo.getTime()) || prazo.getTime() <= now.getTime()) return null;
  return `Cancelamento grátis até ${formatDate(fareCancelUntil)}, ${formatTime(fareCancelUntil)}.`;
}
