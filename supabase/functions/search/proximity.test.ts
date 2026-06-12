import { assertEquals } from "jsr:@std/assert";
import { haversineKm, nearestTerminal, type TerminalPoint } from "./proximity.ts";

Deno.test("haversineKm: mesmo ponto = 0", () => {
  assertEquals(haversineKm(-23.5, -46.6, -23.5, -46.6), 0);
});

Deno.test("haversineKm: ~111 km por grau de latitude", () => {
  const d = haversineKm(0, 0, 1, 0);
  assertEquals(d > 111 && d < 112, true);
});

const GRU: TerminalPoint[] = [
  { name: "Terminal 1", latitude: -23.4336, longitude: -46.4806 },
  { name: "Terminal 2", latitude: -23.4327, longitude: -46.473 },
  { name: "Terminal 3", latitude: -23.4316, longitude: -46.469 },
];

Deno.test("nearestTerminal: escolhe o terminal mais próximo do lote", () => {
  // Lote colado no T3.
  const n = nearestTerminal(-23.4317, -46.4691, GRU);
  assertEquals(n?.name, "Terminal 3");
  assertEquals(n != null && n.distance_km < 0.2, true);
});

Deno.test("nearestTerminal: lote sem geo → null", () => {
  assertEquals(nearestTerminal(null, -46.47, GRU), null);
});

Deno.test("nearestTerminal: destino sem pontos → null", () => {
  assertEquals(nearestTerminal(-23.4, -46.4, []), null);
});

Deno.test("nearestTerminal: ignora pontos sem geo", () => {
  const pts: TerminalPoint[] = [
    { name: "Sem geo", latitude: null, longitude: null },
    { name: "Terminal 2", latitude: -23.4327, longitude: -46.473 },
  ];
  const n = nearestTerminal(-23.4327, -46.473, pts);
  assertEquals(n?.name, "Terminal 2");
});
