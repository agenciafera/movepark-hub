import { assertEquals } from "jsr:@std/assert";
import {
  availabilityFor,
  buildAvailabilityMap,
  soldOutTiebreak,
  type AvailabilityRow,
} from "./availability.ts";

const rows: AvailabilityRow[] = [
  { location_parking_type_id: "a", capacity: 10, remaining: 3, sold_out: false, near_capacity: true, near_capacity_message: "Poucas" },
  { location_parking_type_id: "b", capacity: 5, remaining: 0, sold_out: true, near_capacity: false, near_capacity_message: null },
];

Deno.test("buildAvailabilityMap indexa por lpt", () => {
  const m = buildAvailabilityMap(rows);
  assertEquals(m.get("a")?.near_capacity, true);
  assertEquals(m.get("b")?.sold_out, true);
});

Deno.test("availabilityFor retorna fallback disponível p/ lpt ausente", () => {
  const m = buildAvailabilityMap(rows);
  assertEquals(availabilityFor(m, "zzz"), {
    remaining: null,
    sold_out: false,
    near_capacity: false,
    near_capacity_message: null,
  });
});

Deno.test("buildAvailabilityMap aceita null/undefined", () => {
  assertEquals(buildAvailabilityMap(null).size, 0);
  assertEquals(buildAvailabilityMap(undefined).size, 0);
});

Deno.test("soldOutTiebreak joga esgotados pro fim", () => {
  const m = buildAvailabilityMap(rows);
  const avA = availabilityFor(m, "a"); // disponível
  const avB = availabilityFor(m, "b"); // esgotado
  // disponível antes de esgotado → negativo
  assertEquals(soldOutTiebreak(avA, avB) < 0, true);
  // esgotado depois → positivo
  assertEquals(soldOutTiebreak(avB, avA) > 0, true);
  // mesmo status → 0 (deixa o sort principal decidir)
  assertEquals(soldOutTiebreak(avA, avA), 0);
});
