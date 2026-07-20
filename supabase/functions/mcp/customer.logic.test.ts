import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  CUSTOMER_AUTH_TOOLS,
  isOtpChannel,
  otpRequestParams,
  otpVerifyParams,
} from "./customer.logic.ts";

Deno.test("isOtpChannel: só whatsapp e email", () => {
  assertEquals(isOtpChannel("whatsapp"), true);
  assertEquals(isOtpChannel("email"), true);
  assertEquals(isOtpChannel("sms"), false);
  assertEquals(isOtpChannel(""), false);
  assertEquals(isOtpChannel(undefined), false);
});

Deno.test("otpRequestParams: whatsapp manda phone + channel whatsapp", () => {
  assertEquals(otpRequestParams("whatsapp", "+5511987654321"), {
    phone: "+5511987654321",
    options: { shouldCreateUser: true, channel: "whatsapp" },
  });
});

Deno.test("otpRequestParams: email manda email", () => {
  assertEquals(otpRequestParams("email", "a@b.com"), {
    email: "a@b.com",
    options: { shouldCreateUser: true },
  });
});

Deno.test("otpRequestParams: trima o identificador", () => {
  const p = otpRequestParams("email", "  a@b.com  ") as { email: string };
  assertEquals(p.email, "a@b.com");
});

Deno.test("otpRequestParams: canal inválido e identificador vazio lançam", () => {
  assertThrows(() => otpRequestParams("sms", "x"), Error, "Canal inválido");
  assertThrows(() => otpRequestParams("email", "   "), Error, "obrigatório");
});

Deno.test("otpVerifyParams: whatsapp verifica com type sms", () => {
  assertEquals(otpVerifyParams("whatsapp", "+5511987654321", "123456"), {
    phone: "+5511987654321",
    token: "123456",
    type: "sms",
  });
});

Deno.test("otpVerifyParams: email verifica com type email", () => {
  assertEquals(otpVerifyParams("email", "a@b.com", "123456"), {
    email: "a@b.com",
    token: "123456",
    type: "email",
  });
});

Deno.test("otpVerifyParams: código ausente lança", () => {
  assertThrows(() => otpVerifyParams("email", "a@b.com", ""), Error, "Código");
});

Deno.test("CUSTOMER_AUTH_TOOLS: nomes esperados e schema fechado", () => {
  assertEquals(CUSTOMER_AUTH_TOOLS.map((t) => t.name).sort(), [
    "request_login_otp",
    "verify_login_otp",
    "whoami",
  ]);
  for (const t of CUSTOMER_AUTH_TOOLS) {
    assertEquals(t.inputSchema.additionalProperties, false, t.name);
    assertEquals((t as { scope?: string }).scope, undefined, `${t.name} não tem scope`);
  }
});
