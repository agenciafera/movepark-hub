import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildReconcileRows, reconcileWindow } from "./logic.ts";

Deno.test("buildReconcileRows: external = sold_wl por dia", () => {
  const days = [
    { date: "2026-06-22", capacity: 1100, sold_wl: 834, sold_external: 0, available: 266 },
    { date: "2026-06-23", capacity: 1100, sold_wl: 767, sold_external: 5, available: 328 },
    { date: "", capacity: 0, sold_wl: 9, sold_external: 0, available: 0 }, // sem data → descartado
  ];
  assertEquals(buildReconcileRows(days), [
    { date: "2026-06-22", external: 834 },
    { date: "2026-06-23", external: 767 },
  ]);
  assertEquals(buildReconcileRows([]), []);
});

Deno.test("reconcileWindow: hoje..hoje+N em YYYY-MM-DD", () => {
  const w = reconcileWindow(new Date("2026-06-22T10:00:00Z"), 90);
  assertEquals(w.start, "2026-06-22");
  assertEquals(w.end, "2026-09-20");
});
