// Montador de split: lógica de negócio agnóstica ao gateway. A comissão da Movepark
// (take_rate) é calculada sobre o PREÇO BASE da reserva; o parceiro recebe o restante do base.
// Quando o valor cobrado é maior que o base (juros de parcelamento repassado ao cliente, E0.1.3),
// o EXCEDENTE vai para a Movepark. Decisão (E0.1.2): o PARCEIRO absorve as taxas do gateway.
//
// PIX (E0.1.2) passa chargedCents == baseCents → resultado idêntico ao comportamento original.

import type { SplitRule } from "./types.ts";

/**
 * O split é enviado ao gateway? Lê `app_setting.pagarme_split_enabled`.
 *
 * Desligado, o valor cai inteiro na conta da Movepark (custódia) e o repasse ao parceiro passa a
 * ser operação nossa. O snapshot em `payment.split` continua sendo gravado nos dois casos: ele é o
 * razão de quanto devemos ao parceiro, e é dele que `payout_statement`/`payout_balance` derivam.
 *
 * Default LIGADO: chave ausente ou vazia não pode desligar split por acidente.
 */
export function isGatewaySplitEnabled(settingValue: string | null | undefined): boolean {
  if (settingValue == null || settingValue.trim() === "") return true;
  return settingValue.trim().toLowerCase() !== "false";
}

/**
 * A cobrança desta empresa vai com split? Global ligada OU empresa marcada
 * (`company.gateway_split_enabled`). Global desligada com empresas marcadas é o estado de transição
 * do E0.3.5: quem tem recebedor válido entra no modelo novo, quem não tem segue em custódia.
 */
export function effectiveSplitEnabled(
  globalSetting: string | null | undefined,
  companyFlag: boolean | null | undefined,
): boolean {
  return isGatewaySplitEnabled(globalSetting) || companyFlag === true;
}

export interface BuildSplitArgs {
  /** Total efetivamente cobrado (com juros de parcelamento, se houver). */
  chargedCents: number;
  /** Preço base da reserva, base do repasse ao parceiro e da comissão. */
  baseCents: number;
  takeRateBps: number; // basis points (1500 = 15%)
  moveparkRecipientId: string | null;
  partnerRecipientId: string | null;
  /**
   * Os ids são obrigatórios? `true` quando o split VAI ao gateway (ele precisa saber para quem
   * mandar). `false` no modo de custódia: ali a cobrança cai inteira na conta da Movepark, o split
   * fica só como razão do que devemos, e exigir recebedor recusaria com 409 uma venda que o gateway
   * aceita. Publicar no catálogo e estar apto a receber são concerns separados por desenho (E1.9
   * deixa o parceiro publicar antes do KYC), e o código não pode reamarrar os dois.
   *
   * Default `true`: quem não disser nada continua no comportamento estrito.
   */
  requireRecipients?: boolean;
  /**
   * Parte do desconto que a MOVEPARK banca (cupom `funded_by = 'platform'`, E3.3).
   *
   * O parceiro recebe como se esse desconto não existisse: quem absorve é a comissão da Movepark.
   * Cupom do parceiro fica em 0 e nada muda, que é o comportamento de sempre.
   */
  platformFundedCents?: number;
  /**
   * Meio de pagamento, para estimar a taxa do gateway. A Movepark paga a taxa (decisão de
   * 18/09/2026); se a perna dela não cobre a estimativa (take_rate baixo, cupom de plataforma),
   * a taxa volta para a perna do parceiro, porque o gateway cobra de quem está marcado e uma
   * perna menor que a taxa deixaria o recebedor negativo.
   */
  method?: "pix" | "card";
}

/**
 * Estimativa folgada da taxa do gateway, só para decidir se a perna da Movepark aguenta pagá-la:
 * PIX cobra ~1%, cartão ~3,8% à vista e mais no parcelado.
 */
export function estimatedGatewayFeeCents(method: "pix" | "card" | undefined, chargedCents: number): number {
  const pct = method === "card" ? 0.06 : 0.015;
  return Math.ceil(Math.max(0, chargedCents) * pct);
}

/**
 * Divide o valor cobrado entre parceiro (o preço base menos a comissão, perna cheia) e Movepark
 * (comissão + excedente de juros, e é ela que paga a taxa do gateway). Soma SEMPRE ==
 * chargedCents (exigência do gateway).
 */
