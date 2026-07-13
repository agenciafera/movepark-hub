import { assertEquals } from "jsr:@std/assert";
import {
  buildBodyComponents,
  buildComponents,
  toWhatsAppNumber,
  whatsappConfigFromEnv,
} from "./whatsapp.ts";

Deno.test("whatsappConfigFromEnv: null sem phone id/token", () => {
  assertEquals(whatsappConfigFromEnv(() => undefined), null);
  assertEquals(whatsappConfigFromEnv((k) => (k === "WHATSAPP_OFFICIAL_TOKEN" ? "t" : undefined)), null);
});

Deno.test("whatsappConfigFromEnv: monta com defaults de versão/idioma", () => {
  const env: Record<string, string> = {
    WHATSAPP_OFFICIAL_PHONE_NUMBER_ID: "123",
    WHATSAPP_OFFICIAL_TOKEN: "tok",
  };
  const cfg = whatsappConfigFromEnv((k) => env[k]);
  assertEquals(cfg, { phoneNumberId: "123", accessToken: "tok", apiVersion: "v21.0", language: "pt_BR" });
});

Deno.test("buildBodyComponents: vazio → sem body; com params → na ordem", () => {
  assertEquals(buildBodyComponents([]), []);
  assertEquals(buildBodyComponents(["Ana", "MP-AB12"]), [
    { type: "body", parameters: [{ type: "text", text: "Ana" }, { type: "text", text: "MP-AB12" }] },
  ]);
});

Deno.test("toWhatsAppNumber: normaliza pra 55DDDNUMERO; rejeita curto", () => {
  assertEquals(toWhatsAppNumber("(11) 99999-9999"), "5511999999999");
  assertEquals(toWhatsAppNumber("5511999999999"), "5511999999999");
  assertEquals(toWhatsAppNumber("11999"), null);
  assertEquals(toWhatsAppNumber(null), null);
});

Deno.test("buildComponents: sem params de botão → só o body (template de utilidade)", () => {
  assertEquals(buildComponents(["Ana", "MP-AB12"]), [
    { type: "body", parameters: [{ type: "text", text: "Ana" }, { type: "text", text: "MP-AB12" }] },
  ]);
});

// Regressão: o template de OTP tem botão de copiar código e a Meta recusa o envio sem o parâmetro
// dele (131008). Foi o que derrubava o pedido de código do attach-identifier.
Deno.test("buildComponents: com param de botão → body + botão url no índice 0", () => {
  assertEquals(buildComponents(["123456"], ["123456"]), [
    { type: "body", parameters: [{ type: "text", text: "123456" }] },
    { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "123456" }] },
  ]);
});
