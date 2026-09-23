import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { accessUrl, parseCreateInput } from "./logic.ts";

const ID = "e7c87c78-9b76-48e1-8cf7-395e7e5aec67";

Deno.test("parseCreateInput: normaliza o e-mail e aceita o uuid", () => {
  const r = parseCreateInput({ company_id: ID, email: "  Dono@BePark.com.br " });
  assertEquals(r, { ok: true, input: { company_id: ID, email: "dono@bepark.com.br" } });
});

Deno.test("parseCreateInput: recusa company_id ausente ou fora do formato", () => {
  assertEquals(parseCreateInput({ email: "a@b.co" }).ok, false);
  assertEquals(parseCreateInput({ company_id: "123", email: "a@b.co" }).ok, false);
});

Deno.test("parseCreateInput: recusa e-mail inválido", () => {
  const r = parseCreateInput({ company_id: ID, email: "sem-arroba" });
  assertEquals(r, { ok: false, error: "E-mail inválido." });
});

Deno.test("accessUrl: segredo no caminho, sem barra dupla", () => {
  assertEquals(accessUrl("https://movepark.co/", "abc"), "https://movepark.co/acesso/abc");
  assertEquals(accessUrl("https://movepark.co", "abc"), "https://movepark.co/acesso/abc");
});
