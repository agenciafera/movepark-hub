import { describe, expect, it } from "vitest";
import { partnerApproveMessage, partnerResendMessage } from "./partnerActionMessages";

describe("partnerApproveMessage", () => {
  it("confirma sucesso quando o e-mail saiu", () => {
    const m = partnerApproveMessage({ emailSent: true });
    expect(m.ok).toBe(true);
    expect(m.text).toContain("Convite enviado");
  });

  it("avisa que o e-mail não saiu e inclui o erro", () => {
    const m = partnerApproveMessage({ emailSent: false, emailError: "SMTP não configurado" });
    expect(m.ok).toBe(false);
    expect(m.text).toContain("e-mail não saiu");
    expect(m.text).toContain("SMTP não configurado");
  });

  it("avisa sem erro quando não há detalhe", () => {
    const m = partnerApproveMessage({ emailSent: false });
    expect(m.ok).toBe(false);
    expect(m.text.endsWith(".")).toBe(true);
  });
});

describe("partnerResendMessage", () => {
  it("confirma reenvio quando o e-mail saiu", () => {
    const m = partnerResendMessage({ emailSent: true });
    expect(m.ok).toBe(true);
    expect(m.text).toContain("reenviado");
  });

  it("reporta falha real do envio no reenvio", () => {
    const m = partnerResendMessage({ emailSent: false, emailError: "connection refused" });
    expect(m.ok).toBe(false);
    expect(m.text).toContain("E-mail não enviado");
    expect(m.text).toContain("connection refused");
  });
});
