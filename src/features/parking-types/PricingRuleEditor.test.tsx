import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { rpc, tabela } from "@/test/msw/supabase";
import { PricingRuleEditor } from "./PricingRuleEditor";
import type { LocationParkingTypeWithRelations } from "./api";

// Radix Select usa APIs de ponteiro/scroll ausentes no happy-dom.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

/**
 * Diária uniforme com riscado em tabela própria, como as 15 espelhadas do white-label: o riscado
 * guarda TOTAL (R$ 290 na semana) mesmo a estratégia sendo de diária.
 */
const LPT = {
  id: "lpt-9",
  has_minimum_stay: true,
  minimum_stay_value: 2,
  minimum_stay_unit: "days",
  company_parking_type: {
    id: "cpt-9",
    base_price: 40,
    parking_type: { id: "pt-1", code: "uncovered", name: "Vaga Descoberta" },
  },
  pricing_rule: {
    strategy: "uniform_by_duration",
    fractional_day_policy: "any_extra",
    old_price_strategy: "own_table",
    tiers: [
      { id: "t1", from_day: 1, to_day: null, unit_price: 40, total_price: null, is_old_price: false },
      { id: "o1", from_day: 1, to_day: 7, unit_price: null, total_price: 290, is_old_price: true },
    ],
  },
} as unknown as LocationParkingTypeWithRelations;

function abre() {
  tabela("location_parking_type", "get", { json: [] });
  rpc("simulate_pricing_draft", { json: [] });
  rpc("simulate_price", { json: { price: 40 } });
  return renderWithProviders(
    <PricingRuleEditor
      open
      onOpenChange={() => {}}
      lpt={LPT}
      companyId="company-1"
      companySlug="empresa"
      locationSlug="unidade"
      parkingTypeCode="uncovered"
    />,
  );
}

describe("PricingRuleEditor: preço riscado", () => {
  it("mostra o total do riscado mesmo em tabela de diária uniforme", async () => {
    abre();
    // Antes o editor do riscado herdava as colunas da estratégia (só diária) e o R$ 290 sumia.
    expect(await screen.findByDisplayValue(/290,00/)).toBeInTheDocument();
  });

  it("salvar agora devolve o riscado intacto", async () => {
    const espiao = rpc("operator_set_pricing", { json: null });
    const user = userEvent.setup();
    abre();

    await user.click(await screen.findByRole("button", { name: /Salvar precificação/ }));

    await waitFor(() =>
      expect((espiao.ultimoBody as { p_old_tiers: unknown }).p_old_tiers).toEqual([
        { from_day: 1, to_day: 7, unit_price: null, total_price: 290 },
      ]),
    );
  });
});

describe("PricingRuleEditor: programar tabela", () => {
  it("com data, programa em vez de salvar, mandando o dia e a estadia mínima", async () => {
    const programar = rpc("pricing_schedule_create", { json: "sched-1" });
    const salvar = rpc("operator_set_pricing", { json: null });
    const user = userEvent.setup();
    abre();

    await user.click(await screen.findByRole("combobox", { name: "Esta tabela" }));
    await user.click(await screen.findByRole("option", { name: "Vale a partir de uma data" }));

    // Sem data, o botão avisa e não deixa programar.
    expect(screen.getByRole("button", { name: /Programar tabela/ })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("A partir de"), { target: { value: "2030-12-01" } });
    const minimo = screen.getByLabelText(/Estadia mínima a partir dessa data/);
    await user.clear(minimo);
    await user.type(minimo, "3");

    await user.click(screen.getByRole("button", { name: "Programar para 01/12/2030" }));

    await waitFor(() =>
      expect(programar.ultimoBody).toMatchObject({
        p_location_parking_type_id: "lpt-9",
        p_effective_date: "2030-12-01",
        p_minimum_stay_days: 3,
        p_old_tiers: [{ from_day: 1, to_day: 7, unit_price: null, total_price: 290 }],
      }),
    );
    expect(salvar.chamadas).toHaveLength(0);
  });
});
