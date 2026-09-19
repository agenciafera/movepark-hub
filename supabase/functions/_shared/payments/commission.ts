// Comissão por origem da venda (E0.3.12). Spec: docs/specs/comissao-por-origem.md
//
// O pacote (comissão, quem paga a taxa do gateway, quem arca com chargeback) é decidido no BANCO
// (`resolve_commission`) e congelado na reserva na criação (`booking_apply_commission`). Aqui só
// se LÊ o que está gravado, para a cobrança montar o split. Nenhuma regra de casamento mora em TS:
// duas implementações da mesma regra divergem, e a que erra manda split errado ao gateway.

export type FeePayer = "movepark" | "partner";
export type ChargebackBearer = "each" | "partner" | "movepark";

export type CommissionPackage = {
  /** `hub` ou o nome da regra que casou. */
  channel: string;
  ruleId: string | null;
  takeRateBps: number;
  feePayer: FeePayer;
  chargebackBearer: ChargebackBearer;
};

/** As colunas `commission_*` da reserva, como vêm do select. */
export type BookingCommissionColumns = {
  commission_rule_id?: string | null;
  commission_channel?: string | null;
  commission_take_rate_bps?: number | null;
  commission_fee_payer?: string | null;
  commission_chargeback_bearer?: string | null;
};

function feePayer(v: unknown): FeePayer {
  return v === "partner" ? "partner" : "movepark";
}

function bearer(v: unknown): ChargebackBearer {
  return v === "partner" || v === "movepark" ? v : "each";
}

/** Reserva sem pacote gravado: criada antes do E0.3.12, ou o congelamento falhou na criação. */
export function needsCommissionFreeze(b: BookingCommissionColumns): boolean {
  return !b.commission_channel || b.commission_take_rate_bps == null;
}

/**
 * O pacote que vale para ESTA cobrança. Reserva com pacote gravado usa o gravado, mesmo que a
 * regra ou o take_rate da empresa tenham mudado depois (é o que "congelado" quer dizer). Sem
 * pacote, cai no padrão do Hub: take_rate da empresa, Movepark paga a taxa, cada um com o seu
 * chargeback. É o comportamento de antes do E0.3.12.
 */
export function commissionForCharge(
  b: BookingCommissionColumns,
  companyTakeRateBps: number | null | undefined,
): CommissionPackage {
  if (needsCommissionFreeze(b)) {
    return {
      channel: "hub",
      ruleId: null,
      takeRateBps: Math.max(0, Math.round(Number(companyTakeRateBps ?? 0)) || 0),
      feePayer: "movepark",
      chargebackBearer: "each",
    };
  }
  return {
    channel: b.commission_channel as string,
    ruleId: b.commission_rule_id ?? null,
    takeRateBps: Math.max(0, Math.round(Number(b.commission_take_rate_bps)) || 0),
    feePayer: feePayer(b.commission_fee_payer),
    chargebackBearer: bearer(b.commission_chargeback_bearer),
  };
}

/** Converte o jsonb devolvido por `booking_apply_commission` nas colunas da reserva. */
export function columnsFromRpc(json: unknown): BookingCommissionColumns {
  const j = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  return {
    commission_rule_id: typeof j.rule_id === "string" ? j.rule_id : null,
    commission_channel: typeof j.channel === "string" ? j.channel : null,
    commission_take_rate_bps: typeof j.take_rate_bps === "number" ? j.take_rate_bps : null,
    commission_fee_payer: typeof j.fee_payer === "string" ? j.fee_payer : null,
    commission_chargeback_bearer: typeof j.chargeback_bearer === "string" ? j.chargeback_bearer : null,
  };
}

/**
 * Chargeback pela regra: quanto o parceiro fica devendo, em centavos, ou `null` para deixar o
 * razão calcular como sempre (a perna dele, líquida da taxa que pagou).
 *
 *  - each:     null. Cada um perde o que recebeu: o parceiro devolve a perna dele.
 *  - movepark: 0. A Movepark absorve tudo, o parceiro não deve nada.
 *  - partner:  o valor cobrado inteiro. O parceiro devolve também a parte da Movepark.
 *
 * Só vale quando o master absorveu o débito (split novo, `liable` na Movepark). No split antigo o
 * gateway já debitou o parceiro direto, e em custódia ele nunca recebeu: não há dívida a criar.
 */
export function chargebackDebtCents(
  chargebackBearer: string | null | undefined,
  chargedCents: number,
  absorbedByMaster: boolean,
): number | null {
  if (!absorbedByMaster) return null;
  const b = bearer(chargebackBearer);
  if (b === "movepark") return 0;
  if (b === "partner") return Math.max(0, Math.round(chargedCents));
  return null;
}
