import { assertEquals } from "jsr:@std/assert";
import { batchIds, buildShowcaseMap, type LowestDailyRow } from "./showcasePrice.ts";

const linha = (over: Partial<LowestDailyRow> = {}): LowestDailyRow => ({
  location_parking_type_id: "lpt-1",
  days: 7,
  total: "174.30",
  old_total: null,
  daily: "24.90",
  min_stay_days: null,
  ...over,
});

Deno.test("buildShowcaseMap converte o numérico que chega como string", () => {
  const map = buildShowcaseMap([linha()]);
  assertEquals(map.get("lpt-1"), {
    total: 174.3,
    oldTotal: null,
    days: 7,
    minStayDays: null,
  });
});

Deno.test("buildShowcaseMap só guarda balcão maior que o preço", () => {
  assertEquals(buildShowcaseMap([linha({ old_total: "280.00" })]).get("lpt-1")?.oldTotal, 280);
  assertEquals(buildShowcaseMap([linha({ old_total: "174.30" })]).get("lpt-1")?.oldTotal, null);
});

Deno.test("buildShowcaseMap descarta lote sem preço", () => {
  assertEquals(buildShowcaseMap([linha({ total: null })]).size, 0);
  assertEquals(buildShowcaseMap([linha({ total: "0" })]).size, 0);
  assertEquals(buildShowcaseMap(null).size, 0);
});

Deno.test("buildShowcaseMap trata estadia mínima de 1 diária como ausência de exigência", () => {
  assertEquals(buildShowcaseMap([linha({ min_stay_days: 1 })]).get("lpt-1")?.minStayDays, null);
  assertEquals(buildShowcaseMap([linha({ min_stay_days: 3 })]).get("lpt-1")?.minStayDays, 3);
});

Deno.test("batchIds respeita o teto de ids da RPC", () => {
  const ids = Array.from({ length: 120 }, (_, i) => `id-${i}`);
  const lotes = batchIds(ids, 50);
  assertEquals(lotes.length, 3);
  assertEquals(lotes[0].length, 50);
  assertEquals(lotes[2].length, 20);
  assertEquals(batchIds([], 50).length, 0);
});
