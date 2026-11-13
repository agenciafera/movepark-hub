// Antecipação do cartão do parceiro (E0.3.14). Spec: docs/specs/antecipacao-do-parceiro.md
//
// A taxa vem do banco (`app_setting.card_anticipation_rate_monthly_bps`): o repositório é público e
// não guarda condição comercial da Pagar.me.

export type AnticipationPayer = "movepark" | "partner";
export type PayerChoice = "inherit" | AnticipationPayer;

const pct = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";

/** Num 3x as parcelas são adiantadas 0, 30 e 60 dias: em média um mês de taxa. */
export function referenceCostLine(rateBps: number): string {
  if (!Number.isFinite(rateBps) || rateBps <= 0) return "Taxa de antecipação não cadastrada em Configurações.";
  return `Num 3x, receber tudo em 30 dias custa cerca de ${pct(rateBps / 100)} da parte do estacionamento.`;
}

export function payerLabel(v: AnticipationPayer | null): string {
  if (v === "partner") return "Estacionamento";
  if (v === "movepark") return "Movepark";
  return "Herda o padrão (Movepark)";
}

export function toPayer(choice: PayerChoice): AnticipationPayer | null {
  return choice === "inherit" ? null : choice;
}

/**
 * O que vai à Edge `update-recipient-payout`. Ligar copia a regra do recebedor da Movepark, lida na
 * Pagar.me em 13/11/2026 (gate G2): tipo 1025, 100% do volume, 29 dias, todos os dias do mês.
 */
export function anticipationGatewaySettings(enabled: boolean) {
  if (!enabled) return { enabled: false, type: "full", volume_percentage: 0, delay: null };
  return {
    enabled: true,
    type: "1025",
    volume_percentage: 100,
    delay: 29,
    days: Array.from({ length: 31 }, (_, i) => i + 1),
  };
}