export function buildSplit({
  chargedCents,
  baseCents,
  takeRateBps,
  moveparkRecipientId,
  partnerRecipientId,
  requireRecipients = true,
  platformFundedCents = 0,
  method,
}: BuildSplitArgs): SplitRule[] {
  if (!Number.isInteger(baseCents) || baseCents <= 0) {
    throw new Error("Valor da cobrança inválido.");
  }
  if (!Number.isInteger(chargedCents) || chargedCents < baseCents) {
    throw new Error("Valor cobrado inválido (menor que o preço base).");
  }
  if (requireRecipients && !partnerRecipientId) {
    throw new Error("Recebedor do parceiro ausente.");
  }

  // O parceiro é pago sobre o preço SEM o desconto que a Movepark banca. Somar de volta aqui é o
  // que faz a campanha de plataforma sair da nossa comissão, e não do repasse dele.
  const partnerBase = baseCents + platformFundedCents;
  const commission = Math.min(
    partnerBase,
    Math.max(0, Math.round((partnerBase * takeRateBps) / 10000)),
  );
  const partnerAmount = partnerBase - commission;
  if (partnerAmount <= 0) {
    throw new Error("Comissão (take_rate) não pode consumir todo o valor da reserva.");
  }
  // Movepark fica com a comissão + o excedente cobrado (juros do parcelamento), menos o desconto
  // que ela mesma bancou.
  const moveparkAmount = chargedCents - partnerAmount;
  if (moveparkAmount < 0) {
    // O cupom de plataforma passou da comissão: pagar o parceiro exigiria a Movepark pôr dinheiro
    // do bolso, e o gateway não aceita perna negativa. É o buraco que o teto
    // (`coupon.max_discount_amount`) existe para fechar; se estourou, o teto está mal calibrado.
    throw new Error(
      "Cupom da Movepark maior que a comissão da reserva: ajuste o teto do cupom (max_discount_amount).",
    );
  }

  // Quem paga a taxa do gateway (18/09/2026): a MOVEPARK, da comissão dela. O parceiro recebe a
  // perna cheia. Só volta para o parceiro quando não existe perna da Movepark, ou quando ela é
  // menor que a taxa estimada (o gateway cobra de quem está marcado, sem olhar se cabe).
  // Parceiro: recebe o preço base menos a comissão. O chargeback
  // (`liable`) foi para a Movepark em 15/09/2026 (E0.3.5): o gateway debita o master e a perna do
  // parceiro vira dívida no razão, o mesmo trilho do estorno. Só quando não existe perna da
  // Movepark (take_rate 0 e sem excedente) é que o parceiro fica `liable`, porque o gateway exige
  // um responsável.
  const temPernaMovepark = moveparkAmount > 0;
  const moveparkPagaTaxa = temPernaMovepark && moveparkAmount >= estimatedGatewayFeeCents(method, chargedCents);
  const rules: SplitRule[] = [
    {
      role: "partner",
      recipientId: partnerRecipientId ?? null,
      amount: partnerAmount,
      type: "flat",
      liable: !temPernaMovepark,
      chargeProcessingFee: !moveparkPagaTaxa,
      chargeRemainderFee: !moveparkPagaTaxa,
    },
  ];

  // Movepark: comissão + excedente, responsável pelo chargeback e pela taxa de processamento.
  if (temPernaMovepark) {
    if (requireRecipients && !moveparkRecipientId) {
      throw new Error("Recebedor master da Movepark não configurado.");
    }
    rules.push({
      role: "movepark",
      recipientId: moveparkRecipientId ?? null,
      amount: moveparkAmount,
      type: "flat",
      liable: true,
      chargeProcessingFee: moveparkPagaTaxa,
      chargeRemainderFee: moveparkPagaTaxa,
    });
  }

  // Invariante dura: o split tem que fechar exatamente no valor cobrado.
  const sum = rules.reduce((acc, r) => acc + r.amount, 0);
  if (sum !== chargedCents) {
    throw new Error(`Split não fecha: soma ${sum} != cobrado ${chargedCents}.`);
  }

  return rules;
}

/** A perna do parceiro num split (novo por `role`, antigo por `liable`). */
export function partnerRule(rules: SplitRule[]): SplitRule | undefined {
  return rules.find((r) => (r.role ? r.role === "partner" : r.liable));
}

/**
 * O que VAI ao gateway, dado o razão e o abatimento de dívida desta venda (split dinâmico, E0.3.5).
 *
 * O razão (`buildSplit`) guarda a perna NORMAL do parceiro; o abatimento fica em
 * `payment.debt_recovered_cents`. Aqui a perna que sai é `normal − abatimento`, e o que foi
 * abatido vai para a Movepark. Regra com zero centavos não pode ir (o gateway recusa), então:
 *
 * - parceiro zerado pelo abatimento: sobra só a Movepark, e "tudo para o principal" no Pagar.me é
 *   NÃO mandar `split`. Devolve `undefined`;
 * - Movepark sem perna no razão (take_rate 0) mas com abatimento: ganha uma perna aqui, e passa a
 *   ser a `liable` (o gateway exige um responsável, e o parceiro zerado não pode ser).
 *
 * Nunca abate mais do que a perna do parceiro, e nunca mexe no total.
 */
