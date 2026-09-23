import { describe, expect, it } from "vitest";
import {
  FREE_CANCEL_WINDOW_HOURS,
  cancellationStatus,
  customerSelfCancel,
  freeCancelDeadlineLabel,
} from "./cancellation.logic";

const NOW = new Date("2026-06-10T00:00:00Z");
const h = (n: number) => new Date(NOW.getTime() + n * 3600_000).toISOString();

describe("cancellationStatus", () => {
  // 23/09/2026: a janela é sempre a gravada na reserva (fareCancelUntil). Sem ela, não há grátis.
  const janela24h = (checkIn: string) => new Date(new Date(checkIn).getTime() - 24 * 3600_000).toISOString();

  it("grátis quando faltam mais de 24h, com a janela de 24h da reserva", () => {
    expect(cancellationStatus(h(48), NOW, janela24h(h(48))).free).toBe(true);
  });

  it("não-grátis quando faltam menos de 24h", () => {
    expect(cancellationStatus(h(23), NOW, janela24h(h(23))).free).toBe(false);
  });

  it("fronteira: exatamente 24h ainda é grátis", () => {
    const checkIn = h(FREE_CANCEL_WINDOW_HOURS);
    expect(cancellationStatus(checkIn, NOW, janela24h(checkIn)).free).toBe(true);
  });

  it("sem janela gravada (tarifa sem cancelamento grátis): nunca é grátis e o prazo é nulo", () => {
    const r = cancellationStatus(h(48), NOW);
    expect(r.free).toBe(false);
    expect(r.deadline).toBeNull();
  });

  it("Tarifa (E2.8): a Superflex é grátis a 2h do check-in porque a janela dela é de 1 min", () => {
    const checkIn = h(2);
    const superflexUntil = h(2 - 1 / 60); // 1 min antes do check-in
    expect(cancellationStatus(checkIn, NOW, janela24h(checkIn)).free).toBe(false); // Básica/Flex
    expect(cancellationStatus(checkIn, NOW, superflexUntil).free).toBe(true); // Superflex
    const passed = h(-1); // prazo já passou
    expect(cancellationStatus(checkIn, NOW, passed).deadline?.getTime()).toBe(new Date(passed).getTime());
  });
});

describe("customerSelfCancel", () => {
  it("pending → sempre pode (hold não pago), sem estorno", () => {
    const gate = customerSelfCancel("pending", h(2), NOW);
    expect(gate).toEqual({ allowed: true, free: false });
  });

  it("confirmed dentro da janela → pode, com estorno", () => {
    const gate = customerSelfCancel("confirmed", h(48), NOW, h(24));
    expect(gate).toEqual({ allowed: true, free: true });
  });

  it("confirmed fora da janela → BLOQUEADO (window_closed)", () => {
    const gate = customerSelfCancel("confirmed", h(2), NOW);
    expect(gate).toEqual({ allowed: false, reason: "window_closed" });
  });

  it("confirmed fora do padrão mas Superflex (1 min) → pode, com estorno", () => {
    const checkIn = h(2);
    const superflexUntil = h(2 - 1 / 60);
    expect(customerSelfCancel("confirmed", checkIn, NOW, superflexUntil)).toEqual({
      allowed: true,
      free: true,
    });
  });

  it("estados terminais → não cancela", () => {
    for (const s of ["checked_in", "completed", "cancelled", "no_show"]) {
      expect(customerSelfCancel(s, h(48), NOW)).toEqual({ allowed: false, reason: "terminal" });
    }
  });
});

describe("freeCancelDeadlineLabel", () => {
  it("rotula o prazo concreto", () => {
    const label = freeCancelDeadlineLabel(h(48), h(24));
    expect(label.startsWith("Cancele grátis até ")).toBe(true);
    expect(label).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });
  it("sem janela, diz que a tarifa não tem cancelamento grátis", () => {
    expect(freeCancelDeadlineLabel(h(48), null)).toBe("Esta tarifa não tem cancelamento grátis");
  });
});
