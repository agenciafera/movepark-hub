import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { HowToArrive } from "./HowToArrive";

const base = {
  address: "Rua Padre Celestino Pavan, 100",
  latitude: -23.43,
  longitude: -46.47,
  notice: null,
  hasNotice: false,
  directionsText: null,
  shuttleFrequencyMinutes: null,
  shuttleToTerminalMinutes: null,
};

describe("HowToArrive — bloco 'Como chegar' (PRD-11)", () => {
  it("mostra o aviso crítico de entrada quando há notice", () => {
    render(<HowToArrive {...base} hasNotice notice="Use a Rua Padre Celestino Pavan — o GPS erra a entrada." />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("o GPS erra a entrada");
  });

  it("não mostra alerta quando has_notice é false", () => {
    render(<HowToArrive {...base} notice="texto qualquer" hasNotice={false} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renderiza o passo-a-passo (directions_text)", () => {
    render(<HowToArrive {...base} directionsText="Entre pela rua lateral. Recepção à direita." />);
    expect(screen.getByText(/Recepção à direita/)).toBeInTheDocument();
  });

  it("compõe a linha de traslado a partir dos minutos", () => {
    render(<HowToArrive {...base} shuttleFrequencyMinutes={15} shuttleToTerminalMinutes={6} />);
    expect(screen.getByText(/a cada 15 min · ~6 min ao terminal/)).toBeInTheDocument();
  });

  it("omite a linha de traslado quando não há dados", () => {
    render(<HowToArrive {...base} />);
    expect(screen.queryByText(/Transfer:/)).not.toBeInTheDocument();
  });
});
