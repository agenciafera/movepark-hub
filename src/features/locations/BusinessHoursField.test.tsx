import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BusinessHoursField } from "./BusinessHoursField";
import { emptyBusinessHours } from "./businessHours";

describe("BusinessHoursField", () => {
  it("24h ligado esconde o editor por dia", () => {
    render(
      <BusinessHoursField
        is24h
        onIs24hChange={vi.fn()}
        hours={emptyBusinessHours()}
        onHoursChange={vi.fn()}
      />,
    );
    expect(screen.queryByText("Segunda")).not.toBeInTheDocument();
  });

  it("desligar 24h chama o callback", async () => {
    const onIs24hChange = vi.fn();
    render(
      <BusinessHoursField
        is24h
        onIs24hChange={onIs24hChange}
        hours={emptyBusinessHours()}
        onHoursChange={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("switch"));
    expect(onIs24hChange).toHaveBeenCalledWith(false);
  });

  it("com 24h desligado, mostra os 7 dias fechados", () => {
    render(
      <BusinessHoursField
        is24h={false}
        onIs24hChange={vi.fn()}
        hours={emptyBusinessHours()}
        onHoursChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Segunda")).toBeInTheDocument();
    expect(screen.getByText("Domingo")).toBeInTheDocument();
    // todos fechados: nenhum input de hora ainda
    expect(screen.queryByLabelText(/Abre/)).not.toBeInTheDocument();
    expect(screen.getAllByText("Fechado")).toHaveLength(7);
  });

  it("abrir um dia semeia um horário padrão editável", async () => {
    const onHoursChange = vi.fn();
    render(
      <BusinessHoursField
        is24h={false}
        onIs24hChange={vi.fn()}
        hours={emptyBusinessHours()}
        onHoursChange={onHoursChange}
      />,
    );
    // O checkbox "Segunda" abre o dia com o horário padrão.
    await userEvent.click(screen.getByLabelText("Segunda"));
    expect(onHoursChange).toHaveBeenCalledWith(
      expect.objectContaining({ mon: { open: "08:00", close: "18:00" } }),
    );
  });
});
