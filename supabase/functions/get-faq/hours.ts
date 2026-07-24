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

/** "1 hora", "30 minutos", "1 hora e 30 minutos". Vazio quando não há tolerância. */
export function tolerancePhrase(minutes: number): string {
  if (!minutes || minutes <= 0) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const partes: string[] = [];
  if (h > 0) partes.push(h === 1 ? "1 hora" : `${h} horas`);
  if (m > 0) partes.push(m === 1 ? "1 minuto" : `${m} minutos`);
  return partes.join(" e ");
}

/**
 * Duas respostas de FAQ a partir do horário: "qual o horário" e "posso retirar fora
 * do horário". Para unidade 24h, a retirada é a qualquer hora. Para comercial, lista
 * os dias e diz que a retirada acontece dentro do horário. A tolerância de saída
 * (86ajp6vrq), quando existe, entra na resposta de retirada nos dois casos.
 */
export function describeBusinessHours(
  is24h: boolean,
  businessHours: unknown,
  toleranceMinutes = 0,
): { hours: string; afterHours: string } {
  const tolerancia = tolerancePhrase(toleranceMinutes);
  const extraTolerancia = tolerancia
    ? ` Você tem ${tolerancia} de tolerância depois do horário contratado antes de contar uma diária nova.`
    : "";

  if (is24h) {
    return {
      hours: "Funciona 24 horas por dia, todos os dias.",
      afterHours:
        "Sim. A unidade funciona 24 horas, então você retira o carro a qualquer hora." +
        extraTolerancia,
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
      "A retirada acontece dentro do horário de funcionamento. Fora dele, combine antes com a unidade pelo contato informado." +
      extraTolerancia,
  };
}
