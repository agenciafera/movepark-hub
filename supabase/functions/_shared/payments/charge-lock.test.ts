import { assertEquals } from "jsr:@std/assert";
import { claimChargeLock } from "./charge-lock.ts";

function fakeAdmin(claim: { data: unknown; error: { message: string } | null }) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  return {
    calls,
    admin: {
      rpc: (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args });
        return Promise.resolve(fn === "payment_charge_lock_claim" ? claim : { data: true, error: null });
      },
    },
  };
}

Deno.test("claimChargeLock: leva a trava e solta com o próprio token, uma vez só", async () => {
  const { admin, calls } = fakeAdmin({ data: "tok-1", error: null });
  const lock = await claimChargeLock(admin, "bk1");
  assertEquals(lock.acquired, true);
  assertEquals(calls[0], { fn: "payment_charge_lock_claim", args: { p_booking_id: "bk1", p_ttl_seconds: 120 } });
  await lock.release();
  await lock.release();
  assertEquals(calls.filter((c) => c.fn === "payment_charge_lock_release"), [
    { fn: "payment_charge_lock_release", args: { p_booking_id: "bk1", p_token: "tok-1" } },
  ]);
});

// Regressão MP-07DAE9: a segunda chamada simultânea da mesma reserva não cobra.
Deno.test("claimChargeLock: trava ocupada não é levada e não solta a de ninguém", async () => {
  const { admin, calls } = fakeAdmin({ data: null, error: null });
  const lock = await claimChargeLock(admin, "bk1");
  assertEquals(lock.acquired, false);
  await lock.release();
  assertEquals(calls.length, 1);
});

Deno.test("claimChargeLock: erro na RPC segue sem trava (não para a venda)", async () => {
  const { admin } = fakeAdmin({ data: null, error: { message: "boom" } });
  const lock = await claimChargeLock(admin, "bk1");
  assertEquals(lock.acquired, true);
});
