import { assertEquals } from "jsr:@std/assert";
import { alertOrphanCharge, attachUnconfirmedPayment } from "./orphan.ts";
import { type ParsedEvent } from "./logic.ts";

// Fake mínimo do client Supabase: grava cada chamada (tabela, operação, filtros, payload) e devolve
// o que o teste mandar. Sem `partner_email_from`, o alerta não tenta SMTP.
interface Call {
  table: string;
  op: "select" | "update" | "insert";
  filters: [string, string, unknown][];
  payload?: unknown;
}
type Reply = { data: unknown; error: null | { message: string } };

function fakeAdmin(reply: (c: Call) => Reply) {
  const calls: Call[] = [];
  const admin = {
    from(table: string) {
      const c: Call = { table, op: "select", filters: [] };
      calls.push(c);
      const q: Record<string, unknown> = {};
      const f = (name: string) => (col: string, val?: unknown) => {
        c.filters.push([name, col, val]);
        return q;
      };
      Object.assign(q, {
        select: () => q,
        eq: f("eq"),
        is: f("is"),
        in: f("in"),
        not: f("not"),
        gt: f("gt"),
        order: () => q,
        limit: () => q,
        maybeSingle: () => Promise.resolve(reply(c)),
        update: (payload: unknown) => {
          c.op = "update";
          c.payload = payload;
          return q;
        },
        insert: (payload: unknown) => {
          c.op = "insert";
          c.payload = payload;
          return Promise.resolve(reply(c));
        },
        then: (ok: (r: Reply) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(reply(c)).then(ok, ko),
      });
      return q;
    },
  };
  return { admin, calls };
}

const evPago: ParsedEvent = {
  eventId: "hook_1",
  type: "charge.paid",
  orderId: "or_tardio",
  chargeId: "ch_lr2Xvwatyu8EAwLx",
  bookingId: "b1",
  bookingCode: "MP-F00991",
  rawStatus: "paid",
  amountCents: 36290,
  paymentMethod: "credit_card",
};

const filtro = (c: Call, name: string, col: string) => c.filters.find(([n, k]) => n === name && k === col)?.[2];

Deno.test("attachUnconfirmedPayment: pendura a cobrança atrasada no pagamento sem ids da reserva", async () => {
  const { admin, calls } = fakeAdmin((c) => {
    if (c.table === "payment" && c.op === "select") return { data: [{ id: "p1" }], error: null };
    if (c.table === "payment" && c.op === "update") return { data: { id: "p1", booking_id: "b1", status: "failed", paid_at: null }, error: null };
    return { data: null, error: null };
  });
  const p = await attachUnconfirmedPayment(admin, evPago, "id, booking_id, status, paid_at");
  assertEquals(p?.id, "p1");

  const busca = calls.find((c) => c.table === "payment" && c.op === "select")!;
  assertEquals(filtro(busca, "eq", "booking_id"), "b1");
  assertEquals(filtro(busca, "eq", "method"), "card");
  assertEquals(filtro(busca, "eq", "amount"), 362.9);
  assertEquals(filtro(busca, "is", "provider_payment_id"), null);
  assertEquals(filtro(busca, "in", "status"), ["pending", "failed"]);

  const escrita = calls.find((c) => c.op === "update")!;
  assertEquals(escrita.payload, { provider_payment_id: "or_tardio", provider_charge_id: "ch_lr2Xvwatyu8EAwLx" });
  // Só pega linha ainda sem id: dois avisos da mesma cobrança não penduram duas vezes.
  assertEquals(filtro(escrita, "is", "provider_payment_id"), null);

  const rastro = calls.find((c) => c.table === "payment_gateway_event" && c.op === "insert")!;
  assertEquals((rastro.payload as { kind: string }).kind, "unconfirmed_attached");
});

Deno.test("attachUnconfirmedPayment: outra entrega já pendurou → null (não pega linha com id)", async () => {
  const { admin } = fakeAdmin((c) => {
    if (c.op === "select" && c.table === "payment") return { data: [{ id: "p1" }], error: null };
    return { data: null, error: null };
  });
  assertEquals(await attachUnconfirmedPayment(admin, evPago, "id"), null);
});

Deno.test("attachUnconfirmedPayment: sem reserva, sem valor ou PIX não procura nada", async () => {
  for (const ev of [
    { ...evPago, bookingId: null },
    { ...evPago, amountCents: null },
    { ...evPago, paymentMethod: "pix" },
    { ...evPago, orderId: null },
  ]) {
    const { admin, calls } = fakeAdmin(() => ({ data: null, error: null }));
    assertEquals(await attachUnconfirmedPayment(admin, ev, "id"), null);
    assertEquals(calls.length, 0);
  }
});

Deno.test("alertOrphanCharge: rastro orphan_charge na reserva, uma vez por cobrança", async () => {
  const { admin, calls } = fakeAdmin((c) => {
    if (c.table === "booking") return { data: { id: "b1", code: "MP-F00991" }, error: null };
    return { data: null, error: null };
  });
  assertEquals(await alertOrphanCharge(admin, evPago), true);
  const rastro = calls.find((c) => c.table === "payment_gateway_event" && c.op === "insert")!;
  const row = rastro.payload as { kind: string; booking_id: string; request: { ref: string } };
  assertEquals(row.kind, "orphan_charge");
  assertEquals(row.booking_id, "b1");
  assertEquals(row.request.ref, "ch_lr2Xvwatyu8EAwLx");

  // `order.paid` da mesma cobrança: já alertado, não repete.
  const { admin: admin2, calls: calls2 } = fakeAdmin((c) => {
    if (c.table === "payment_gateway_event" && c.op === "select") return { data: { id: "e1" }, error: null };
    return { data: null, error: null };
  });
  assertEquals(await alertOrphanCharge(admin2, { ...evPago, type: "order.paid" }), false);
  assertEquals(calls2.filter((c) => c.op === "insert").length, 0);
});
