import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { Countdown } from "./Countdown";
import { KEEP_ALIVE_THRESHOLD_SEC, keepAliveState } from "./keepAlive.logic";

const AGORA = new Date("2026-08-10T12:00:00Z");

/** Data de expiração daqui a N segundos. */
function em(segundos: number) {
  return new Date(AGORA.getTime() + segundos * 1000).toISOString();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AGORA);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("Countdown", () => {
  it("sem prazo, não existe barra (reserva já paga não tem hold)", () => {
    const { container } = render(<Countdown expiresAt={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("mostra o tempo restante em mm:ss", () => {
    render(<Countdown expiresAt={em(9 * 60 + 5)} />);
    expect(screen.getByText("09:05")).toBeInTheDocument();
    expect(screen.getByText("Vaga reservada")).toBeInTheDocument();
  });

  it("conta pra baixo a cada segundo", () => {
    render(<Countdown expiresAt={em(600)} />);
    expect(screen.getByText("10:00")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText("09:57")).toBeInTheDocument();
  });

  /** Abaixo de 5 minutos o risco é real, então o rótulo e o tom mudam. */
  it("nos últimos minutos troca o rótulo", () => {
    render(<Countdown expiresAt={em(4 * 60 + 59)} />);
    expect(screen.getByText("Últimos minutos")).toBeInTheDocument();
    expect(screen.queryByText("Vaga reservada")).not.toBeInTheDocument();
  });

  /**
   * O limiar é o mesmo do `keepAliveState`, que mostra o modal com `secsLeft <= 300`.
   * Se a barra virasse em `< 300`, existiria um segundo com o modal pedindo atenção
   * e a barra ainda calma.
   */
  it("vira no mesmo segundo em que o modal 'Ainda está aí?' aparece", () => {
    render(<Countdown expiresAt={em(KEEP_ALIVE_THRESHOLD_SEC)} />);
    expect(screen.getByText("Últimos minutos")).toBeInTheDocument();

    expect(keepAliveState({
      status: "pending",
      expiresAt: em(KEEP_ALIVE_THRESHOLD_SEC),
      createdAt: AGORA.toISOString(),
      nowMs: AGORA.getTime(),
    })).toBe("warning");
  });

  it("um segundo antes do limiar ainda está no tom calmo", () => {
    render(<Countdown expiresAt={em(KEEP_ALIVE_THRESHOLD_SEC + 1)} />);
    expect(screen.getByText("Vaga reservada")).toBeInTheDocument();
  });

  it("ao zerar, avisa que expirou e dispara onExpire uma vez", () => {
    const onExpire = vi.fn();
    render(<Countdown expiresAt={em(2)} onExpire={onExpire} />);

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByText("Sua reserva expirou")).toBeInTheDocument();
    expect(screen.queryByText("Termina em")).not.toBeInTheDocument();
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  /**
   * Regressão: o rótulo inteiro ficava num `aria-live="polite"` que mudava a cada
   * segundo, então o leitor de tela lia a contagem sem parar. Agora só os marcos
   * (últimos minutos e expirou) são falados.
   */
  it("não anuncia a contagem a cada segundo", () => {
    const { container } = render(<Countdown expiresAt={em(600)} />);

    const vivos = container.querySelectorAll("[aria-live]");
    expect(vivos).toHaveLength(1);
    // Com 10 minutos restantes não há marco nenhum: a região fica vazia.
    expect(vivos[0].textContent).toBe("");
    expect(vivos[0]).toHaveClass("sr-only");
    // O número não mora dentro da região viva.
    expect(vivos[0].textContent).not.toContain("10:00");
  });

  it("avisa quem usa leitor de tela quando entra nos últimos minutos", () => {
    const { container } = render(<Countdown expiresAt={em(60)} />);
    expect(container.querySelector("[aria-live]")?.textContent).toMatch(/Menos de 5 minutos/);
  });
});
