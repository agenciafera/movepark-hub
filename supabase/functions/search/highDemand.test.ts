import { assertEquals } from "jsr:@std/assert";
import { buildHighDemandSet, isHighDemandToday, type HighDemandRow } from "./highDemand.ts";

const rows: HighDemandRow[] = [{ location_id: "loc-a" }, { location_id: "loc-b" }];

Deno.test("buildHighDemandSet indexa por location_id", () => {
  const s = buildHighDemandSet(rows);
  assertEquals(s.size, 2);
  assertEquals(s.has("loc-a"), true);
});

Deno.test("buildHighDemandSet aceita null/undefined", () => {
  assertEquals(buildHighDemandSet(null).size, 0);
  assertEquals(buildHighDemandSet(undefined).size, 0);
});

Deno.test("isHighDemandToday reflete presença no set, sem número", () => {
  const s = buildHighDemandSet(rows);
  assertEquals(isHighDemandToday(s, "loc-a"), true);
  assertEquals(isHighDemandToday(s, "loc-zzz"), false);
});