export function splitForGateway(
  rules: SplitRule[],
  debtRecoveryCents: number,
  moveparkRecipientId: string | null,
): SplitRule[] | undefined {
  const recovery = Math.max(0, Math.floor(debtRecoveryCents || 0));
  if (recovery === 0) return rules;

  const partner = partnerRule(rules);
  if (!partner) return rules;
  const abatido = Math.min(recovery, partner.amount);
  if (abatido === 0) return rules;

  const partnerLeft = partner.amount - abatido;
  const movepark = rules.find((r) => r !== partner);
  const out: SplitRule[] = [];

  if (partnerLeft > 0) {
    out.push({ ...partner, amount: partnerLeft, liable: false });
  }
  if (movepark) {
    out.push({ ...movepark, amount: movepark.amount + abatido, liable: true });
  } else {
    if (!moveparkRecipientId) {
      throw new Error("Recebedor master da Movepark não configurado.");
    }
    out.push({
      role: "movepark",
      recipientId: moveparkRecipientId,
      amount: abatido,
      type: "flat",
      liable: true,
      chargeProcessingFee: false,
      chargeRemainderFee: false,
    });
  }

  // Parceiro zerado: só a Movepark sobrou, e isso é "sem split" para o gateway.
  if (out.length === 1 && out[0].role === "movepark") return undefined;

  const total = rules.reduce((a, r) => a + r.amount, 0);
  const soma = out.reduce((a, r) => a + r.amount, 0);
  if (soma !== total) {
    throw new Error(`Split dinâmico não fecha: soma ${soma} != total ${total}.`);
  }
  return out;
}

/**
 * Quanto desta venda pode abater dívida: no máximo a perna normal do parceiro (decisão 4: até 100%).
 */
export function maxDebtRecoveryCents(rules: SplitRule[]): number {
  return partnerRule(rules)?.amount ?? 0;
}

/**
 * Piso da perna do parceiro quando há abatimento (17/09/2026). A taxa de processamento fica na
 * perna dele; se o abatimento deixasse a perna menor que a taxa, o recebedor ficaria negativo no
 * gateway. `payout_debt_reserve` garante que a perna que sobra é zero ou pelo menos isto. Folga
 * de propósito: PIX custa ~1%, cartão até ~5% mais parcelas; o que não abateu fica para a próxima
 * venda.
 */
export function debtFloorCents(method: "pix" | "card", totalCents: number): number {
  const pct = method === "card" ? 0.15 : 0.03;
  return Math.max(100, Math.ceil(Math.max(0, totalCents) * pct));
}

/**
 * Estorno saindo 100% do master (E0.3.5, decisão 1). Uma regra só: a Movepark devolve tudo ao
 * cliente, o parceiro fica intacto no gateway, e a perna dele entra no razão como dívida.
 */
export function refundSplitToMaster(moveparkRecipientId: string, amountCents: number): SplitRule[] {
  if (!moveparkRecipientId) throw new Error("Recebedor master da Movepark não configurado.");
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error("Valor do estorno inválido.");
  }
  return [
    {
      role: "movepark",
      recipientId: moveparkRecipientId,
      amount: amountCents,
      type: "flat",
      liable: true,
      chargeProcessingFee: true,
      chargeRemainderFee: true,
    },
  ];
}

/**
 * Regras do estorno HÍBRIDO (E0.3.6): o parceiro devolve `partnerCents` (o líquido que recebeu
 * naquela venda) e o master devolve o resto, ficando com `liable` e com as taxas do estorno, como
 * a decisão de 15/09 manda. As duas somam exatamente o valor estornado.
 */
export function refundSplitHybrid(
  moveparkRecipientId: string,
  partnerRecipientId: string,
  partnerCents: number,
  amountCents: number,
): SplitRule[] {
  if (!moveparkRecipientId) throw new Error("Recebedor master da Movepark não configurado.");
  if (!partnerRecipientId) throw new Error("Recebedor do parceiro ausente no split.");
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error("Valor do estorno inválido.");
  if (!Number.isInteger(partnerCents) || partnerCents <= 0 || partnerCents >= amountCents) {
    throw new Error("Parte do parceiro no estorno fora do intervalo.");
  }
  return [
    {
      role: "partner",
      recipientId: partnerRecipientId,
      amount: partnerCents,
      type: "flat",
      liable: false,
      chargeProcessingFee: false,
      chargeRemainderFee: false,
    },
    {
      role: "movepark",
      recipientId: moveparkRecipientId,
      amount: amountCents - partnerCents,
      type: "flat",
      liable: true,
      chargeProcessingFee: true,
      chargeRemainderFee: true,
    },
  ];
}
