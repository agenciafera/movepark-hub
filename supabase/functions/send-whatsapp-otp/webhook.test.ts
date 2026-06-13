import { assert, assertEquals, assertFalse } from "jsr:@std/assert";
import {
  b64ToBytes,
  buildTemplateComponents,
  bytesToB64,
  extractOtp,
  parseSecret,
  signStandardWebhook,
  timestampWithinWindow,
  verifyStandardWebhook,
} from "./webhook.ts";

const KEY = "c2VjcmV0LWtleS0xMjM0NTY3ODkw"; // base64 de "secret-key-1234567890"

Deno.test("b64 roundtrip", () => {
  const bytes = new Uint8Array([0, 1, 2, 250, 255]);
  assertEquals([...b64ToBytes(bytesToB64(bytes))], [...bytes]);
});

Deno.test("parseSecret tira prefixos v1, e whsec_", () => {
  const a = parseSecret(KEY);
  const b = parseSecret(`v1,whsec_${KEY}`);
  const c = parseSecret(`v1,whsec_${KEY} v1,whsec_outra`); // múltiplas → pega a 1ª
  assertEquals([...a], [...b]);
  assertEquals([...a], [...c]);
});

Deno.test("verifyStandardWebhook aceita assinatura válida", async () => {
  const key = parseSecret(KEY);
  const id = "msg_1", ts = "1700000000", body = '{"hello":"world"}';
  const sig = await signStandardWebhook(key, id, ts, body);
  assert(await verifyStandardWebhook(key, id, ts, body, `v1,${sig}`));
});

Deno.test("verifyStandardWebhook rejeita corpo adulterado", async () => {
  const key = parseSecret(KEY);
  const id = "msg_1", ts = "1700000000";
  const sig = await signStandardWebhook(key, id, ts, '{"hello":"world"}');
  assertFalse(await verifyStandardWebhook(key, id, ts, '{"hello":"TAMPERED"}', `v1,${sig}`));
});

Deno.test("verifyStandardWebhook aceita uma de várias assinaturas no header", async () => {
  const key = parseSecret(KEY);
  const id = "msg_1", ts = "1700000000", body = "x";
  const sig = await signStandardWebhook(key, id, ts, body);
  assert(await verifyStandardWebhook(key, id, ts, body, `v1,assinatura-errada v1,${sig}`));
});

Deno.test("timestampWithinWindow: dentro/fora da janela de 5min e não-numérico", () => {
  const now = 1700000000;
  assert(timestampWithinWindow(String(now), now));
  assert(timestampWithinWindow(String(now - 299), now));
  assertFalse(timestampWithinWindow(String(now - 301), now));
  assertFalse(timestampWithinWindow("abc", now));
});

Deno.test("extractOtp normaliza telefone (só dígitos) e exige phone+otp", () => {
  assertEquals(extractOtp({ user: { phone: "+55 (11) 99999-0000" }, sms: { otp: "123456" } }), {
    phone: "5511999990000",
    otp: "123456",
  });
  assertEquals(extractOtp({ user: { phone: "" }, sms: { otp: "123456" } }), null);
  assertEquals(extractOtp({ user: { phone: "5511999990000" }, sms: {} }), null);
  assertEquals(extractOtp({}), null);
});

Deno.test("buildTemplateComponents: body sempre; botão url só quando habilitado", () => {
  const semBotao = buildTemplateComponents("123456", false);
  assertEquals(semBotao.length, 1);
  assertEquals(semBotao[0].type, "body");

  const comBotao = buildTemplateComponents("123456", true);
  assertEquals(comBotao.length, 2);
  assertEquals(comBotao[1].type, "button");
});
