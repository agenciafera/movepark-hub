import { assertEquals } from "jsr:@std/assert";
import { tabelaDosTrechos } from "./logic.ts";

// A base do operador nunca pode cair na tabela que a busca pública lê.
Deno.test("base do operador grava na tabela própria; o resto na pública", () => {
  assertEquals(tabelaDosTrechos("operator_playbook"), "operator_knowledge_chunk");
  for (const t of ["faq", "blog_post", "location_directions", "location_notice", "location_policy", "location_amenity"]) {
    assertEquals(tabelaDosTrechos(t), "knowledge_chunk", t);
  }
});
