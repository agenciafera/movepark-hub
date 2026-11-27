import { assertEquals } from "jsr:@std/assert";
import type { GatewayOrder } from "./types.ts";
import {
  isUnknownGatewayOutcome,
  pickRecoveredOrder,
  recoverOrder,
  searchSinceIso,
  UNCONFIRMED_CHARGE_WINDOW_MINUTES,
  unconfirmedExpiresAt,
} from "./unconfirmed.ts";
import { buildOrderList, orderSearchPath } from "./pagarme.ts";

function order(o: Partial<GatewayOrder>): GatewayOrder {
  return {
    orderId: "or_1",
    chargeId: "ch_1",
    status: "paid",
    qrCode: null,
    qrCodeUrl: null,
    expiresAt: null,
    raw: {},
    httpStatus: 200,
    createdAt: "2026-11-26T01:54:20Z",
    amountCents: 36290,
    paymentMethod: "credit_card",
    ...o,
  };
}

const tentativa = new Date("2026-11-26T01:54:18Z");

Deno.test("isUnknownGatewayOutcome: 5xx, timeout e rede são 'não sei'; 4xx e 2xx são resposta", () => {
  for (const s of [null, undefined, 0, 408, 500, 502, 503, 504]) assertEquals(isUnknownGatewayOutcome(s), true, String(s));
  for (const s of [200, 201, 400, 402, 409, 412, 422, 429]) assertEquals(isUnknownGatewayOutcome(s), false, String(s));
});

Deno.test("pickRecoveredOrder: acha o pedido criado pela tentativa que voltou 500 (MP-F00991)", () => {
  const achado = pickRecoveredOrder([order({})], {
    attemptStartedAt: tentativa,
    amountCents: 36290,
    paymentMethod: "credit_card",
    knownOrderIds: new Set(),
  });
  assertEquals(achado?.orderId, "or_1");
});

Deno.test("pickRecoveredOrder: ignora pedido já gravado em payment (a recusa da tentativa anterior)", () => {
  const achado = pickRecoveredOrder([order({ orderId: "or_velho", status: "failed" })], {
    attemptStartedAt: tentativa,
    amountCents: 36290,
    paymentMethod: "credit_card",
    knownOrderIds: new Set(["or_velho"]),
  });
  assertEquals(achado, null);
});

Deno.test("pickRecoveredOrder: valor, meio e data têm que bater; vence o mais novo", () => {
  const opts = { attemptStartedAt: tentativa, amountCents: 36290, paymentMethod: "credit_card", knownOrderIds: new Set<string>() };
  assertEquals(pickRecoveredOrder([order({ amountCents: 36291 })], opts), null, "valor diferente");
  assertEquals(pickRecoveredOrder([order({ paymentMethod: "pix" })], opts), null, "meio diferente");
  assertEquals(pickRecoveredOrder([order({ createdAt: "2026-11-26T01:40:00Z" })], opts), null, "antes da tentativa");
  assertEquals(pickRecoveredOrder([order({ createdAt: null })], opts), null, "sem data");
  // Sem fuso: a v5 às vezes manda assim, e é UTC.
  assertEquals(pickRecoveredOrder([order({ createdAt: "2026-11-26T01:54:19" })], opts)?.orderId, "or_1");
  const dois = pickRecoveredOrder(
    [order({ orderId: "or_a", createdAt: "2026-11-26T01:54:19Z" }), order({ orderId: "or_b", createdAt: "2026-11-26T01:54:21Z" })],
    opts,
  );
  assertEquals(dois?.orderId, "or_b");
});

Deno.test("searchSinceIso e unconfirmedExpiresAt: folga de 1 min para trás, prazo à frente", () => {
  assertEquals(searchSinceIso(tentativa), "2026-11-26T01:53:18.000Z");
  const agora = new Date("2026-11-26T01:55:00Z");
  assertEquals(
    unconfirmedExpiresAt(agora),
    new Date(agora.getTime() + UNCONFIRMED_CHARGE_WINDOW_MINUTES * 60_000).toISOString(),
  );
});

