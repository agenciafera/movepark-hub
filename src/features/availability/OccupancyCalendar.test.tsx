import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OccupancyCalendar, type CalendarDay } from "./OccupancyCalendar";
import { INK_HEX } from "./occupancy.logic";

const day = (over: Partial<CalendarDay> = {}): CalendarDay => ({
  count: 640,
  capacity: 1100,
  pct: 640 / 1100,
  booked: 600,
  external: 40,
  blocked: false,
  ...over,
});

function setup(data: Record<string, CalendarDay>, onToggle = vi.fn()) {
  render(
    <OccupancyCalendar from="2026-07-01" to="2026-07-31" data={data} onToggle={onToggle} />,
  );
  return { onToggle };
}

describe("OccupancyCalendar", () => {
  it("dá um nome acessível completo à célula, com estado de bloqueio", () => {
    setup({ "2026-07-15": day(), "2026-07-16": day({ blocked: true }) });

    const cell = screen.getByRole("button", {
      name: "15 de julho, 640 de 1100 vagas ocupadas (58%). Bloquear vendas nesta data",
    });
    expect(cell).toHaveAttribute("aria-pressed", "false");

    const blocked = screen.getByRole("button", {
      name: "16 de julho, vendas bloqueadas nesta data. Liberar vendas nesta data",
    });
    expect(blocked).toHaveAttribute("aria-pressed", "true");
  });

  it("não bloqueia a data no primeiro clique: pede confirmação", async () => {
    const user = userEvent.setup();
    const { onToggle } = setup({ "2026-07-15": day() });

    await user.click(screen.getByRole("button", { name: /15 de julho/ }));
    expect(onToggle).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Bloquear vendas em 15 de julho?");

    await user.click(screen.getByRole("button", { name: "Bloquear vendas" }));
    expect(onToggle).toHaveBeenCalledWith("2026-07-15", false);
  });

  it("cancelar na confirmação não bloqueia nada", async () => {
    const user = userEvent.setup();
    const { onToggle } = setup({ "2026-07-15": day() });

    await user.click(screen.getByRole("button", { name: /15 de julho/ }));
    await user.click(await screen.findByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("liberar é direto, sem confirmação (ação não destrutiva)", async () => {
    const user = userEvent.setup();
    const { onToggle } = setup({ "2026-07-15": day({ blocked: true }) });

    await user.click(screen.getByRole("button", { name: /15 de julho/ }));
    expect(onToggle).toHaveBeenCalledWith("2026-07-15", true);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("colore a célula pela escala navy, não pelo violeta de ação", () => {
    setup({ "2026-07-15": day({ pct: 0.1 }) });
    const cell = screen.getByRole("button", { name: /15 de julho/ });
    expect(cell.style.backgroundColor.toUpperCase()).toContain("F1F4FA");
    expect(cell.style.color.toUpperCase()).toContain(INK_HEX.slice(1));
    // o violeta de ação (#5D5FEF) não pinta o calendário
    expect(cell.getAttribute("style")?.toLowerCase()).not.toContain("5d5fef");
  });
});
