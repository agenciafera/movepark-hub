import { describe, expect, it } from "vitest";
import {
  type CartaoDeAcao,
  codigoDaPagina,
  juntarCartoes,
  podeConfirmar,
  rotuloDoEfeito,
  rotuloDoStatus,
  sugestoes,
} from "./operatorAssistant.logic";

const AGORA = new Date("2026-11-17T12:00:00Z");
const cartao = (over: Partial<CartaoDeAcao> = {}): CartaoDeAcao => ({
  id: "a1",
  kind: "cancel",
  summary: "Cancelar a reserva MP-ABC123 e estornar R$ 200,00 ao cliente.",
  effect_cents: -20000,
  status: "proposed",
  expires_at: "2026-11-17T12:05:00Z",
  result: null,
  error: null,
  booking_code: "MP-ABC123",
  ...over,
});

describe("bolinha da Mia para operadores", () => {
  it("lê o código da reserva aberta na tela", () => {
    expect(codigoDaPagina("/operator/bookings/MP-ABC123")).toBe("MP-ABC123");
    expect(codigoDaPagina("/operator/bookings/mp-abc123/")).toBe("MP-ABC123");
    expect(codigoDaPagina("/operator/bookings")).toBeNull();
    expect(codigoDaPagina("/manager/bookings/MP-ABC123")).toBeNull();
  });

  it("diz o dinheiro no sentido do cliente", () => {
    expect(rotuloDoEfeito(-8000)).toBe("Estorno de R$ 80,00 ao cliente");
    expect(rotuloDoEfeito(5000)).toBe("Cliente paga R$ 50,00 por PIX");
    expect(rotuloDoEfeito(null)).toBe("Sem dinheiro envolvido");
  });

  it("só oferece Confirmar enquanto a proposta vive", () => {
    expect(podeConfirmar(cartao(), AGORA)).toBe(true);
    expect(podeConfirmar(cartao(), new Date("2026-11-17T12:06:00Z"))).toBe(false);
    expect(podeConfirmar(cartao({ status: "executed" }), AGORA)).toBe(false);
    expect(rotuloDoStatus(cartao(), new Date("2026-11-17T12:06:00Z"))).toContain("vencida");
    expect(rotuloDoStatus(cartao({ status: "executed", result: { resumo: "Reserva cancelada." } }), AGORA)).toBe("Reserva cancelada.");
    expect(rotuloDoStatus(cartao({ status: "failed", error: "sem saldo" }), AGORA)).toContain("sem saldo");
  });

  it("na tela de uma reserva, a primeira sugestão é sobre ela", () => {
    expect(sugestoes("MP-ABC123")[0]).toContain("MP-ABC123");
    expect(sugestoes(null)).toHaveLength(3);
  });

  it("junta cartões sem duplicar", () => {
    const m = juntarCartoes({ a1: cartao() }, [cartao({ status: "executed" }), cartao({ id: "a2" })]);
    expect(Object.keys(m).sort()).toEqual(["a1", "a2"]);
    expect(m.a1.status).toBe("executed");
  });
});
