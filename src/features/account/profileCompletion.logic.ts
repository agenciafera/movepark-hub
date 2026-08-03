/**
 * Lógica pura do "cadastro completo" da conta do cliente (design "Minha Conta
 * Cliente"). Cada etapa é derivada do que já existe, nunca de um contador solto:
 * um medidor que não bate com a realidade da conta é pior que nenhum medidor.
 */

export type CompletionInput = {
  /** Vem do JWT (ADR-006): identidade verificada mora no `auth.users`. */
  emailVerified: boolean;
  phoneVerified: boolean;
  hasTaxId: boolean;
  hasPaymentMethod: boolean;
  hasVehicle: boolean;
};

export type CompletionStep = {
  key: string;
  label: string;
  /**
   * A etapa na forma pendente ("cadastrar um veículo"), pra entrar numa frase.
   * Interpolar o rótulo dava "Falta veículo cadastrado", que sai torto.
   */
  pending: string;
  /** Rótulo curto da ação, pra virar link no fim da linha da etapa pendente. */
  action: string;
  done: boolean;
  /** Para onde mandar quem ainda não fez. Null quando a etapa já está pronta. */
  to: string | null;
};

/**
 * Comprimento do arco de 180° desenhado no card: `A 40 40` é meia volta de raio
 * 40, ou seja `π × 40`. Tem que bater com o path do SVG: um valor maior que o
 * real estoura o traço e o medidor pinta cheio antes da hora (com 282.74, que é
 * a circunferência de um círculo inteiro de raio 45, 60% já aparecia como 100%).
 */
const ARC_LENGTH = 125.66;

export type Completion = {
  steps: CompletionStep[];
  done: number;
  total: number;
  pct: number;
  /** `stroke-dasharray` do arco de 180°, já pronto pro SVG. */
  dash: string;
  /** Primeira etapa pendente, que é o que vale sugerir. Null se está tudo feito. */
  next: CompletionStep | null;
};

export function profileCompletion(input: CompletionInput): Completion {
  const steps: CompletionStep[] = [
    {
      key: "email",
      action: "Verificar",
      label: "E-mail verificado",
      pending: "verificar o e-mail",
      done: input.emailVerified,
      to: "/account/security",
    },
    {
      key: "phone",
      action: "Verificar",
      label: "Telefone verificado",
      pending: "verificar o telefone",
      done: input.phoneVerified,
      to: "/account/security",
    },
    {
      key: "taxId",
      action: "Informar",
      label: "CPF informado",
      pending: "informar o CPF",
      done: input.hasTaxId,
      to: "/account/profile",
    },
    {
      key: "card",
      action: "Salvar",
      label: "Cartão salvo",
      pending: "salvar um cartão",
      done: input.hasPaymentMethod,
      to: "/account/cards",
    },
    {
      key: "vehicle",
      action: "Definir",
      label: "Veículo padrão",
      pending: "cadastrar um veículo",
      done: input.hasVehicle,
      to: "/account/vehicles",
    },
  ].map((s) => ({ ...s, to: s.done ? null : s.to }));

  const total = steps.length;
  const done = steps.filter((s) => s.done).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return {
    steps,
    done,
    total,
    pct,
    dash: `${((done / total) * ARC_LENGTH).toFixed(1)} ${ARC_LENGTH}`,
    next: steps.find((s) => !s.done) ?? null,
  };
}

export type NextTrip = {
  /** Dias até o check-in, arredondado pra baixo. Zero quer dizer hoje. */
  days: number;
  today: boolean;
};

/** Quantos dias faltam pro check-in. Null quando a data não faz sentido. */
export function daysUntil(checkInIso: string, now = new Date()): NextTrip | null {
  const target = Date.parse(checkInIso);
  if (Number.isNaN(target)) return null;
  const DAY = 86_400_000;
  const startOfDay = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const days = Math.round((startOfDay(target) - startOfDay(now.getTime())) / DAY);
  if (days < 0) return null;
  return { days, today: days === 0 };
}

/**
 * A linha de apoio da saudação: junta a próxima viagem com o que falta no
 * cadastro. Volta null quando não há nada verdadeiro a dizer.
 */
export function accountSubline(
  trip: NextTrip | null,
  completion: Completion,
): string | null {
  const falta = completion.next
    ? `Falta ${completion.next.pending}.`
    : "Seu cadastro está completo.";

  if (!trip) {
    return completion.next ? falta : null;
  }
  const quando = trip.today
    ? "Sua próxima viagem é hoje."
    : trip.days === 1
      ? "Sua próxima viagem sai em 1 dia."
      : `Sua próxima viagem sai em ${trip.days} dias.`;
  return `${quando} ${falta}`;
}
