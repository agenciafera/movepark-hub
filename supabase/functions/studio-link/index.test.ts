// Testes de branch da Edge studio-link. Nenhum toca no banco nem revela o token.
import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { handler } from "./index.ts";

const URL = "http://localhost/functions/v1/studio-link";

Deno.test("OPTIONS responde 200 com CORS", async () => {
  const res = await handler(new Request(URL, { method: "OPTIONS" }));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
});

Deno.test("método diferente de GET é 405", async () => {
  const res = await handler(new Request(URL, { method: "POST" }));
  assertEquals(res.status, 405);
});

Deno.test("sem Authorization é 401, e não vaza o token", async () => {
  // A checagem do header vem ANTES de ler o segredo do ambiente. Se um dia inverter,
  // uma requisição anônima passaria a receber a URL com o token dentro.
  Deno.env.set("MASTRA_ADMIN_TOKEN", "mk_segredo_de_teste");
  Deno.env.set("MASTRA_STUDIO_URL", "https://studio.exemplo");

  const res = await handler(new Request(URL, { method: "GET" }));
  assertEquals(res.status, 401);

  const corpo = await res.text();
  assertEquals(corpo.includes("mk_segredo_de_teste"), false);
  assertStringIncludes(corpo, "token de sessão");
});
