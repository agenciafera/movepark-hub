import { assertEquals } from "jsr:@std/assert";
import { pixToVoid, voidOpenPixCharges } from "./open-pix.ts";
import type { RefundInput, RefundResult } from "./types.ts";

Deno.test("pixToVoid: só PIX com id de cobrança no gateway", () => {
  assertEquals(pixToVoid([{ id: "a", provider_charge_id: "ch_1" }, { id: "b", provider_charge_id: null }]), [
    { id: "a", provider_charge_id: "ch_1" },
  ]);
});

function fakeAdmin(rows: { id: string; provider_charge_id: string | null }[]) {
  const updates: { patch: unknown; eqs: unknown[][] }[] = [];
  const trail: unknown[] = [];
  const admin = {
    from: (table: string) => {
      if (table === "payment_gateway_event") {
        return { insert: (row: unknown) => (trail.push(row), Promise.resolve({ error: null })) };
      }
      const sel = {
        eqs: [] as unknown[][],
        select: () => sel,
        eq: (...a: unknown[]) => {
          sel.eqs.push(a);
          return sel.eqs.length === 3 ? Promise.resolve({ data: rows, error: null }) : sel;
        },
        update: (patch: unknown) => {
          const u = { patch, eqs: [] as unknown[][] };
          updates.push(u);
          const chain = { eq: (...a: unknown[]) => (u.eqs.push(a), chain) };
          return chain;
        },
      };
      return sel;
    },
  };
  return { admin, updates, trail };
}

function gateway(status: RefundResult["status"], httpStatus = 200) {
  const asked: RefundInput[] = [];
  return {
    asked,
    gw: {
      refundCharge: (i: RefundInput) => {
        asked.push(i);
        return Promise.resolve({ chargeId: i.chargeId, status, refundedAmountCents: null, raw: {}, httpStatus });
      },
    },
  };
}

Deno.test("voidOpenPixCharges: anula o PIX aberto e grava cancelled", async () => {
  const { admin, updates, trail } = fakeAdmin([{ id: "pix1", provider_charge_id: "ch_pix" }]);
  const { gw, asked } = gateway("canceled");
  assertEquals(await voidOpenPixCharges(admin, gw, "bk1"), 1);
  assertEquals(asked, [{ chargeId: "ch_pix" }]);
  assertEquals(updates[0].patch, { status: "cancelled" });
  assertEquals(updates[0].eqs, [["id", "pix1"], ["status", "pending"]]);
  assertEquals((trail[0] as { kind: string }).kind, "pix_voided");
});

Deno.test("voidOpenPixCharges: gateway recusou, não mexe no pagamento", async () => {
  const { admin, updates } = fakeAdmin([{ id: "pix1", provider_charge_id: "ch_pix" }]);
  const { gw } = gateway("pending", 422);
  assertEquals(await voidOpenPixCharges(admin, gw, "bk1"), 0);
  assertEquals(updates.length, 0);
});
