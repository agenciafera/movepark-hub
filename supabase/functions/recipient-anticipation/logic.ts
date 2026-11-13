// Validação pura da Edge recipient-anticipation (E0.3.14). Spec: docs/specs/antecipacao-do-parceiro.md

export type AnticipationAction = "settings" | "limits" | "simulate" | "create" | "sync";

export type AnticipationInput = {
  action: AnticipationAction;
  companyId: string | null;
  /** "master" lê o recebedor da Movepark (gate G2). */
  recipient: "master" | null;
  requestedCents: number | null;
  timeframe: "start" | "end";
};

const ACTIONS: AnticipationAction[] = ["settings", "limits", "simulate", "create", "sync"];

export function parseAnticipationInput(body: unknown): { input: AnticipationInput | null; error?: string } {
  if (!body || typeof body !== "object") return { input: null, error: "Corpo inválido." };
  const b = body as Record<string, unknown>;
  const action = b.action as AnticipationAction;
  if (!ACTIONS.includes(action)) return { input: null, error: "Ação inválida." };

  const companyId = typeof b.company_id === "string" && b.company_id ? b.company_id : null;
  const recipient = b.recipient === "master" ? "master" : null;
  const timeframe = b.timeframe === undefined || b.timeframe === "start" ? "start" : b.timeframe === "end" ? "end" : null;
  if (!timeframe) return { input: null, error: "timeframe é start ou end." };
  const cents = typeof b.requested_cents === "number" && Number.isInteger(b.requested_cents) ? b.requested_cents : null;

  if ((action === "limits" || action === "simulate" || action === "create") && !companyId) {
    return { input: null, error: "company_id é obrigatório." };
  }
  if (action === "settings" && !companyId && !recipient) {
    return { input: null, error: "Informe company_id ou recipient." };
  }
  if ((action === "simulate" || action === "create") && (!cents || cents <= 0)) {
    return { input: null, error: "requested_cents deve ser inteiro positivo." };
  }
  return { input: { action, companyId, recipient, requestedCents: cents, timeframe } };
}

/** Quem paga a antecipação pontual: o padrão da empresa, senão o do Hub, senão a Movepark. */
export function feeBorneBy(companyPayer: string | null, defaultPayer: string | null): "movepark" | "partner" {
  const v = companyPayer ?? defaultPayer;
  return v === "partner" ? "partner" : "movepark";
}
