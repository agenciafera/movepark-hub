import { assertEquals } from "jsr:@std/assert";
import { nextTransferRowStatus, transferRowStatus } from "./transfer.ts";

// Uma regra só para o webhook `transfer.*` e para a conciliação por polling. Duas cópias dessa
// decisão seria o jeito mais fácil de uma fechar como pago o que a outra reabre.

Deno.test("transferRowStatus: mapeia o cru do gateway sem nunca chutar pago", () => {
  assertEquals(transferRowStatus("transferred"), "paid");
  assertEquals(transferRowStatus("failed"), "failed");
  assertEquals(transferRowStatus("canceled"), "canceled");
  assertEquals(transferRowStatus("pending_transfer"), "processing");
  assertEquals(transferRowStatus(undefined), "processing");
});

Deno.test("nextTransferRowStatus: processing avança para pago", () => {
  assertEquals(nextTransferRowStatus("processing", "transferred"), "paid");
});

Deno.test("nextTransferRowStatus: processing avança para falha e libera", () => {
  assertEquals(nextTransferRowStatus("processing", "failed"), "failed");
});

Deno.test("nextTransferRowStatus: igual ao atual não escreve", () => {
  assertEquals(nextTransferRowStatus("processing", "pending_transfer"), null);
});

Deno.test("nextTransferRowStatus: terminal nunca rebaixa (evento fora de ordem)", () => {
  assertEquals(nextTransferRowStatus("paid", "pending_transfer"), null);
  assertEquals(nextTransferRowStatus("paid", "failed"), null);
  assertEquals(nextTransferRowStatus("failed", "transferred"), null);
  assertEquals(nextTransferRowStatus("canceled", "transferred"), null);
});

Deno.test("nextTransferRowStatus: evento `created` não devolve a linha para created", () => {
  // O webhook reusava o mapa do saque, onde `created` volta `created`. Numa linha que a Edge já
  // tinha passado para processing, isso a rebaixava.
  assertEquals(nextTransferRowStatus("processing", "created"), null);
  assertEquals(nextTransferRowStatus("created", "created"), "processing");
});
