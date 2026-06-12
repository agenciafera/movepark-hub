import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TerminalDistancesView } from "./TerminalDistances";
import type { TerminalDistance } from "./api";

const terminals: TerminalDistance[] = [
  { point_name: "Terminal 1", point_type: "terminal", distance_km: 1.49, is_nearest: false },
  { point_name: "Terminal 2", point_type: "terminal", distance_km: 0.48, is_nearest: true },
  { point_name: "Terminal 3", point_type: "terminal", distance_km: 0.89, is_nearest: false },
];

describe("TerminalDistancesView — distância por terminal (PRD-09)", () => {
  it("lista todos os terminais e marca o mais próximo", () => {
    render(<TerminalDistancesView terminals={terminals} />);
    expect(screen.getByText("Terminal 1")).toBeInTheDocument();
    expect(screen.getByText("Terminal 2")).toBeInTheDocument();
    expect(screen.getByText("Terminal 3")).toBeInTheDocument();
    expect(screen.getByText("mais perto")).toBeInTheDocument();
    // distância formatada (sub-1km vira metros)
    expect(screen.getByText(/480 m/)).toBeInTheDocument();
  });

  it("não renderiza nada quando o destino não tem terminais", () => {
    const { container } = render(<TerminalDistancesView terminals={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
