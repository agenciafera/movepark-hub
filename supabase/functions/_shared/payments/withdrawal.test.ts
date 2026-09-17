import { assertEquals } from "jsr:@std/assert";
import {
  expectedFundingDate,
  nextWithdrawalStatus,
  transferStatusToWithdrawalStatus,
  withdrawalPatch,
} from "./withdrawal.ts";
import type { TransferResult } from "./types.ts";

const result = (over: Partial<TransferResult>): TransferResult => ({
  transferId: "123",
  status: "pending_transfer",
  amountCents: 1000,
  sourceId: null,
  targetId: null,
  raw: { id: 123 },
  httpStatus: 200,
  ...over,
});

Deno.test("status cru do gateway vira status do saque", () => {
  assertEquals(transferStatusToWithdrawalStatus("transferred"), "paid");
  assertEquals(transferStatusToWithdrawalStatus("pending_transfer"), "processing");
  assertEquals(transferStatusToWithdrawalStatus("failed"), "failed");
  assertEquals(transferStatusToWithdrawalStatus(null), "created");
});

Deno.test("terminal nunca reabre e created não rebaixa processing", () => {
  assertEquals(nextWithdrawalStatus("paid", "pending_transfer"), null);
  assertEquals(nextWithdrawalStatus("processing", "created"), null);
  assertEquals(nextWithdrawalStatus("processing", "processing"), null);
  assertEquals(nextWithdrawalStatus("processing", "transferred"), "paid");
  assertEquals(nextWithdrawalStatus("created", "pending_transfer"), "processing");
});

Deno.test("previsão: antes das 15h em dia útil cai no mesmo dia (fim do dia BRT)", () => {
  // Quinta 17/09/2026, 14:30 BRT = 17:30Z
  assertEquals(expectedFundingDate(new Date("2026-09-17T17:30:00Z")), "2026-09-18T02:59:00.000Z");
});

Deno.test("previsão: depois das 15h vai para o próximo dia útil; sexta à tarde vai para segunda", () => {
  assertEquals(expectedFundingDate(new Date("2026-09-17T18:30:00Z")), "2026-09-19T02:59:00.000Z");
  // Sexta 18/09 16:00 BRT → segunda 21/09
  assertEquals(expectedFundingDate(new Date("2026-09-18T19:00:00Z")), "2026-09-22T02:59:00.000Z");
  // Sábado de manhã → segunda
  assertEquals(expectedFundingDate(new Date("2026-09-19T12:00:00Z")), "2026-09-22T02:59:00.000Z");
});

Deno.test("linha nova: status, previsão do gateway e sincronização", () => {
  const p = withdrawalPatch({
    result: result({ fundingEstimatedDate: "2026-09-18T12:00:00.000Z" }),
    nowIso: "2026-09-17T17:30:00.000Z",
  });
  assertEquals(p, {
    gateway_status: "pending_transfer",
    synced_at: "2026-09-17T17:30:00.000Z",
    raw: { id: 123 },
    expected_at: "2026-09-18T12:00:00.000Z",
    status: "processing",
  });
});

Deno.test("linha nova sem previsão do gateway usa a regra das 15h", () => {
  const p = withdrawalPatch({ result: result({}), nowIso: "2026-09-17T17:30:00.000Z" });
  assertEquals(p?.expected_at, "2026-09-18T02:59:00.000Z");
});

Deno.test("conciliação: caiu no banco fecha como pago com a data do gateway", () => {
  const p = withdrawalPatch({
    result: result({ status: "transferred", fundingDate: "2026-09-18T13:05:00.000Z" }),
    nowIso: "2026-09-18T15:00:00.000Z",
    current: "processing",
  });
  assertEquals(p?.status, "paid");
  assertEquals(p?.paid_at, "2026-09-18T13:05:00.000Z");
});

Deno.test("conciliação: falhou traz o motivo do banco", () => {
  const p = withdrawalPatch({
    result: result({ status: "failed", bankResponse: "conta encerrada" }),
    nowIso: "2026-09-18T15:00:00.000Z",
    current: "processing",
  });
  assertEquals(p?.status, "failed");
  assertEquals(p?.failure_reason, "conta encerrada");
});

Deno.test("conciliação: sem mudança só atualiza a leitura; erro HTTP não escreve", () => {
  const p = withdrawalPatch({ result: result({}), nowIso: "2026-09-18T15:00:00.000Z", current: "processing" });
  assertEquals(p?.status, undefined);
  assertEquals(p?.synced_at, "2026-09-18T15:00:00.000Z");
  assertEquals(withdrawalPatch({ result: result({ httpStatus: 500 }), nowIso: "x", current: "processing" }), null);
});
