import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockAuth, mockSession, renderWithProviders } from "@/test/utils";
import OperatorLocations from "./locations";
import { useOperatorLocations, type OperatorLocation } from "@/features/locations/api";

vi.mock("@/features/locations/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/locations/api")>();
  return { ...actual, useOperatorLocations: vi.fn() };
});

// O editor abre num dialog e arrasta meia stack de form junto; a listagem é o alvo aqui.
vi.mock("@/features/locations/LocationForm", () => ({
  LocationForm: () => null,
}));

function location(over: Partial<OperatorLocation> = {}): OperatorLocation {
  return {
    id: "loc-1",
    company_id: "company-1",
    name: "Aeroporto Afonso Pena",
    address: "Av. Rocha Pombo, s/n",
    status: "active",
    timezone: "America/Sao_Paulo",
    photos: ["a.jpg", "b.jpg"],
    company: { id: "company-1", name: "Mercy" },
    parking_types: [
      { capacity: 8, is_active: true },
      { capacity: 4, is_active: true },
    ],
    ...over,
  } as unknown as OperatorLocation;
}

function setup(query: Partial<ReturnType<typeof useOperatorLocations>>) {
  vi.mocked(useOperatorLocations).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
    ...query,
  } as never);

  return renderWithProviders(<OperatorLocations />, {
    auth: mockAuth({
      session: mockSession("company_operator"),
      effectiveCompanyIds: ["company-1"],
    }),
    route: "/operator/locations",
  });
}

describe("OperatorLocations", () => {
  it("mostra o status em português, não o enum cru do banco", () => {
    setup({ data: [location({ status: "inactive" })] });

    expect(screen.getByText("Inativa")).toBeInTheDocument();
    expect(screen.queryByText("inactive")).not.toBeInTheDocument();
  });

  it("resume vagas, tipos e fotos, contando só o tipo de vaga ativo", () => {
    setup({
      data: [
        location({
          photos: ["a.jpg", "b.jpg", "c.jpg"],
          parking_types: [
            { capacity: 8, is_active: true },
            { capacity: 4, is_active: true },
            // desativado não vende, então não entra na conta
            { capacity: 99, is_active: false },
          ],
        }),
      ],
    });

    expect(screen.getByText(/12 vagas · 2 tipos · 3 fotos/)).toBeInTheDocument();
  });

  it("concorda em número quando há só um de cada", () => {
    setup({
      data: [location({ photos: ["a.jpg"], parking_types: [{ capacity: 1, is_active: true }] })],
    });

    expect(screen.getByText(/1 vaga · 1 tipo · 1 foto/)).toBeInTheDocument();
  });

  it("avisa que unidade sem foto não aparece na busca", () => {
    setup({ data: [location({ photos: [] })] });

    expect(screen.getByText(/não aparece na busca/i)).toBeInTheDocument();
  });

  /**
   * Regressão: a tela desestruturava só `{ data, isLoading }`, então uma falha de
   * rede deixava `data` undefined, caía no empty state e dizia ao dono do
   * estacionamento que ele não tinha unidades cadastradas.
   */
  it("falha de carga mostra erro com repetição, nunca o empty state de sem unidades", async () => {
    const refetch = vi.fn();
    setup({ isError: true, refetch });

    expect(screen.getByText("Não conseguimos carregar suas unidades")).toBeInTheDocument();
    expect(screen.queryByText("Sem localizações vinculadas")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("lista vazia de verdade continua caindo no empty state", () => {
    setup({ data: [] });

    expect(screen.getByText("Sem localizações vinculadas")).toBeInTheDocument();
    expect(screen.queryByText("Não conseguimos carregar suas unidades")).not.toBeInTheDocument();
  });

  it("o nome da unidade é heading, para leitor de tela navegar a lista", () => {
    setup({ data: [location(), location({ id: "loc-2", name: "Aeroporto Bacacheri" })] });

    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(headings.map((h) => h.textContent)).toEqual([
      "Aeroporto Afonso Pena",
      "Aeroporto Bacacheri",
    ]);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});
