import { describe, expect, it } from "vitest";
import { TokenizeError } from "@/lib/pagarme-tokenize";
import { cardFailureEvent } from "./checkoutTrail";

describe("cardFailureEvent", () => {
  it("tokenização: leva o status e o motivo da Pagar.me", () => {
    const err = new TokenizeError("Não foi possível validar o cartão. Confira os dados.", 401, {
      gateway_message: "Unauthorized",
      fields: [],
    });
    const ev = cardFailureEvent("tokenize", err, { brand: "visa", installments: 3 });
    expect(ev).toEqual({
      kind: "client:card_tokenize_failed",
      httpStatus: 401,
      detail: {
        brand: "visa",
        installments: 3,
        message: "Não foi possível validar o cartão. Confira os dados.",
        gateway_message: "Unauthorized",
        fields: [],
      },
    });
  });

  it("falha de rede na tokenização vira status 0", () => {
    const err = new TokenizeError("Sem conexão", 0, { gateway_message: "Failed to fetch", fields: [] });
    expect(cardFailureEvent("tokenize", err).httpStatus).toBe(0);
  });

  it("recusa da Edge: kind de cobrança, com o status que veio no erro", () => {
    const err = Object.assign(new Error("Cartão recusado. Tente outro cartão."), { httpStatus: 402 });
    const ev = cardFailureEvent("charge", err, { saved_card: false });
    expect(ev.kind).toBe("client:card_charge_failed");
    expect(ev.httpStatus).toBe(402);
    expect(ev.detail.message).toBe("Cartão recusado. Tente outro cartão.");
  });

  it("validação local não tem status", () => {
    const ev = cardFailureEvent("validation", new Error("Validade inválida (use MM/AA)."));
    expect(ev).toMatchObject({ kind: "client:card_validation", httpStatus: null });
  });
});
