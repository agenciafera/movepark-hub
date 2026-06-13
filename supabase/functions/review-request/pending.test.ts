import { assertEquals } from "jsr:@std/assert";
import { pendingReviewRequests } from "./pending.ts";

Deno.test("mantém reservas sem avaliação (array vazio, null ou ausente)", () => {
  const rows = [
    { id: "a", review: [] },
    { id: "b", review: null },
    { id: "c" },
  ];
  assertEquals(pendingReviewRequests(rows).map((r) => r.id), ["a", "b", "c"]);
});

Deno.test("exclui reservas que já têm avaliação", () => {
  const rows = [
    { id: "a", review: [{ id: "rev-1" }] },
    { id: "b", review: [] },
  ];
  assertEquals(pendingReviewRequests(rows).map((r) => r.id), ["b"]);
});

Deno.test("entrada nula/indefinida → lista vazia", () => {
  assertEquals(pendingReviewRequests(null), []);
  assertEquals(pendingReviewRequests(undefined), []);
});
