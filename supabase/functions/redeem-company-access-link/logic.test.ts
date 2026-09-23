import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { NEXT_PATH, parseSecret, refusal } from "./logic.ts";

Deno.test("parseSecret: aceita segredo com folga de espaços", () => {
  assertEquals(parseSecret({ token: "  ABCDEFGHIJKLMNOPQRSTUVWXYZ012345 " }), "ABCDEFGHIJKLMNOPQRSTUVWXYZ012345");
});

Deno.test("parseSecret: recusa vazio, curto ou não-string", () => {
  assertEquals(parseSecret({}), null);
  assertEquals(parseSecret({ token: "curto" }), null);
  assertEquals(parseSecret({ token: 42 }), null);
  assertEquals(parseSecret(null), null);
});

Deno.test("refusal: 'done' e qualquer outro motivo respondem 410 com o texto certo", () => {
  assertEquals(refusal("done").status, 410);
  assertEquals(refusal("done").body.reason, "done");
  assertEquals(refusal("invalid").body.reason, "invalid");
  assertEquals(refusal(undefined).body.reason, "invalid");
});

Deno.test("NEXT_PATH: o dono cai no Recebimento", () => {
  assertEquals(NEXT_PATH, "/operator/recebimento");
});
