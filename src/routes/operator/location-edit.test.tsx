import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { mockAuth, mockSession, renderWithProviders } from "@/test/utils";
import OperatorLocationEdit from "./location-edit";
import { useOperatorLocations, type OperatorLocation } from "@/features/locations/api";

vi.mock("@/features/locations/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/locations/api")>();
  return { ...actual, useOperatorLocations: vi.fn() };
});

// O upload de foto puxa Storage e o destino puxa outra query; nenhum dos dois é
// o alvo aqui, que é a estrutura da página.
vi.mock("@/components/shared/ImageUpload", () => ({
  ImageGalleryField: () => null,
}));

function location(over: Partial<OperatorLocation> = {}): OperatorLocation {
  return {
    id: "loc-1",
    company_id: "company-1",
    name: "Aeroporto Afonso Pena",
    address: "Av. Rocha Pombo, s/n",
    status: "active",
    timezone: "America/Sao_Paulo",
    photos: ["a.jpg"],
    company: { id: "company-1", name: "Mercy" },
    parking_types: [],
    ...over,
  } as unknown as OperatorLocation;
}

function setup(query: Partial<ReturnType<typeof useOperatorLocations>>, route = "/operator/locations/loc-1/editar") {
  vi.mocked(useOperatorLocations).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    ...query,
  } as never);

  return renderWithProviders(<OperatorLocationEdit />, {
    auth: mockAuth({
      session: mockSession("company_operator"),
      effectiveCompanyIds: ["company-1"],
    }),
    route,
    path: "/operator/locations/:locationId/editar",
  });
}

describe("OperatorLocationEdit", () => {
  it("é página, com os campos divididos em blocos nomeados", () => {
    setup({ data: [location()] });

    const blocos = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(blocos).toEqual([
      "Identificação",
      "Contato",
      "Chegada",
      "Fotos",
      "Política de reserva",
    ]);
  });

  it("não mostra o bloco de catálogo, que é da equipe Movepark", () => {
    setup({ data: [location()] });

    expect(screen.queryByText("Catálogo Movepark")).not.toBeInTheDocument();
    // slug, status, fuso e WPS são os campos daquele bloco
    expect(screen.queryByLabelText("Slug")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Fuso horário")).not.toBeInTheDocument();
  });

  it("traz os dados da unidade preenchidos", () => {
    setup({ data: [location()] });

    expect(screen.getByLabelText("Nome")).toHaveValue("Aeroporto Afonso Pena");
    expect(screen.getByLabelText("Endereço")).toHaveValue("Av. Rocha Pombo, s/n");
  });

  it("id que não é da empresa não abre o editor", () => {
    // A listagem já vem escopada por empresa: unidade de outra empresa não está
    // na lista, então o find falha e a página recusa em vez de renderizar vazio.
    setup({ data: [location()] }, "/operator/locations/de-outra-empresa/editar");

    expect(screen.getByText("Unidade não encontrada")).toBeInTheDocument();
    expect(screen.queryByLabelText("Nome")).not.toBeInTheDocument();
  });

  it("falha de carga não vira formulário vazio", () => {
    setup({ isError: true });

    expect(screen.getByText("Não conseguimos carregar esta unidade")).toBeInTheDocument();
    expect(screen.queryByLabelText("Nome")).not.toBeInTheDocument();
  });
});
