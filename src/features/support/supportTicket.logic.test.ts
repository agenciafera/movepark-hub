import { describe, expect, it } from "vitest";
import { kindLabel, openTickets, ticketStatusLine, validateTicket } from "./supportTicket.logic";

describe("validateTicket", () => {
  it("exige motivo da lista e mensagem entre 10 e 2000 caracteres", () => {
    expect(validateTicket("elogio", "mensagem valida aqui")).toBe("Escolha o motivo.");
    expect(validateTicket("complaint", "curta")).toMatch(/pelo menos 10/);
    expect(validateTicket("complaint", "x".repeat(2001))).toMatch(/no máximo 2000/);
    expect(validateTicket("question", "Posso chegar mais cedo do que a reserva?")).toBeNull();
  });
});

describe("ticketStatusLine", () => {
  const fmt = (iso: string) => `[${iso}]`;
  const base = { code: "CH-K7M2PX", kind: "complaint", status: "open", created_at: "c", whatsapp_sent: true, closed_at: null };
  it("diz por onde a resposta chega", () => {
    expect(ticketStatusLine(base, fmt)).toBe("Aberto em [c]. A resposta chega no seu WhatsApp, em horário comercial.");
    expect(ticketStatusLine({ ...base, whatsapp_sent: false }, fmt)).toContain("no seu e-mail");
  });
  it("encerrado mostra quando", () => {
    expect(ticketStatusLine({ ...base, status: "closed", closed_at: "z" }, fmt)).toBe("Encerrado em [z].");
  });
});

describe("kindLabel e openTickets", () => {
  it("rótulos e filtro de abertos", () => {
    expect(kindLabel("complaint")).toBe("Reclamação");
    expect(kindLabel("outro")).toBe("Chamado");
    expect(openTickets([{ status: "open" }, { status: "closed" }])).toHaveLength(1);
    expect(openTickets(undefined)).toEqual([]);
  });
});
