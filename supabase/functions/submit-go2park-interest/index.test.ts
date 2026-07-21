// Testes de branch da Edge submit-go2park-interest (validação, sem tocar no banco).
import { assertEquals } from "jsr:@std/assert";
import { handler } from "./index.ts";

const URL = "http://localhost/functions/v1/submit-go2park-interest";

Deno.test("OPTIONS responde 200 com CORS", async () => {
  const res = await handler(new Request(URL, { method: "OPTIONS" }));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
});

Deno.test("método diferente de POST é 405", async () => {
  const res = await handler(new Request(URL, { method: "GET" }));
  assertEquals(res.status, 405);
});

Deno.test("sem Authorization é 401", async () => {
  const res = await handler(
    new Request(URL, { method: "POST", body: JSON.stringify({ company_id: "x" }) }),
  );
  assertEquals(res.status, 401);
});
