import { assertEquals } from "jsr:@std/assert";
import {
  aggregateDestinations,
  aggregateOperators,
  filterByDestinations,
  filterByOperators,
  type FacetItem,
} from "./facets.ts";

const gru = { code: "GRU", name: "Guarulhos", type: "airport" };
const cgh = { code: "CGH", name: "Congonhas", type: "airport" };

const items: FacetItem[] = [
  { operator: { slug: "aerovalet", name: "AeroValet" }, destination: gru },
  { operator: { slug: "aerovalet", name: "AeroValet" }, destination: cgh },
  { operator: { slug: "plenty", name: "Plenty" }, destination: gru },
  { operator: { slug: "zaz", name: "ZAZ" }, destination: null },
];

Deno.test("aggregateOperators conta e ordena por nome", () => {
  const f = aggregateOperators(items);
  assertEquals(f.map((o) => o.slug), ["aerovalet", "plenty", "zaz"]);
  assertEquals(f.find((o) => o.slug === "aerovalet")?.count, 2);
  assertEquals(f.find((o) => o.slug === "plenty")?.count, 1);
});

Deno.test("aggregateDestinations conta, ignora null e ordena por nome", () => {
  const f = aggregateDestinations(items);
  assertEquals(f.map((d) => d.code), ["CGH", "GRU"]);
  assertEquals(f.find((d) => d.code === "GRU")?.count, 2);
  assertEquals(f.find((d) => d.code === "GRU")?.type, "airport");
});

Deno.test("filterByOperators é no-op quando vazio e filtra quando há slugs", () => {
  assertEquals(filterByOperators(items).length, 4);
  assertEquals(filterByOperators(items, []).length, 4);
  assertEquals(filterByOperators(items, ["plenty"]).length, 1);
});

Deno.test("filterByDestinations filtra por code e descarta null", () => {
  assertEquals(filterByDestinations(items, ["GRU"]).length, 2);
  assertEquals(filterByDestinations(items, ["GRU", "CGH"]).length, 3);
  // 'zaz' (destination null) nunca passa por um filtro de destino
  assertEquals(
    filterByDestinations(items, ["GRU"]).every((i) => i.operator.slug !== "zaz"),
    true,
  );
});

Deno.test("facetas independem do próprio eixo: estacionamento reflete destino escolhido", () => {
  // Filtro de destino = GRU → estacionamentos disponíveis devem ser só aerovalet + plenty
  const ops = aggregateOperators(filterByDestinations(items, ["GRU"]));
  assertEquals(ops.map((o) => o.slug), ["aerovalet", "plenty"]);
});
