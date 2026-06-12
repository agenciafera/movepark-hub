import { describe, expect, it } from "vitest";
import {
  FREE_CANCEL_WINDOW_HOURS,
  cancellationStatus,
  freeCancelDeadlineLabel,
} from "./cancellation.logic";

const NOW = new Date("2026-06-10T00:00:00Z");
const h = (n: number) => new Date(NOW.getTime() + n * 3600_000).toISOString();

describe("cancellationStatus", () => {
  it("grátis quando faltam mais de 24h", () => {
    expect(cancellationStatus(h(48), NOW).free).toBe(true);
  });

  it("não-grátis quando faltam menos de 24h", () => {
    expect(cancellationStatus(h(23), NOW).free).toBe(false);
  });

  it("fronteira: exatamente 24h ainda é grátis", () => {
    expect(cancellationStatus(h(FREE_CANCEL_WINDOW_HOURS), NOW).free).toBe(true);
  });

  it("deadline = check_in − 24h", () => {
    const checkIn = h(48);
    const { deadline } = cancellationStatus(checkIn, NOW);
    expect(deadline.getTime()).toBe(new Date(checkIn).getTime() - 24 * 3600_000);
  });
});

describe("freeCancelDeadlineLabel", () => {
  it("rotula o prazo concreto", () => {
    const label = freeCancelDeadlineLabel(h(48));
    expect(label.startsWith("Cancele grátis até ")).toBe(true);
    expect(label).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });
});
