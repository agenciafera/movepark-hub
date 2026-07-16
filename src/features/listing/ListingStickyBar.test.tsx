import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ListingStickyBar } from "./ListingStickyBar";
import type { ReservationSummary } from "./reservation.logic";

function summary(over: Partial<ReservationSummary> = {}): ReservationSummary {
  return {
    canReserve: true,
    total: 162.9,
    days: 5,
    from: new Date("2026-07-22T22:00:00Z"),
    to: new Date("2026-07-29T08:00:00Z"),
    cancellationLine: "Cancelamento grátis até 24h",
    ...over,
  };
}

describe("ListingStickyBar", () => {
  it("com datas escolhidas mostra o TOTAL da reserva (não 'A partir de')", () => {
    render(
      <ListingStickyBar summary={summary()} basePrice={30} onReserve={() => {}} />,
    );

    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText("R$ 162,90")).toBeInTheDocument();
    expect(screen.getByText("Cancelamento grátis até 24h")).toBeInTheDocument();
    expect(screen.queryByText("A partir de")).not.toBeInTheDocument();
  });

  it("sem datas cai no 'A partir de' com o preço de balcão", () => {
    render(
      <ListingStickyBar
        summary={summary({ canReserve: false, total: 30 })}
        basePrice={30}
        onReserve={() => {}}
      />,
    );

    expect(screen.getByText("A partir de")).toBeInTheDocument();
    expect(screen.getByText("R$ 30,00")).toBeInTheDocument();
    expect(screen.queryByText("Total")).not.toBeInTheDocument();
  });

  it("sem datas e sem preço de balcão convida a escolher as datas (nada de R$ 0,00)", () => {
    render(
      <ListingStickyBar
        summary={summary({ canReserve: false, total: 0 })}
        basePrice={0}
        onReserve={() => {}}
      />,
    );

    expect(screen.getByText("Escolha as datas")).toBeInTheDocument();
    expect(screen.queryByText("R$ 0,00")).not.toBeInTheDocument();
    expect(screen.queryByText("A partir de")).not.toBeInTheDocument();
  });

  it("aciona onReserve ao tocar em Reservar", async () => {
    const onReserve = vi.fn();
    const user = userEvent.setup();
    render(<ListingStickyBar summary={summary()} basePrice={30} onReserve={onReserve} />);

    await user.click(screen.getByRole("button", { name: "Reservar" }));
    expect(onReserve).toHaveBeenCalledOnce();
  });
});
