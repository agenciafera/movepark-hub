import { assertEquals } from "jsr:@std/assert";
import { callerAuthorization } from "./authHeader.ts";

Deno.test("sem header, a busca corre como anon", () => {
  const req = new Request("https://x/search", { method: "POST" });
  assertEquals(callerAuthorization(req, "anon-key"), "Bearer anon-key");
});

Deno.test("com JWT do usuário, o header vai como veio (é o que liga o testador ao rascunho)", () => {
  const req = new Request("https://x/search", {
    method: "POST",
    headers: { Authorization: "Bearer eyJ.user.jwt" },
  });
  assertEquals(callerAuthorization(req, "anon-key"), "Bearer eyJ.user.jwt");
});

Deno.test("header malformado cai na anon key em vez de quebrar a busca", () => {
  const req = new Request("https://x/search", {
    method: "POST",
    headers: { Authorization: "Basic abc" },
  });
  assertEquals(callerAuthorization(req, "anon-key"), "Bearer anon-key");
});
