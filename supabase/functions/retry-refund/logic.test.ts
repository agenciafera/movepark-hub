import { assertEquals } from "jsr:@std/assert";
import { parseRetryInput, retryPreflight, retryResponse } from "./logic.ts";

Deno.test("parseRetryInput exige o id da linha da fila", () => {
  assertEquals(parseRetryInput({ manual_refund_id: " mr1 " }), { id: "mr1" });
  assertEquals(parseRetryInput({}).id, null);
  assertEquals(parseRetryInput(null).id, null);
});

Deno.test("retryPreflight: só linha pendente de pagamento ainda não estornado", () => {
  assertEquals(retryPreflight(null, null).status, 404);
  assertEquals(retryPreflight({ status: "paid" }, { status: "paid" }).status, 409);
  assertEquals(retryPreflight({ status: "pending" }, null).status, 404);
  assertEquals(retryPreflight({ status: "pending" }, { status: "refunded" }).status, 409);
  assertEquals(retryPreflight({ status: "pending" }, { status: "paid" }).ok, true);
});

Deno.test("retryResponse: incerteza 502, recusa 409 com o motivo, sucesso fecha a fila", () => {
  assertEquals(retryResponse("transient", { status: "paid" }).http, 502);
  const recusa = retryResponse("definitive", { status: "failed", failureMessages: ["action_forbidden |  | Saldo insuficiente."] });
  assertEquals(recusa.http, 409);
  assertEquals(recusa.closeQueue, false);
  assertEquals(recusa.body.error, "O gateway recusou de novo: action_forbidden |  | Saldo insuficiente.");
  assertEquals(retryResponse("ok", { status: "refunded" }), { http: 200, body: { ok: true, status: "refunded", refund_pending: false }, closeQueue: true });
  assertEquals(retryResponse("ok", { status: "paid" }).body, { ok: true, status: "paid", refund_pending: true });
});
