/**
 * Lógica pura da tela de e-mails do Manager (eventos do SES, 19/11/2026).
 * Ver docs/specs/email-eventos-ses.md.
 */

type Tone = "confirmed" | "pending" | "cancelled" | "neutral";

/** O que conta como "não chegou": é o mesmo recorte do alerta do resumo da equipe. */
export const TIPOS_PROBLEMA = ["bounce", "complaint", "reject"] as const;

const ROTULO: Record<string, { label: string; tone: Tone }> = {
  delivery: { label: "Entregue", tone: "confirmed" },
  bounce: { label: "Devolvido", tone: "cancelled" },
  complaint: { label: "Marcado como spam", tone: "cancelled" },
  reject: { label: "Recusado pelo SES", tone: "cancelled" },
  delivery_delay: { label: "Atrasado", tone: "pending" },
  rendering_failure: { label: "Falha no modelo", tone: "cancelled" },
};

/** Rótulo e cor do evento. Devolução temporária (caixa cheia, por exemplo) é amarela, não vermelha. */
export function eventoRotulo(e: { event_type: string; bounce_type: string | null }): { label: string; tone: Tone } {
  if (e.event_type === "bounce" && e.bounce_type === "Transient") return { label: "Devolvido (temporário)", tone: "pending" };
  return ROTULO[e.event_type] ?? { label: e.event_type, tone: "neutral" };
}

export function ehProblema(tipo: string): boolean {
  return (TIPOS_PROBLEMA as readonly string[]).includes(tipo);
}

export interface DestinatarioResumo {
  recipient: string;
  problemas: number;
  ultimoProblemaEm: string;
  ultimoProblema: string;
  /** Houve entrega depois do último problema: o endereço voltou a receber. */
  voltouAReceber: boolean;
}

/**
 * Quem teve problema, agrupado por destinatário, do problema mais recente para o mais antigo.
 * Recebe a lista já ordenada do mais novo para o mais antigo (como vem da API).
 */
export function resumoPorDestinatario(
  eventos: { recipient: string; event_type: string; bounce_type: string | null; occurred_at: string }[],
): DestinatarioResumo[] {
  const porDestino = new Map<string, DestinatarioResumo>();
  const ultimaEntrega = new Map<string, string>();
  for (const e of eventos) {
    if (e.event_type === "delivery") {
      const atual = ultimaEntrega.get(e.recipient);
      if (!atual || e.occurred_at > atual) ultimaEntrega.set(e.recipient, e.occurred_at);
      continue;
    }
    if (!ehProblema(e.event_type)) continue;
    const r = porDestino.get(e.recipient);
    if (!r) {
      porDestino.set(e.recipient, {
        recipient: e.recipient,
        problemas: 1,
        ultimoProblemaEm: e.occurred_at,
        ultimoProblema: eventoRotulo(e).label,
        voltouAReceber: false,
      });
    } else {
      r.problemas++;
      if (e.occurred_at > r.ultimoProblemaEm) {
        r.ultimoProblemaEm = e.occurred_at;
        r.ultimoProblema = eventoRotulo(e).label;
      }
    }
  }
  const lista = [...porDestino.values()];
  for (const r of lista) {
    const entrega = ultimaEntrega.get(r.recipient);
    r.voltouAReceber = !!entrega && entrega > r.ultimoProblemaEm;
  }
  return lista.sort((a, b) => (a.ultimoProblemaEm < b.ultimoProblemaEm ? 1 : -1));
}
