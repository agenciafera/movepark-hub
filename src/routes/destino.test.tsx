import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { renderWithProviders } from "@/test/utils";
import DestinoPage from "@/routes/destino";
import { useDestinationBySlug } from "@/features/destinations/api";
import { useSearchResults } from "@/features/search/useSearchResults";
import { useFaqs } from "@/features/faqs/api";
import type { Destination } from "@/types/domain";

// useLoaderData lança fora de um data router; no teste o caminho é via hook (useDestinationBySlug).
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useLoaderData: vi.fn(() => null), useParams: vi.fn(() => ({ slug: "aeroporto-de-guarulhos" })) };
});

vi.mock("@/features/destinations/api", () => ({ useDestinationBySlug: vi.fn() }));
vi.mock("@/features/search/useSearchResults", () => ({ useSearchResults: vi.fn() }));
vi.mock("@/features/faqs/api", () => ({ useFaqs: vi.fn() }));

function dest(overrides: Partial<Destination> = {}): Destination {
  return {
    id: "d1",
    code: "GRU",
    name: "Aeroporto Internacional de São Paulo / Guarulhos",
    short_name: "Guarulhos",
    slug: "aeroporto-de-guarulhos",
    type: "airport",
    city: "Guarulhos",
    state: "SP",
    country: "BR",
    latitude: -23.43,
    longitude: -46.47,
    is_popular: true,
    is_published: true,
    sort_order: 1,
    meta_title: null,
    meta_description: null,
    intro: "Primeiro parágrafo do destino.\n\nSegundo parágrafo com contexto da região.",
    hero_image_url: null,
    geog: null,
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
    deleted_at: null,
    ...overrides,
  } as Destination;
}

function render() {
  return renderWithProviders(
    <HelmetProvider>
      <DestinoPage />
    </HelmetProvider>,
    { route: "/destinos/aeroporto-de-guarulhos" },
  );
}

beforeEach(() => {
  vi.mocked(useSearchResults).mockReturnValue({ data: { results: [] }, isLoading: false } as never);
  vi.mocked(useFaqs).mockReturnValue({ data: [] } as never);
});

describe("DestinoPage — detalhe do destino (SEO/institucional)", () => {
  it("renderiza H1 por destino, parágrafos do intro e CTA pra busca sem fluxo de compra", () => {
    vi.mocked(useDestinationBySlug).mockReturnValue({ data: dest(), isLoading: false } as never);

    render();

    expect(
      screen.getByRole("heading", { level: 1, name: /Estacionamento em Guarulhos/i }),
    ).toBeInTheDocument();
    // Conteúdo descritivo por região (intro com 2 parágrafos)
    expect(screen.getByText(/Primeiro parágrafo do destino/i)).toBeInTheDocument();
    expect(screen.getByText(/contexto da região/i)).toBeInTheDocument();
    // H2 estruturado da seção de estacionamentos
    expect(screen.getByRole("heading", { level: 2, name: /Estacionamentos em Guarulhos/i })).toBeInTheDocument();
    // CTA leva pra busca (não embute checkout/reserva)
    expect(
      screen.getByRole("link", { name: /Ver todos os estacionamentos/i }),
    ).toHaveAttribute("href", "/search?dest=GRU");
  });

  it("mostra estado vazio quando o destino não existe / não está publicado", () => {
    vi.mocked(useDestinationBySlug).mockReturnValue({ data: null, isLoading: false } as never);

    render();

    expect(screen.getByText(/Destino não encontrado/i)).toBeInTheDocument();
  });
});
