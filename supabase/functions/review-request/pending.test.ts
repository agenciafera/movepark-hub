import { assertEquals } from "jsr:@std/assert";
import { pendingReviewRequests, reviewRecipient, reviewWindowStartIso } from "./pending.ts";

Deno.test("mantém reservas sem avaliação (array vazio, null ou ausente)", () => {
  const rows = [
    { id: "a", review: [] },
    { id: "b", review: null },
    { id: "c" },
  ];
  assertEquals(pendingReviewRequests(rows).map((r) => r.id), ["a", "b", "c"]);
});

Deno.test("exclui reservas que já têm avaliação", () => {
  const rows = [
    { id: "a", review: [{ id: "rev-1" }] },
    { id: "b", review: [] },
  ];
  assertEquals(pendingReviewRequests(rows).map((r) => r.id), ["b"]);
});

Deno.test("entrada nula/indefinida → lista vazia", () => {
  assertEquals(pendingReviewRequests(null), []);
  assertEquals(pendingReviewRequests(undefined), []);
});

// Regressão 19/10/2026: conta de WhatsApp não tem e-mail; o e-mail do pedido está na reserva.
Deno.test("reviewRecipient: usa o e-mail da reserva quando a conta não tem", () => {
  assertEquals(reviewRecipient({ customer_email: "cliente@ex.com", customer_first_name: "Ana" }, null), {
    email: "cliente@ex.com",
    firstName: "Ana",
  });
});

Deno.test("reviewRecipient: reserva sem e-mail cai no e-mail da conta; nome cai no perfil", () => {
  assertEquals(reviewRecipient({ customer_email: " ", profile: { first_name: "Bia" } }, "bia@ex.com"), {
    email: "bia@ex.com",
    firstName: "Bia",
  });
});

Deno.test("reviewRecipient: sem e-mail nenhum não envia", () => {
  assertEquals(reviewRecipient({ customer_email: null }, null), null);
});

Deno.test("reviewWindowStartIso: só estadias que terminaram nos últimos 14 dias", () => {
  assertEquals(reviewWindowStartIso(Date.parse("2026-10-19T12:00:00.000Z")), "2026-10-05T12:00:00.000Z");
});
