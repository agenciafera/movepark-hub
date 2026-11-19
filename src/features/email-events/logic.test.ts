import { describe, expect, it } from "vitest";
import { ehProblema, eventoRotulo, resumoPorDestinatario } from "./logic";

const ev = (recipient: string, event_type: string, occurred_at: string, bounce_type: string | null = null) => ({
  recipient,
  event_type,
  occurred_at,
  bounce_type,
});

describe("eventoRotulo", () => {
  it("dá nome e cor a cada tipo, e trata a devolução temporária como aviso", () => {
    expect(eventoRotulo(ev("a", "delivery", "t"))).toEqual({ label: "Entregue", tone: "confirmed" });
    expect(eventoRotulo(ev("a", "bounce", "t", "Permanent"))).toEqual({ label: "Devolvido", tone: "cancelled" });
    expect(eventoRotulo(ev("a", "bounce", "t", "Transient")).tone).toBe("pending");
    expect(eventoRotulo(ev("a", "complaint", "t")).label).toBe("Marcado como spam");
    expect(eventoRotulo(ev("a", "outro", "t"))).toEqual({ label: "outro", tone: "neutral" });
  });
});

describe("ehProblema", () => {
  it("devolução, reclamação e recusa são problema; entrega e atraso não", () => {
    expect(["bounce", "complaint", "reject"].every(ehProblema)).toBe(true);
    expect(ehProblema("delivery")).toBe(false);
    expect(ehProblema("delivery_delay")).toBe(false);
  });
});

describe("resumoPorDestinatario", () => {
  it("agrupa por destinatário, conta os problemas e ordena pelo mais recente", () => {
    const r = resumoPorDestinatario([
      ev("b@ex.com", "complaint", "2026-11-19T12:00:00Z"),
      ev("a@ex.com", "bounce", "2026-11-19T10:00:00Z", "Permanent"),
      ev("a@ex.com", "bounce", "2026-11-18T10:00:00Z", "Permanent"),
      ev("c@ex.com", "delivery", "2026-11-19T09:00:00Z"),
    ]);
    expect(r.map((x) => [x.recipient, x.problemas])).toEqual([
      ["b@ex.com", 1],
      ["a@ex.com", 2],
    ]);
    expect(r[1].ultimoProblemaEm).toBe("2026-11-19T10:00:00Z");
    expect(r[0].ultimoProblema).toBe("Marcado como spam");
  });

  it("marca quem voltou a receber depois do último problema", () => {
    const r = resumoPorDestinatario([
      ev("a@ex.com", "delivery", "2026-11-20T10:00:00Z"),
      ev("a@ex.com", "bounce", "2026-11-19T10:00:00Z", "Permanent"),
      ev("b@ex.com", "bounce", "2026-11-19T10:00:00Z", "Permanent"),
      ev("b@ex.com", "delivery", "2026-11-18T10:00:00Z"),
    ]);
    expect(Object.fromEntries(r.map((x) => [x.recipient, x.voltouAReceber]))).toEqual({
      "a@ex.com": true,
      "b@ex.com": false,
    });
  });

  it("sem problema, lista vazia", () => {
    expect(resumoPorDestinatario([ev("a@ex.com", "delivery", "t"), ev("a@ex.com", "delivery_delay", "t")])).toEqual([]);
  });
});
