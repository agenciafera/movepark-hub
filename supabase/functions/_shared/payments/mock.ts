// Gateway mock — paridade com `payment.provider = 'mock'`. Não chama rede; aprova na hora.
// Útil para testes da camada de vínculo e para ambientes sem credencial de gateway.

import type {
  PayablesResult,
  RecipientBalance,
  TransferInput,
  TransferResult,
  CardChargeInput,
  ChargeResult,
  PaymentGateway,
  PixChargeInput,
  RecipientInput,
  RecipientResult,
  RefundInput,
  RefundResult,
} from "./types.ts";

export class MockGateway implements PaymentGateway {
  readonly provider = "mock";

  createPixCharge(input: PixChargeInput): Promise<ChargeResult> {
    const orderId = `mock_or_${input.externalCode}`;
    return Promise.resolve({
      orderId,
      chargeId: `mock_ch_${input.externalCode}`,
      status: "pending",
      qrCode: `00020126mock-${input.externalCode}5204000053039865802BR6304MOCK`,
      qrCodeUrl: null,
      expiresAt: null,
      raw: { mock: true },
      httpStatus: 200,
    });
  }

  getCharge(orderId: string): Promise<ChargeResult> {
    return Promise.resolve({
      orderId,
      chargeId: orderId.replace("mock_or_", "mock_ch_"),
      status: "paid",
      qrCode: null,
      qrCodeUrl: null,
      expiresAt: null,
      raw: { mock: true },
      httpStatus: 200,
    });
  }

  createCardCharge(input: CardChargeInput): Promise<ChargeResult> {
    // token/cardId com marcador "mock_decline" → recusa; senão aprova na hora.
    const ref = input.card.cardId ?? input.card.cardToken ?? "";
    const declined = ref.includes("mock_decline");
    return Promise.resolve({
      orderId: `mock_or_${input.externalCode}`,
      chargeId: `mock_ch_${input.externalCode}`,
      status: declined ? "failed" : "paid",
      qrCode: null,
      qrCodeUrl: null,
      expiresAt: null,
      raw: { mock: true, installments: input.installments },
      httpStatus: declined ? 402 : 200,
    });
  }

  refundCharge({ chargeId, amountCents }: RefundInput): Promise<RefundResult> {
    return Promise.resolve({
      chargeId,
      status: "refunded",
      refundedAmountCents: amountCents ?? null,
      raw: { mock: true },
      httpStatus: 200,
    });
  }

  createRecipient(input: RecipientInput): Promise<RecipientResult> {
    return Promise.resolve({
      externalId: `mock_rcv_${input.externalCode}`,
      status: "active",
      rawStatus: "active",
      kycUrl: null,
      kycExpiresAt: null,
      requirements: [],
      raw: { mock: true },
      httpStatus: 200,
    });
  }

  getRecipient(externalId: string, _opts?: { kycLink?: boolean }): Promise<RecipientResult> {
    return Promise.resolve({
      externalId,
      status: "active",
      rawStatus: "active",
      kycUrl: null,
      kycExpiresAt: null,
      requirements: [],
      raw: { mock: true },
      httpStatus: 200,
    });
  }

  updateTransferSettings(externalId: string): Promise<RecipientResult> {
    return this.getRecipient(externalId);
  }

  updateAnticipationSettings(externalId: string): Promise<RecipientResult> {
    return this.getRecipient(externalId);
  }

  /** O mock não tem gateway, logo não tem recebível nem taxa. */
  listPayables(): Promise<PayablesResult> {
    return Promise.resolve({ payables: [], raw: null, httpStatus: 200 });
  }


  /** O mock não move dinheiro: devolve uma transferência sintética já concluída. */
  createTransfer(input: TransferInput): Promise<TransferResult> {
    return Promise.resolve({
      transferId: `mock_tr_${input.idempotencyKey.slice(0, 8)}`,
      status: "transferred",
      amountCents: input.amountCents,
      sourceId: input.sourceRecipientId,
      targetId: input.targetRecipientId,
      raw: null,
      httpStatus: 200,
    });
  }

  /** Saldo do mock é sempre suficiente; o pré-voo do repasse não trava em teste. */
  getRecipientBalance(): Promise<RecipientBalance> {
    return Promise.resolve({
      availableCents: Number.MAX_SAFE_INTEGER,
      waitingFundsCents: 0,
      transferredCents: 0,
      raw: null,
      httpStatus: 200,
    });
  }

}
