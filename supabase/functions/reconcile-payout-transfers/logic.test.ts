import { assertEquals } from "jsr:@std/assert";
import { BATCH_LIMIT, decideReconcileTransfer } from "./logic.ts";

Deno.test("repasse ainda em curso no gateway não escreve", () => {
  assertEquals(
    decideReconcileTransfer({ current: "processing", httpStatus: 200, rawStatus: "pending_transfer" }),
    null,
  );
});

Deno.test("repasse concluído no gateway fecha como pago", () => {
  assertEquals(
    decideReconcileTransfer({ current: "processing", httpStatus: 200, rawStatus: "transferred" }),
    "paid",
  );
});

Deno.test("repasse que falhou no gateway libera a empresa", () => {
  assertEquals(
    decideReconcileTransfer({ current: "processing", httpStatus: 200, rawStatus: "failed" }),
    "failed",
  );
});

Deno.test("erro ao consultar NÃO vira falha: não saber não é saber que falhou", () => {
  for (const httpStatus of [404, 500, 0, null]) {
    assertEquals(
      decideReconcileTransfer({ current: "processing", httpStatus, rawStatus: null }),
      null,
      `HTTP ${httpStatus}`,
    );
  }
});

Deno.test("lote pequeno: cada item é uma chamada ao gateway", () => {
  assertEquals(BATCH_LIMIT > 0 && BATCH_LIMIT <= 25, true);
});
