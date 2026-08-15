import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { rpc, tabela } from "@/test/msw/supabase";
import { LocationPlatformDialog, describeBlockers } from "./LocationPlatformDialog";
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

function abre(mode: "hub" | "external" = "hub", go2park = false) {
  return renderWithProviders(
    <LocationPlatformDialog
      open
      locationId="loc-1"
      locationName="Virapark GRU"
      mode={mode}
      go2park={go2park}
      onOpenChange={() => {}}
    />,
  );
}

/** O diálogo tem dois interruptores; cada teste fala do seu pelo rótulo. */
function toggleCheckout() {
  return screen.getByRole("switch", { name: /Fechar a reserva no site do parceiro/ });
}
function toggleGo2Park() {
  return screen.getByRole("switch", { name: /Transfer com rastreio ao vivo/ });
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

describe("LocationPlatformDialog · onde a reserva fecha", () => {
  it("trava o toggle e mostra o motivo quando o pré-voo reprova", async () => {
    rpc("location_external_readiness", { json: INCOMPLETO });
    abre("hub");

    expect(await screen.findByText(/Falta na empresa: wl_public_domain/)).toBeInTheDocument();
    expect(screen.getByText(/2 tipos de vaga sem mapeamento/)).toBeInTheDocument();
    expect(toggleCheckout()).toBeDisabled();
  });

  it("libera o toggle e grava external quando o pré-voo passa", async () => {
    rpc("location_external_readiness", { json: PRONTO });
    const patch = tabela("location", "patch", { json: [{ id: "loc-1", checkout_mode: "external" }] });
    abre("hub");

    const toggle = toggleCheckout();
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

/**
 * O selo do Go2Park é promessa de serviço: contrato encerrado com o selo no ar vira promessa
 * falsa no card e na página da unidade. Desligar tem que ser tão fácil quanto ligar, e por isso
 * o caso de desligar é testado junto com o de ligar.
 */
describe("LocationPlatformDialog · Go2Park", () => {
  it("liga a Go2Park na unidade", async () => {
    rpc("location_external_readiness", { json: PRONTO });
    const patch = tabela("location", "patch", {
      json: [{ id: "loc-1", go2park_enabled: true }],
    });
    abre("hub", false);

    await userEvent.click(toggleGo2Park());

    await waitFor(() => expect(patch.chamadas.length).toBe(1));
    expect(patch.ultimoBody).toEqual({ go2park_enabled: true });
  });

  it("desliga quando o contrato acaba", async () => {
    rpc("location_external_readiness", { json: PRONTO });
    const patch = tabela("location", "patch", {
      json: [{ id: "loc-1", go2park_enabled: false }],
    });
    abre("external", true);

    expect(toggleGo2Park()).toBeChecked();
    await userEvent.click(toggleGo2Park());

    await waitFor(() => expect(patch.chamadas.length).toBe(1));
    expect(patch.ultimoBody).toEqual({ go2park_enabled: false });
  });

  it("explica por que o selo sobrevive ao checkout externo (ADR-009)", async () => {
    rpc("location_external_readiness", { json: PRONTO });
    abre("external", true);

    expect(
      await screen.findByText(/independentemente de onde a reserva fecha/),
    ).toBeInTheDocument();
  });

  it("mudar a Go2Park não mexe no checkout", async () => {
    rpc("location_external_readiness", { json: PRONTO });
    const patch = tabela("location", "patch", {
      json: [{ id: "loc-1", go2park_enabled: true }],
    });
    abre("hub", false);

    await userEvent.click(toggleGo2Park());

    await waitFor(() => expect(patch.chamadas.length).toBe(1));
    expect(patch.ultimoBody).not.toHaveProperty("checkout_mode");
  });
});
