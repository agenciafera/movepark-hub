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
  it("usa o WhatsApp da unidade quando há telefone", () => {
    const ch = guaranteeChannel({ unitPhone: "(11) 98888-7777", code: "MP-X", unitName: "GRU" });
    expect(ch.channel).toBe("unit");
    expect(ch.href).toContain("https://wa.me/5511988887777");
    expect(ch.href).toContain("MP-X");
  });

  it("cai no suporte central (e-mail) quando não há telefone nem WhatsApp central", () => {
    // MOVEPARK_SUPPORT.whatsapp vazio por padrão → mailto
    expect(MOVEPARK_SUPPORT.whatsapp).toBe("");
    const ch = guaranteeChannel({ unitPhone: null, code: "MP-Y", unitName: "GRU" });
    expect(ch.channel).toBe("support");
    expect(ch.href.startsWith(`mailto:${MOVEPARK_SUPPORT.email}`)).toBe(true);
    expect(ch.href).toContain("MP-Y");
  });
});
