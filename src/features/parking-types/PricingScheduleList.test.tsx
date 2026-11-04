import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { rpc, tabela } from "@/test/msw/supabase";
import { PricingScheduleList } from "./PricingScheduleList";

const DEZEMBRO = {
  id: "sched-dez",
  location_parking_type_id: "lpt-9",
  effective_date: "2026-12-01",
  status: "scheduled",
  rule: { strategy: "fixed_bracket" },
  tiers: [
    { from_day: 1, to_day: 14, unit_price: 22.41, total_price: null },
    { from_day: 15, to_day: 30, unit_price: null, total_price: 333 },
  ],
  minimum_stay_days: 3,
  error: null,
};

describe("PricingScheduleList", () => {
  it("mostra a data, as faixas e a estadia mínima da tabela programada", async () => {
    tabela("pricing_schedule", "get", { json: [DEZEMBRO] });
    renderWithProviders(<PricingScheduleList lptId="lpt-9" canEditPricing />);

    expect(await screen.findByText("A partir de 01/12/2026")).toBeInTheDocument();
    expect(screen.getByText(/R\$\s?333,00/)).toBeInTheDocument();
    expect(screen.getByText(/Estadia mínima passa a ser de 3 diárias/)).toBeInTheDocument();
  });

  it("falha aparece com o motivo, sem botão de cancelar", async () => {
    tabela("pricing_schedule", "get", {
      json: [{ ...DEZEMBRO, status: "failed", error: "A vaga passou a copiar o preço do sistema antigo." }],
    });
    renderWithProviders(<PricingScheduleList lptId="lpt-9" canEditPricing />);

    expect(await screen.findByText("A troca de 01/12/2026 falhou")).toBeInTheDocument();
    expect(screen.getByText(/O preço de hoje continua valendo/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancelar" })).not.toBeInTheDocument();
  });

  it("cancelar chama a RPC com o id do agendamento", async () => {
    tabela("pricing_schedule", "get", { json: [DEZEMBRO] });
    const espiao = rpc("pricing_schedule_cancel", { json: null });
    const user = userEvent.setup();
    renderWithProviders(<PricingScheduleList lptId="lpt-9" canEditPricing />);

    await user.click(await screen.findByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(espiao.ultimoBody).toEqual({ p_id: "sched-dez" }));
  });

  it("sem pricing:write, o cancelar fica desabilitado (o servidor também recusa)", async () => {
    tabela("pricing_schedule", "get", { json: [DEZEMBRO] });
    renderWithProviders(<PricingScheduleList lptId="lpt-9" canEditPricing={false} />);

    expect(await screen.findByRole("button", { name: "Cancelar" })).toBeDisabled();
  });

  it("sem nada programado, não ocupa espaço no card", async () => {
    const get = tabela("pricing_schedule", "get", { json: [] });
    const { container } = renderWithProviders(<PricingScheduleList lptId="lpt-9" canEditPricing />);

    await waitFor(() => expect(get.chamadas.length).toBe(1));
    expect(container.querySelector("ul")).toBeNull();
  });
});
