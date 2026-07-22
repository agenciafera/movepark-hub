import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

// O bloco de comodidades tem teste próprio; aqui só interessa que o bloco existe.
vi.mock("@/features/amenities/AmenityPicker", () => ({
  AmenityPicker: () => null,
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
      "Comodidades",
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

/**
 * Regressão: o efeito que semeia o formulário dependia de `location`, que é
 * referência nova sempre que a query responde com dado diferente. Uma
 * atualização vinda de fora no meio da edição chamava `reset()` e apagava o que
 * a pessoa tinha digitado. A dependência agora é `location?.id`.
 */
describe("OperatorLocationEdit — o que a pessoa digitou é dela", () => {
  it("dado que muda por fora não sobrescreve o formulário em edição", async () => {
    let atual = [location()];
    vi.mocked(useOperatorLocations).mockImplementation(
      () => ({ data: atual, isLoading: false, isError: false }) as never,
    );

    renderWithProviders(<OperatorLocationEdit />, {
      auth: mockAuth({
        session: mockSession("company_operator"),
        effectiveCompanyIds: ["company-1"],
      }),
      route: "/operator/locations/loc-1/editar",
      path: "/operator/locations/:locationId/editar",
    });

    const tel = screen.getByLabelText("Telefone");
    await userEvent.type(tel, "41988887777");
    expect(tel).toHaveValue("41988887777");

    // alguém editou a mesma unidade por outro caminho: objeto novo, campo mudado
    atual = [location({ address: "Av. Nova, 100" })];
    await userEvent.type(tel, "9"); // provoca re-render

    expect(tel).toHaveValue("419888877779");
  });
});
