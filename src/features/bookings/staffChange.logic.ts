/**
 * Alterar datas e fazer upgrade pela equipe da empresa (26/11/2026). A conta é do servidor (Edge
 * `change-booking-dates-paid` e `create-fare-upgrade`); aqui só o que a tela diz e quando ela sabe
 * que o PIX entrou. Spec: docs/superpowers/specs/2026-11-26-acoes-do-cliente-no-operador-design.md §3.
 */
import { formatBRL } from "@/lib/format";
import { FARE_TIER_ORDER, type FareTier } from "@/lib/fares";
import type { ChangePaidDatesQuote } from "./customerApi";

export type StaffQuoteSummary =
  | { kind: "unavailable"; reason: string }
  /** Mesmo valor: a troca vale na hora. */
  | { kind: "same"; days: number }
  /** Mais barato: vale na hora e a diferença volta ao cliente. */
  | { kind: "refund"; days: number; refund: number }
  /** Mais caro: um PIX com a diferença (e o upgrade, quando a Básica exige). */
  | { kind: "charge"; days: number; charge: number; delta: number; upgrade: number | null }
  /** Básica sem diferença a cobrar: o upgrade primeiro, a troca depois. */
  | { kind: "upgrade_first"; days: number; upgrade: number; delta: number };

/** Lê a prévia do servidor no que a equipe precisa decidir. */
export function staffQuoteSummary(q: ChangePaidDatesQuote): StaffQuoteSummary {
  if (!q.available || q.delta == null) {
    return { kind: "unavailable", reason: q.reason ?? "A unidade não vende esse período." };
  }
  const upgrade = q.fare_upgrade?.amount ?? null;
  if (q.fare_upgrade_first && upgrade != null) {
    return { kind: "upgrade_first", days: q.days, upgrade, delta: q.delta };
  }
  if (q.delta > 0) {
    return { kind: "charge", days: q.days, charge: q.charge_amount ?? q.delta, delta: q.delta, upgrade };
  }
  if (q.delta < 0) return { kind: "refund", days: q.days, refund: -q.delta };
  return { kind: "same", days: q.days };
}

const diarias = (n: number) => `${n} ${n === 1 ? "diária" : "diárias"}`;

/** Título e detalhe da prévia, na fala de quem atende o cliente. */
export function staffQuoteText(s: StaffQuoteSummary): { titulo: string; detalhe: string } {
  switch (s.kind) {
    case "unavailable":
      return { titulo: "Não dá para trocar para essas datas", detalhe: s.reason };
    case "same":
      return { titulo: "Sem diferença de valor", detalhe: `${diarias(s.days)} no novo período. A troca vale na hora.` };
    case "refund":
      return {
        titulo: `O cliente recebe ${formatBRL(s.refund)} de volta`,
        detalhe: `${diarias(s.days)} no novo período. A troca vale na hora e a devolução vai pelo mesmo meio de pagamento da reserva.`,
      };
    case "charge":
      return {
        titulo: `O cliente paga ${formatBRL(s.charge)} no PIX`,
        detalhe:
          s.upgrade != null
            ? `${formatBRL(s.delta)} das ${diarias(s.days)} novas e ${formatBRL(s.upgrade)} do upgrade para o Flex, que o plano Básica exige para alterar datas. As datas mudam quando o PIX for pago.`
            : `${diarias(s.days)} no novo período. As datas mudam quando o PIX for pago.`,
      };
    case "upgrade_first":
      return {
        titulo: `Primeiro, o upgrade para o Flex: ${formatBRL(s.upgrade)} no PIX`,
        detalhe:
          s.delta < 0
            ? `O plano Básica não inclui alterar datas. Pago o upgrade, a troca vale e o cliente recebe ${formatBRL(-s.delta)} de volta.`
            : "O plano Básica não inclui alterar datas. Pago o upgrade, a troca vale sem outra cobrança.",
      };
  }
}

/** As datas da reserva já são as pedidas: o PIX da diferença entrou. */
export function datesLanded(
  booking: { check_in_at: string; check_out_at: string },
  alvo: { checkInAt: string; checkOutAt: string },
): boolean {
  const igual = (a: string, b: string) => new Date(a).getTime() === new Date(b).getTime();
  return igual(booking.check_in_at, alvo.checkInAt) && igual(booking.check_out_at, alvo.checkOutAt);
}

/** O plano da reserva já é o alvo (ou maior): o PIX do upgrade entrou. */
export function tierLanded(current: string | null | undefined, alvo: FareTier): boolean {
  return FARE_TIER_ORDER.indexOf((current ?? "basica") as FareTier) >= FARE_TIER_ORDER.indexOf(alvo);
}

/** Planos acima do atual, para o upgrade. */
export function upgradeTargets(current: string | null | undefined): FareTier[] {
  const i = FARE_TIER_ORDER.indexOf((current ?? "basica") as FareTier);
  return FARE_TIER_ORDER.filter((_, j) => j > i);
}

/** Texto pronto para o operador mandar no WhatsApp junto com o código do PIX. */
export function pixMessage(o: { code: string; amount: number; what: "datas" | "upgrade" | "dias" }): string {
  const motivo =
    o.what === "datas" ? "a alteração de datas" : o.what === "dias" ? "os dias a mais" : "o upgrade de plano";
  // Espaço comum no lugar do espaço fino do formatador: o texto vai colado no WhatsApp.
  const valor = formatBRL(o.amount).replace(/\u00a0/g, " ");
  return `Olá! Segue o PIX de ${valor} para ${motivo} da reserva ${o.code} na Movepark. É só copiar o código abaixo no app do seu banco.`;
}
