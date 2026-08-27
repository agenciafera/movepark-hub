import { assertEquals } from "jsr:@std/assert";
import { handler, tokenValido } from "./index.ts";

const URL_ = "http://localhost/conversa-publica";

Deno.test("OPTIONS devolve CORS", async () => {
  const res = await handler(new Request(URL_, { method: "OPTIONS" }));
  assertEquals(res.status, 200);
});

Deno.test("metodo diferente de POST e recusado", async () => {
  assertEquals((await handler(new Request(URL_, { method: "GET" }))).status, 405);
});

// A forma do token e' fixa. Conferir antes evita mandar lixo ao upstream e evita que
// um valor estranho vire consulta.
Deno.test("token fora do formato e recusado", () => {
  assertEquals(tokenValido("a".repeat(64)), true);
  assertEquals(tokenValido("A".repeat(64)), false); // maiuscula nao
  assertEquals(tokenValido("a".repeat(63)), false);
  assertEquals(tokenValido("a".repeat(65)), false);
  assertEquals(tokenValido("' or 1=1 --"), false);
  assertEquals(tokenValido(""), false);
  assertEquals(tokenValido(null), false);
});

Deno.test("token invalido para em 400, sem tocar no upstream", async () => {
  Deno.env.set("MASTRA_ADMIN_TOKEN", "mk_segredo_de_teste");
  Deno.env.set("MASTRA_BASE_URL", "https://beast-bots.exemplo");
  const res = await handler(
    new Request(URL_, { method: "POST", body: JSON.stringify({ token: "curto" }) }),
  );
  assertEquals(res.status, 400);
  // O segredo nunca aparece na resposta.
  assertEquals((await res.text()).includes("mk_segredo_de_teste"), false);
});
