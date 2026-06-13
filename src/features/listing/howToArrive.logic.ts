/**
 * Traslado (PRD-11) — compõe a linha honesta "a cada 15 min · ~6 min ao terminal" a partir
 * dos minutos estruturados. Cada parte é opcional: o parceiro pode informar só a frequência,
 * só o tempo, ou nada (retorna null e o bloco "Como chegar" omite a linha de traslado).
 */
export type ShuttleInfo = {
  frequencyMinutes: number | null;
  toTerminalMinutes: number | null;
};

export function formatShuttle(info: ShuttleInfo): string | null {
  const parts: string[] = [];
  if (info.frequencyMinutes != null && info.frequencyMinutes > 0) {
    parts.push(`a cada ${info.frequencyMinutes} min`);
  }
  if (info.toTerminalMinutes != null && info.toTerminalMinutes > 0) {
    parts.push(`~${info.toTerminalMinutes} min ao terminal`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}
