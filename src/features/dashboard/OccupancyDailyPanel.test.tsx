import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { OccupancyDailyPanel } from "./OccupancyDailyPanel";
import { occupancyDaySeries } from "./dashboardMetrics.logic";

// 13/11/2026: o painel do Manager filtrado por uma unidade de white-label não tinha ocupação.
// A unidade só do site (Hub zerado) tem que mostrar a média, o dia mais cheio e as duas origens.
const soSite = occupancyDaySeries([
  { date: "2026-11-01", capacity: 150, hub: 0, wl: 30 },
  { date: "2026-11-02", capacity: 150, hub: 0, wl: 120 },
]);

describe("OccupancyDailyPanel", () => {
  it("unidade que vende só pelo site mostra a ocupação, o dia mais cheio e a legenda", () => {
    render(<OccupancyDailyPanel points={soSite} isLoading={false} rangeLabel="1 a 2 nov" stacked />);
    expect(screen.getByTestId("ocupacao-media")).toHaveTextContent(
      "50% de ocupação média, 75 de 150 vagas por dia",
    );
    expect(screen.getByTestId("ocupacao-pico")).toHaveTextContent("80%");
    expect(screen.getByText("White-label")).toBeInTheDocument();
  });

  it("sem white-label não fala dele", () => {
    const soHub = occupancyDaySeries([{ date: "2026-11-01", capacity: 10, hub: 4, wl: 0 }]);
    render(<OccupancyDailyPanel points={soHub} isLoading={false} rangeLabel="1 nov" stacked={false} />);
    expect(screen.getByTestId("ocupacao-media")).toHaveTextContent("40%");
    expect(screen.queryByText(/white-label/i)).not.toBeInTheDocument();
  });

  it("sem capacidade nem carro, pede o cadastro das vagas", () => {
    render(<OccupancyDailyPanel points={[]} isLoading={false} rangeLabel="1 nov" stacked />);
    expect(screen.getByText("Sem capacidade cadastrada")).toBeInTheDocument();
    expect(screen.queryByTestId("ocupacao-media")).not.toBeInTheDocument();
  });

  it("com vagas e sem carro, diz que o pátio ficou vazio", () => {
    const vazio = occupancyDaySeries([{ date: "2026-11-01", capacity: 10, hub: 0, wl: 0 }]);
    render(<OccupancyDailyPanel points={vazio} isLoading={false} rangeLabel="1 nov" stacked />);
    expect(screen.getByText("Nenhum carro no pátio no período")).toBeInTheDocument();
    expect(screen.queryByTestId("ocupacao-pico")).not.toBeInTheDocument();
  });
});
