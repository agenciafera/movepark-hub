import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { GO2PARK_COPY, Go2ParkLiveBadge, Go2ParkLiveBlock, Go2ParkLiveChip } from "./Go2ParkLive";

describe("Go2Park (transfer com rastreio ao vivo)", () => {
  it("a faixa do card diz o que a unidade entrega e nomeia o produto", () => {
    renderWithProviders(<Go2ParkLiveBadge />);
    expect(screen.getByTestId("go2park-badge")).toBeInTheDocument();
    expect(screen.getByText(GO2PARK_COPY.badge)).toBeInTheDocument();
    expect(screen.getByText(GO2PARK_COPY.badgeSub)).toBeInTheDocument();
    expect(screen.getByText("Go2Park")).toBeInTheDocument();
  });

  it("o bloco da unidade traz título, explicação e os pontos do serviço", () => {
    renderWithProviders(<Go2ParkLiveBlock />);
    expect(screen.getByRole("heading", { name: GO2PARK_COPY.blockTitle })).toBeInTheDocument();
    expect(screen.getByText(GO2PARK_COPY.blockBody)).toBeInTheDocument();
    for (const p of GO2PARK_COPY.points) {
      expect(screen.getByText(p.text)).toBeInTheDocument();
    }
  });

  it("o chip cabe numa linha de metadados, só com o rótulo", () => {
    renderWithProviders(<Go2ParkLiveChip />);
    expect(screen.getByTestId("go2park-chip").textContent).toBe(GO2PARK_COPY.badge);
  });

  /**
   * A marca do projeto é "Movepark"; a do produto irmão é "Go2Park". Caixa alta ("GO2PARK") ou
   * espaço ("Go 2 Park") no meio da página quebram as duas convenções de uma vez.
   */
  it("escreve o nome do produto sempre como Go2Park", () => {
    const { container } = renderWithProviders(
      <>
        <Go2ParkLiveBadge />
        <Go2ParkLiveBlock />
      </>,
    );
    const texto = container.textContent ?? "";
    expect(texto).toContain("Go2Park");
    expect(texto).not.toMatch(/GO2PARK|Go 2 Park|go2park/);
  });
});
