import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { alertIfDuplicatePayment, duplicateTrailNote } from "./duplicate.ts";

Deno.test("duplicateTrailNote: lista as cobranças aprovadas", () => {
  const n = duplicateTrailNote([
    { id: "p1", method: "card", amount: "219.70", provider_charge_id: "ch_a", paid_at: null },
    { id: "p2", method: "card", amount: 219.7, provider_charge_id: "ch_b", paid_at: null },
  ]);
  assertStringIncludes(n, "2 pagamentos aprovados");
  assertStringIncludes(n, "ch_a (card, R$ 219.70)");
  assertStringIncludes(n, "ch_b (card, R$ 219.70)");
});

function fakeAdmin(rows: unknown[]) {
  const trail: { kind: string }[] = [];
  const q = {
    select: () => q,
    eq: () => q,
    in: () => q,
    order: () => Promise.resolve({ data: rows, error: null }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
  };
  return {
    trail,
    admin: {
      from: (t: string) =>
        t === "payment_gateway_event"
          ? { insert: (r: { kind: string }) => (trail.push(r), Promise.resolve({ error: null })) }
          : q,
    },
  };
}

Deno.test("alertIfDuplicatePayment: um pagamento só não alerta", async () => {
  const { admin, trail } = fakeAdmin([{ id: "p1", method: "card", amount: 10, provider_charge_id: "ch_a", paid_at: null }]);
  assertEquals(await alertIfDuplicatePayment(admin, "bk1", "p1"), false);
  assertEquals(trail.length, 0);
});

Deno.test("alertIfDuplicatePayment: dois pagamentos deixam rastro na reserva", async () => {
  const { admin, trail } = fakeAdmin([
    { id: "p1", method: "card", amount: 10, provider_charge_id: "ch_a", paid_at: null },
    { id: "p2", method: "pix", amount: 10, provider_charge_id: "ch_b", paid_at: null },
  ]);
  assertEquals(await alertIfDuplicatePayment(admin, "bk1", "p2"), true);
  assertEquals(trail.map((t) => t.kind), ["duplicate_payment"]);
});
