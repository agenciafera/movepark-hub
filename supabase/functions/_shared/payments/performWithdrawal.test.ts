import { assertEquals } from "jsr:@std/assert";
import { performWithdrawal } from "./performWithdrawal.ts";

function fakeAdmin(state: { recipient: Record<string, unknown> | null; teto: Record<string, unknown>; rows: Record<string, unknown>[] }) {
  const table = (name: string) => {
    const q: Record<string, unknown> = {};
    const chain = () => q;
    Object.assign(q, {
      select: chain, eq: chain, is: chain, update: chain, insert: chain,
      maybeSingle: async () => ({ data: name === "payout_recipient" ? state.recipient : null, error: null }),
      upsert: (row: Record<string, unknown>) => { state.rows.push(row); return { select: () => ({ maybeSingle: async () => ({ data: { id: "w1", ...row }, error: null }) }) }; },
    });
    return q;
  };
  return {
    from: table,
    rpc: async (fn: string) => fn === "payout_withdrawable" ? { data: state.teto, error: null } : { data: null, error: null },
  };
}
const gateway = {
  getRecipientBalance: async () => ({ httpStatus: 200, availableCents: 10000, waitingFundsCents: 0, transferredCents: 0 }),
  createWithdrawal: async () => ({ httpStatus: 200, transferId: "tr_1", status: "processing", raw: {} }),
} as never;

Deno.test("performWithdrawal grava origem, quem paga a taxa e o ciclo", async () => {
  const state = { recipient: { id: "r1", external_recipient_id: "re_1", status: "active", gateway_missing_at: null }, teto: { available_cents: 5000, withdrawal_fee_cents: 367 }, rows: [] as Record<string, unknown>[] };
  const r = await performWithdrawal(fakeAdmin(state), gateway, {
    companyId: "d5337b66-7fab-4704-b746-26654024ae25", amountCents: 5000, force: false, isHubAdmin: false,
    requestedBy: "payout-auto-run", origin: "automatic", feeBorneBy: "movepark", cycleId: "cy1",
  });
  assertEquals(r.ok, true);
  const row = state.rows.find((x) => x.external_transfer_id === "tr_1")!;
  assertEquals([row.origin, row.fee_borne_by, row.cycle_id, row.amount_cents, row.fee_cents], ["automatic", "movepark", "cy1", 4633, 367]);
});

Deno.test("performWithdrawal recusa recebedor ausente no gateway com 409", async () => {
  const state = { recipient: { id: "r1", external_recipient_id: "re_1", status: "active", gateway_missing_at: "2026-09-26" }, teto: {}, rows: [] };
  const r = await performWithdrawal(fakeAdmin(state), gateway, {
    companyId: "d5337b66-7fab-4704-b746-26654024ae25", amountCents: 5000, force: false, isHubAdmin: false,
    requestedBy: "x", origin: "manual", feeBorneBy: "partner",
  });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.status, 409);
});
