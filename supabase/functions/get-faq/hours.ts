// Horário de funcionamento -> texto de FAQ (86ajp6vnf). Puro e testável (deno test),
// separado do index.ts que abre Deno.serve. Espelha o modelo de src/features/locations/
// businessHours.ts (o Edge Deno não importa do bundle do front).

export type DayHours = { open: string; close: string } | null;
export type BusinessHours = Record<string, DayHours>;

const WEEKDAYS: { key: string; label: string }[] = [
  { key: "mon", label: "Segunda" },
  { key: "tue", label: "Terça" },
  { key: "wed", label: "Quarta" },
  { key: "thu", label: "Quinta" },
  { key: "fri", label: "Sexta" },
  { key: "sat", label: "Sábado" },
  { key: "sun", label: "Domingo" },
];

/**
 * Duas respostas de FAQ a partir do horário: "qual o horário" e "posso retirar fora
 * do horário". Para unidade 24h, a retirada é a qualquer hora. Para comercial, lista
 * os dias e diz que a retirada acontece dentro do horário.
 */
export function describeBusinessHours(
  is24h: boolean,
  businessHours: unknown,
): { hours: string; afterHours: string } {
  if (is24h) {
    return {
      hours: "Funciona 24 horas por dia, todos os dias.",
      afterHours:
        "Sim. A unidade funciona 24 horas, então você retira o carro a qualquer hora.",
    };
  }

  const bh = (businessHours && typeof businessHours === "object" ? businessHours : {}) as BusinessHours;
  const lines = WEEKDAYS.map((d) => {
    const day = bh[d.key];
    if (day && typeof day.open === "string" && typeof day.close === "string") {
      return `${d.label}: ${day.open} às ${day.close}`;
    }
    return `${d.label}: fechado`;
  });

  return {
    hours: lines.join("\n"),
    afterHours:
      "A retirada acontece dentro do horário de funcionamento. Fora dele, combine antes com a unidade pelo contato informado.",
  };
}
