import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { accountEmail, parseLoginLinkInput } from "./logic.ts";

const ID = "e7c87c78-9b76-48e1-8cf7-395e7e5aec67";

Deno.test("parseLoginLinkInput: aceita uuid e lê send_email", () => {
  assertEquals(parseLoginLinkInput({ user_id: ID }), { ok: true, input: { user_id: ID, send_email: false } });
  assertEquals(parseLoginLinkInput({ user_id: ID, send_email: true }), {
    ok: true,
    input: { user_id: ID, send_email: true },
  });
});

Deno.test("parseLoginLinkInput: só true liga o envio (string 'true' não vale)", () => {
  assertEquals(parseLoginLinkInput({ user_id: ID, send_email: "true" }), {
    ok: true,
    input: { user_id: ID, send_email: false },
  });
});

Deno.test("parseLoginLinkInput: recusa user_id ausente ou fora do formato", () => {
  assertEquals(parseLoginLinkInput({}).ok, false);
  assertEquals(parseLoginLinkInput({ user_id: "123" }).ok, false);
  assertEquals(parseLoginLinkInput(null).ok, false);
});

Deno.test("accountEmail: normaliza e recusa conta sem e-mail", () => {
  assertEquals(accountEmail("  Ana@Movepark.co "), "ana@movepark.co");
  assertEquals(accountEmail(null), null);
  assertEquals(accountEmail(""), null);
});
