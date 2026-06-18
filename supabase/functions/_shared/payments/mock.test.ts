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
