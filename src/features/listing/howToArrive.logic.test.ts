import { describe, expect, it } from "vitest";
import { formatShuttle } from "./howToArrive.logic";

describe("formatShuttle — linha de traslado (PRD-11)", () => {
  it("compõe frequência + tempo até o terminal", () => {
    expect(formatShuttle({ frequencyMinutes: 15, toTerminalMinutes: 6 })).toBe(
      "a cada 15 min · ~6 min ao terminal",
    );
  });

  it("usa só a frequência quando o tempo não foi informado", () => {
    expect(formatShuttle({ frequencyMinutes: 20, toTerminalMinutes: null })).toBe("a cada 20 min");
  });

  it("usa só o tempo quando a frequência não foi informada", () => {
    expect(formatShuttle({ frequencyMinutes: null, toTerminalMinutes: 4 })).toBe(
      "~4 min ao terminal",
    );
  });

  it("retorna null quando nada foi informado", () => {
    expect(formatShuttle({ frequencyMinutes: null, toTerminalMinutes: null })).toBeNull();
  });

  it("ignora valores não-positivos (0/negativo não fazem sentido operacional)", () => {
    expect(formatShuttle({ frequencyMinutes: 0, toTerminalMinutes: -3 })).toBeNull();
  });
});
