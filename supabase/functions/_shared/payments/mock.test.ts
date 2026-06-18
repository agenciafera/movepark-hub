import { assertEquals } from "jsr:@std/assert";
import { MockGateway } from "./mock.ts";

Deno.test("MockGateway.refundCharge: total → refunded síncrono", async () => {
  const gw = new MockGateway();
  const r = await gw.refundCharge({ chargeId: "mock_ch_X" });
  assertEquals(r.chargeId, "mock_ch_X");
  assertEquals(r.status, "refunded");
  assertEquals(r.refundedAmountCents, null);
  assertEquals(r.httpStatus, 200);
});

Deno.test("MockGateway.refundCharge: parcial preserva o amount", async () => {
  const gw = new MockGateway();
  const r = await gw.refundCharge({ chargeId: "mock_ch_Y", amountCents: 5000 });
  assertEquals(r.status, "refunded");
  assertEquals(r.refundedAmountCents, 5000);
});

const cardInput = (token: string) => ({
  externalCode: "MP-Z",
  amountCents: 10000,
  customer: { name: "C", email: "c@ex.com", document: null, type: "individual" as const },
  items: [{ amount: 10000, description: "x", quantity: 1 }],
  split: [{ recipientId: "rp_p", amount: 10000, type: "flat" as const, liable: true, chargeProcessingFee: true, chargeRemainderFee: true }],
  card: { cardToken: token },
  installments: 3,
});

Deno.test("MockGateway.createCardCharge: aprova por padrão", async () => {
  const r = await new MockGateway().createCardCharge(cardInput("token_ok"));
  assertEquals(r.status, "paid");
  assertEquals(r.chargeId, "mock_ch_MP-Z");
  assertEquals(r.qrCode, null);
});

Deno.test("MockGateway.createCardCharge: token mock_decline → recusa", async () => {
  const r = await new MockGateway().createCardCharge(cardInput("tok_mock_decline"));
  assertEquals(r.status, "failed");
  assertEquals(r.httpStatus, 402);
});
