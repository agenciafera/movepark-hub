import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { renderWithProviders } from "@/test/utils";
import DestinosPage from "@/routes/destinos";
import { useDestinations, type Destination } from "@/features/search/api";

// useLoaderData lança fora de um data router; no teste o caminho é via hook.
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useLoaderData: vi.fn(() => null) };
});

vi.mock("@/features/search/api", () => ({
  useDestinations: vi.fn(),
}));

function dest(overrides: Partial<Destination> = {}): Destination {
  return {
    id: "d1",
    code: "GRU",
    name: "Aeroporto de Guarulhos",
    short_name: "Guarulhos",
    slug: "aeroporto-de-guarulhos",
    type: "airport",
    city: "Guarulhos",
    state: "SP",
    country: "BR",
    latitude: -23.43,
    longitude: -46.47,
    is_popular: true,
    sort_order: 1,
    ...overrides,
  };
}

function render() {
  return renderWithProviders(
    <HelmetProvider>
      <DestinosPage />
    </HelmetProvider>,
    { route: "/destinos" },
  );
}

beforeEach(() => {
  vi.mocked(useDestinations).mockReturnValue({ data: [] } as never);
});

describe("DestinosPage", () => {
  it("renderiza H1 e separa destinos populares de outros, com links para cada /destinos/:slug", () => {
    vi.mocked(useDestinations).mockReturnValue({
      data: [
        dest(),
        dest({
          id: "d2",
          code: "VCP",
          name: "Aeroporto de Viracopos",
          short_name: "Viracopos",
          slug: "aeroporto-de-viracopos",
          city: "Campinas",
          is_popular: false,
        }),
      ],
    } as never);

    render();

    expect(
      screen.getByRole("heading", { level: 1, name: /Destinos atendidos pela Movepark/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Mais buscados/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Outros destinos/i })).toBeInTheDocument();

    const gru = screen.getByRole("link", { name: /Guarulhos/i });
    expect(gru).toHaveAttribute("href", "/destinos/aeroporto-de-guarulhos");
    const vcp = screen.getByRole("link", { name: /Viracopos/i });
    expect(vcp).toHaveAttribute("href", "/destinos/aeroporto-de-viracopos");
  });

  it("mostra estado vazio quando não há destinos publicados", () => {
    vi.mocked(useDestinations).mockReturnValue({ data: [] } as never);
    render();
    expect(screen.getByText(/Nenhum destino publicado ainda/i)).toBeInTheDocument();
  });
});
