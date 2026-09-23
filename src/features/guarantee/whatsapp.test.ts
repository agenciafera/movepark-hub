import { describe, expect, it } from "vitest";
import { whatsappHref, guaranteeChannel } from "./whatsapp";
import { guaranteeClaimMessage, MOVEPARK_SUPPORT } from "./copy";

describe("whatsappHref", () => {
  it("já em E.164 passa direto e encoda a mensagem", () => {
    const href = whatsappHref("+55 (11) 98888-7777", "olá mundo & cia");
    expect(href).toBe("https://wa.me/5511988887777?text=ol%C3%A1%20mundo%20%26%20cia");
  });

  it("número local BR (11 dígitos) ganha o prefixo 55", () => {
    expect(whatsappHref("(11) 98888-7777", "x")).toBe("https://wa.me/5511988887777?text=x");
  });

  it("retorna null sem telefone ou sem dígitos", () => {
    expect(whatsappHref(null, "x")).toBeNull();
    expect(whatsappHref("", "x")).toBeNull();
    expect(whatsappHref("---", "x")).toBeNull();
  });
});

describe("guaranteeClaimMessage", () => {
  it("inclui código e unidade", () => {
    const m = guaranteeClaimMessage({ code: "MP-A8K7P2", unitName: "Guarulhos" });
    expect(m).toContain("MP-A8K7P2");
    expect(m).toContain("Guarulhos");
  });

  it("funciona sem nome da unidade", () => {
    const m = guaranteeClaimMessage({ code: "MP-X" });
    expect(m).toContain("MP-X");
  });
});

describe("guaranteeChannel", () => {
  it("vai sempre para o WhatsApp da Movepark, mesmo com telefone da unidade (23/09/2026)", () => {
    const ch = guaranteeChannel({ unitPhone: "(11) 98888-7777", code: "MP-X", unitName: "GRU" });
    expect(ch.channel).toBe("support");
    expect(ch.href).toContain(`https://wa.me/${MOVEPARK_SUPPORT.whatsapp}`);
    expect(ch.href).not.toContain("5511988887777");
    expect(ch.href).toContain("MP-X");
  });

  it("o WhatsApp central vem da fonte única e não está vazio", () => {
    expect(MOVEPARK_SUPPORT.whatsapp).toBe("5511994752952");
  });
});
