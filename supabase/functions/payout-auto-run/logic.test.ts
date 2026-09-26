import { assertEquals } from "jsr:@std/assert";
import { brtToday, decideOutcome, parseRunInput } from "./logic.ts";

Deno.test("brtToday: 01:00 UTC ainda é o dia anterior em Brasília", () => {
  assertEquals(brtToday(new Date("2026-10-10T01:00:00Z")), "2026-10-09");
  assertEquals(brtToday(new Date("2026-10-10T12:00:00Z")), "2026-10-10");
});

Deno.test("decideOutcome: abaixo do mínimo acumula; sem saldo no gateway espera; senão saca", () => {
  assertEquals(decideOutcome({ availableCents: 4999, minCents: 5000, gatewayAvailableCents: 10000 }), "below_min");
  assertEquals(decideOutcome({ availableCents: 5000, minCents: 5000, gatewayAvailableCents: 0 }), "no_balance");
  assertEquals(decideOutcome({ availableCents: 5000, minCents: 5000, gatewayAvailableCents: 10000 }), "withdraw");
});

Deno.test("parseRunInput: today só vale com hub_admin; company_id precisa ser uuid", () => {
  assertEquals(parseRunInput({ today: "2026-10-10" }, false).today, null);
  assertEquals(parseRunInput({ today: "2026-10-10" }, true).today, "2026-10-10");
  assertEquals(parseRunInput({ company_id: "x" }, true).companyId, null);
  assertEquals(parseRunInput({ dry_run: true }, false).dryRun, true);
});
