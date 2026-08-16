import { assertEquals } from "jsr:@std/assert";
import { channelsFor, isValidToken, normalizeChannel, patchFor } from "./logic.ts";

Deno.test("isValidToken aceita uuid e recusa o resto", () => {
  assertEquals(isValidToken("3f2504e0-4f89-41d3-9a0c-0305e82c3301"), true);
  assertEquals(isValidToken("3F2504E0-4F89-41D3-9A0C-0305E82C3301"), true);
  assertEquals(isValidToken(""), false);
  assertEquals(isValidToken("   "), false);
  assertEquals(isValidToken("nao-e-uuid"), false);
  assertEquals(isValidToken(null), false);
  assertEquals(isValidToken(undefined), false);
  assertEquals(isValidToken(12345), false);
});

Deno.test("isValidToken não aceita e-mail no lugar do token", () => {
  // O ponto do token aleatório: com e-mail cru, qualquer um descadastraria qualquer pessoa
  // só sabendo o endereço.
  assertEquals(isValidToken("maria@exemplo.com"), false);
});

Deno.test("normalizeChannel cai em 'all' para valor desconhecido", () => {
  assertEquals(normalizeChannel("email"), "email");
  assertEquals(normalizeChannel("whatsapp"), "whatsapp");
  assertEquals(normalizeChannel("sms"), "all");
  assertEquals(normalizeChannel(undefined), "all");
});

Deno.test("sair de tudo desliga os dois canais e carimba a data", () => {
  const agora = "2026-08-16T12:00:00.000Z";
  assertEquals(patchFor("all", agora), {
    email_consent: false,
    whatsapp_consent: false,
    unsubscribed_at: agora,
  });
});

Deno.test("sair só de um canal NÃO carimba unsubscribed_at", () => {
  // Regressão: carimbar aqui faria a matrícula de campanha (que filtra por unsubscribed_at)
  // excluir quem saiu só do WhatsApp mas ainda aceita e-mail.
  const agora = "2026-08-16T12:00:00.000Z";
  assertEquals(patchFor("email", agora), { email_consent: false });
  assertEquals(patchFor("whatsapp", agora), { whatsapp_consent: false });
});

Deno.test("a supressão cobre os canais certos", () => {
  assertEquals(channelsFor("all"), ["email", "whatsapp"]);
  assertEquals(channelsFor("email"), ["email"]);
  assertEquals(channelsFor("whatsapp"), ["whatsapp"]);
});
