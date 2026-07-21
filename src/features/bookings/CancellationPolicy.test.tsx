import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CancellationPolicy } from "./CancellationPolicy";
import {
  cancellationPolicyLines,
  cancelWindowPhrase,
  CANCELLATION_POLICY_LINES_GENERIC,
} from "./cancellation.logic";

/**
 * C-23 do roteiro do consumidor: a copy da política de cancelamento bate com a tarifa contratada.
 *
 * Antes, `CANCELLATION_POLICY_LINES` era texto fixo em 24 horas, e quem pagava R$ 24,90 pela
 * Superflex (cancela até 1 minuto antes) lia na tela que tinha 24 horas. O defeito era de copy, não
 * de gate: o cancelamento sempre respeitou a janela real via `booking.fare_cancel_until` (C-19, C-20
 * e C-21). Agora a copy também. https://app.clickup.com/t/86ajmwhg5
 */

const CHECK_IN = "2026-08-01T12:00:00Z";
const SUPERFLEX_CANCEL_UNTIL = "2026-08-01T11:59:00Z"; // 1 minuto antes
const BASICA_CANCEL_UNTIL = "2026-07-31T12:00:00Z"; // 24 horas antes

describe("cancelWindowPhrase", () => {
  it("rende 1440 min como 24 horas e 1 min como 1 minuto", () => {
    expect(cancelWindowPhrase(1440)).toBe("24 horas");
    expect(cancelWindowPhrase(60)).toBe("1 hora");
    expect(cancelWindowPhrase(1)).toBe("1 minuto");
    expect(cancelWindowPhrase(30)).toBe("30 minutos");
  });
});

describe("cancellationPolicyLines", () => {
  it("sem tarifa escolhida, usa o texto genérico das três tarifas", () => {
    expect(cancellationPolicyLines()).toEqual(CANCELLATION_POLICY_LINES_GENERIC);
    expect(cancellationPolicyLines(CHECK_IN, null)).toEqual(CANCELLATION_POLICY_LINES_GENERIC);
  });

  it("na Superflex, o prazo é 1 minuto, não 24 horas", () => {
    const lines = cancellationPolicyLines(CHECK_IN, SUPERFLEX_CANCEL_UNTIL);
    expect(lines.join(" ")).toMatch(/1 minuto antes/);
    expect(lines.join(" ")).not.toMatch(/24 horas/);
  });

  it("na Básica, o prazo é 24 horas", () => {
    const lines = cancellationPolicyLines(CHECK_IN, BASICA_CANCEL_UNTIL);
    expect(lines.join(" ")).toMatch(/24 horas antes/);
  });
});

describe("CancellationPolicy", () => {
  it("mostra o prazo concreto vindo da tarifa", () => {
    render(<CancellationPolicy checkInAt={CHECK_IN} fareCancelUntil={SUPERFLEX_CANCEL_UNTIL} />);
    expect(screen.getByText(/Cancele grátis até/)).toBeInTheDocument();
    expect(screen.getByText(/01\/08\/2026/)).toBeInTheDocument();
  });

  it("C-23: na Superflex, a política diz 1 minuto, não 24 horas", () => {
    render(<CancellationPolicy checkInAt={CHECK_IN} fareCancelUntil={SUPERFLEX_CANCEL_UNTIL} />);
    expect(screen.getByText(/1 minuto antes/)).toBeInTheDocument();
    expect(screen.queryByText(/24 horas/)).not.toBeInTheDocument();
  });

  it("C-23: na Básica, a política continua dizendo 24 horas", () => {
    render(<CancellationPolicy checkInAt={CHECK_IN} fareCancelUntil={BASICA_CANCEL_UNTIL} />);
    expect(screen.getByText(/24 horas antes/)).toBeInTheDocument();
  });
});
