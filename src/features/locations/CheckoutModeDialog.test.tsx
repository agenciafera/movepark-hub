import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { rpc, tabela } from "@/test/msw/supabase";
import { CheckoutModeDialog, describeBlockers } from "./CheckoutModeDialog";
import type { LocationExternalReadiness } from "@/types/domain";

const PRONTO: LocationExternalReadiness = {
  ready: true,
  missing_company: [],
  unmapped_count: 0,
  unmapped_names: [],
};

const INCOMPLETO: LocationExternalReadiness = {
  ready: false,
  missing_company: ["wl_public_domain"],
  unmapped_count: 2,
  unmapped_names: ["Coberta", "Descoberta"],
};

function abre(mode: "hub" | "external" = "hub") {
  return renderWithProviders(
    <CheckoutModeDialog
      open
      locationId="loc-1"
      locationName="Virapark GRU"
      mode={mode}
      onOpenChange={() => {}}
    />,
  );
}

describe("describeBlockers", () => {
  it("lista o que falta na empresa e nos tipos de vaga, com os nomes", () => {
    expect(describeBlockers(INCOMPLETO)).toEqual([
      "Falta na empresa: wl_public_domain",
      "2 tipos de vaga sem mapeamento com o white-label (Coberta, Descoberta)",
    ]);
  });

  it("usa singular quando falta um só", () => {
    const [linha] = describeBlockers({
      ready: false,
      missing_company: [],
      unmapped_count: 1,
      unmapped_names: ["Coberta"],
    });
    expect(linha).toContain("1 tipo de vaga sem mapeamento");
  });

  it("não lista nada quando o pré-voo passa", () => {
    expect(describeBlockers(PRONTO)).toEqual([]);
  });
});

describe("CheckoutModeDialog", () => {
  it("trava o toggle e mostra o motivo quando o pré-voo reprova", async () => {
    rpc("location_external_readiness", { json: INCOMPLETO });
    abre("hub");

    expect(await screen.findByText(/Falta na empresa: wl_public_domain/)).toBeInTheDocument();
    expect(screen.getByText(/2 tipos de vaga sem mapeamento/)).toBeInTheDocument();
    expect(screen.getByRole("switch")).toBeDisabled();
  });

  it("libera o toggle e grava external quando o pré-voo passa", async () => {
    rpc("location_external_readiness", { json: PRONTO });
    const patch = tabela("location", "patch", { json: [{ id: "loc-1", checkout_mode: "external" }] });
    abre("hub");

    const toggle = screen.getByRole("switch");
    await waitFor(() => expect(toggle).toBeEnabled());
    await userEvent.click(toggle);

    await waitFor(() => expect(patch.chamadas.length).toBe(1));
    expect(patch.ultimoBody).toEqual({ checkout_mode: "external" });
  });

  it("avisa o que a Movepark deixa de controlar quando a unidade já é externa", async () => {
    rpc("location_external_readiness", { json: PRONTO });
    abre("external");

    expect(
      await screen.findByText(/não controla cancelamento, cupom nem vaga garantida/),
    ).toBeInTheDocument();
  });
});