Deno.test("recoverOrder: busca no gateway, filtra pelo que já está em payment e nunca lança", async () => {
  const admin = {
    from: () => ({
      select: () => ({
        eq: () => ({ not: () => Promise.resolve({ data: [{ provider_payment_id: "or_velho" }], error: null }) }),
      }),
    }),
  };
  const buscas: string[] = [];
  const gateway = {
    findOrdersByCode: (code: string, since: string) => {
      buscas.push(`${code}@${since}`);
      return Promise.resolve([order({ orderId: "or_velho" }), order({ orderId: "or_novo" })]);
    },
  };
  const opts = { bookingId: "b1", code: "MP-F00991", attemptStartedAt: tentativa, amountCents: 36290, paymentMethod: "credit_card" };
  // deno-lint-ignore no-explicit-any
  const achado = await recoverOrder(admin, gateway as any, opts);
  assertEquals(achado?.orderId, "or_novo");
  assertEquals(buscas, ["MP-F00991@2026-11-26T01:53:18.000Z"]);

  const quebrado = { findOrdersByCode: () => Promise.reject(new Error("rede")) };
  // deno-lint-ignore no-explicit-any
  assertEquals(await recoverOrder(admin, quebrado as any, opts), null);
});

Deno.test("buildOrderList: normaliza a lista da v5 e erro HTTP vira lista vazia", () => {
  const lista = buildOrderList(200, {
    data: [{
      id: "or_x",
      code: "MP-F00991",
      amount: 36290,
      status: "paid",
      created_at: "2026-11-26T01:54:20Z",
      charges: [{ id: "ch_x", amount: 36290, payment_method: "credit_card", status: "paid", last_transaction: {} }],
    }],
  });
  assertEquals(lista.length, 1);
  assertEquals(lista[0].orderId, "or_x");
  assertEquals(lista[0].chargeId, "ch_x");
  assertEquals(lista[0].status, "paid");
  assertEquals(lista[0].amountCents, 36290);
  assertEquals(lista[0].paymentMethod, "credit_card");
  assertEquals(buildOrderList(500, { message: "Internal Server Error" }), []);
});

Deno.test("orderSearchPath: código e data vão escapados na query", () => {
  assertEquals(
    orderSearchPath("MP-F00991", "2026-11-26T01:53:18.000Z"),
    "/orders?code=MP-F00991&created_since=2026-11-26T01%3A53%3A18.000Z&size=20",
  );
});

// ── Adapter: chave de idempotência e erro de rede (o POST que voltou 500 em 25/11/2026) ──

import { PagarmeGateway } from "./pagarme.ts";
import type { CardChargeInput } from "./types.ts";

const cardInput: CardChargeInput = {
  externalCode: "MP-F00991",
  amountCents: 36290,
  customer: { name: "Cliente", email: "c@ex.com", document: null, type: "individual" },
  items: [{ amount: 36290, description: "Reserva", quantity: 1 }],
  card: { cardToken: "tok_1" },
  installments: 1,
  idempotencyKey: "chave-da-tentativa",
};

Deno.test("PagarmeGateway.createCardCharge: manda Idempotency-Key no POST /orders", async () => {
  const original = globalThis.fetch;
  let headers: Headers | null = null;
  globalThis.fetch = ((_url: string, init?: RequestInit) => {
    headers = new Headers(init?.headers);
    return Promise.resolve(new Response(JSON.stringify({ message: "Internal Server Error" }), { status: 500 }));
  }) as typeof fetch;
  try {
    const r = await new PagarmeGateway("sk_test_x").createCardCharge(cardInput);
    assertEquals((headers as Headers | null)?.get("Idempotency-Key"), "chave-da-tentativa");
    assertEquals(r.httpStatus, 500);
    assertEquals(r.orderId, null);
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("PagarmeGateway.createCardCharge: erro de rede não lança, vira httpStatus 0 ('não sei')", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (() => Promise.reject(new TypeError("connection reset"))) as typeof fetch;
  try {
    const r = await new PagarmeGateway("sk_test_x").createCardCharge(cardInput);
    assertEquals(r.httpStatus, 0);
    assertEquals(isUnknownGatewayOutcome(r.httpStatus), true);
  } finally {
    globalThis.fetch = original;
  }
});
