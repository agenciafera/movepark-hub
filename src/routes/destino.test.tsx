import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { renderWithProviders } from "@/test/utils";
import DestinoPage from "@/routes/destino";
import {
  useDestinationBySlug,
  useDestinationProspects,
  usePublishedDestinations,
} from "@/features/destinations/api";
import { useSearchResults } from "@/features/search/useSearchResults";
import { useFaqCombined } from "@/features/faqs/api";
import type { Destination, ProspectCard as ProspectCardData } from "@/types/domain";

// O iframe do mapa some do render de teste: o happy-dom lança ao conectar um iframe
// (page loading desabilitado), e a rejeição não capturada fazia o gate piscar.
vi.mock("@/components/shared/MapEmbed", () => ({ MapEmbed: () => null }));

// useLoaderData lança fora de um data router; no teste o caminho é via hook (useDestinationBySlug).
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useLoaderData: vi.fn(() => null), useParams: vi.fn(() => ({ slug: "aeroporto-de-guarulhos" })) };
});

vi.mock("@/features/destinations/api", () => ({
  useDestinationBySlug: vi.fn(),
  usePublishedDestinations: vi.fn(),
  useDestinationProspects: vi.fn(),
}));
// Mocka só o hook useSearchResults; o resto do módulo continua real via importOriginal.
vi.mock("@/features/search/useSearchResults", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/search/useSearchResults")>();
  return { ...actual, useSearchResults: vi.fn() };
});
vi.mock("@/features/faqs/api", () => ({ useFaqCombined: vi.fn() }));

function dest(overrides: Partial<Destination> = {}): Destination {
  return {
    id: "d1",
    code: "GRU",
    name: "Aeroporto Internacional de São Paulo / Guarulhos",
    short_name: "Guarulhos",
    seo_label: "Aeroporto Guarulhos (GRU)",
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

function prospect(overrides: Partial<ProspectCardData> = {}): ProspectCardData {
  return {
    id: "p1",
    name: "Talentos Park",
    slug: "talentos-park-aeroporto-recife",
    address: "R. Projetada, 169 - Boa Viagem, Recife - PE, 51150-650",
    latitude: -8.1309368,
    longitude: -34.9156297,
    google_maps_url: "https://maps.google.com/?cid=4598899734266939223",
    amenities: [],
    description: null,
    distance_km: 1.01,
    reference_name: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(useSearchResults).mockReturnValue({ data: { results: [] }, isLoading: false } as never);
  vi.mocked(useFaqCombined).mockReturnValue({ data: [] } as never);
  vi.mocked(usePublishedDestinations).mockReturnValue({ data: [] } as never);
  vi.mocked(useDestinationProspects).mockReturnValue({ data: [] } as never);
});

describe("DestinoPage: detalhe do destino (SEO/institucional)", () => {
  it("renderiza H1 por destino, parágrafos do intro e CTA pra busca sem fluxo de compra", () => {
    vi.mocked(useDestinationBySlug).mockReturnValue({ data: dest(), isLoading: false } as never);

    render();

    // O H1 tem que trazer "Aeroporto" colado em "Estacionamento": era o buraco medido no
    // Search Console (40,6% dos cliques vêm de consulta com a palavra "aeroporto", e o H1
    // antigo era "Estacionamento em Guarulhos", sem ela).
    expect(
      screen.getByRole("heading", { level: 1, name: "Estacionamento Aeroporto Guarulhos" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 1, name: /Estacionamento em /i }),
    ).not.toBeInTheDocument();
    // Conteúdo descritivo por região (intro com 2 parágrafos)
    expect(screen.getByText(/Primeiro parágrafo do destino/i)).toBeInTheDocument();
    expect(screen.getByText(/contexto da região/i)).toBeInTheDocument();
    // H2 estruturado da seção de estacionamentos
    expect(
      screen.getByRole("heading", { level: 2, name: "Estacionamentos Aeroporto Guarulhos (GRU)" }),
    ).toBeInTheDocument();
    // CTA leva pra busca (não embute checkout/reserva)
    expect(
      screen.getByRole("link", { name: /Ver todos os estacionamentos/i }),
    ).toHaveAttribute("href", "/search?dest=GRU");
  });

  it("renderiza breadcrumb visível (Início › Destinos › destino)", () => {
    vi.mocked(useDestinationBySlug).mockReturnValue({ data: dest(), isLoading: false } as never);

    render();

    const trilha = screen.getByRole("navigation", { name: /Trilha/i });
    expect(trilha).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Início" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Destinos" })).toHaveAttribute("href", "/destinos");
  });

  it("cross-link pra outros destinos (exclui o atual)", () => {
    vi.mocked(useDestinationBySlug).mockReturnValue({ data: dest(), isLoading: false } as never);
    vi.mocked(usePublishedDestinations).mockReturnValue({
      data: [
        dest(), // atual (id d1), deve ser excluído
        dest({ id: "d2", slug: "aeroporto-de-viracopos", name: "Aeroporto de Viracopos", short_name: "Viracopos" }),
        dest({ id: "d3", slug: "aeroporto-de-congonhas", name: "Aeroporto de Congonhas", short_name: "Congonhas" }),
      ],
    } as never);

    render();

    expect(screen.getByRole("link", { name: "Viracopos" })).toHaveAttribute(
      "href",
      "/destinos/aeroporto-de-viracopos",
    );
    expect(screen.getByRole("link", { name: "Congonhas" })).toBeInTheDocument();
    // o destino atual (Guarulhos) não aparece como cross-link
    expect(screen.queryByRole("link", { name: "Guarulhos" })).not.toBeInTheDocument();
  });

  it("mostra estado vazio quando o destino não existe / não está publicado", () => {
    vi.mocked(useDestinationBySlug).mockReturnValue({ data: null, isLoading: false } as never);

    render();

    expect(screen.getByText(/Destino não encontrado/i)).toBeInTheDocument();
  });
});

// E0.17-d · lote mapeado (ADR-010). Estes testes travam a regra comercial, não o layout:
// presença é de graça, conversão é paga. Um card mapeado que ganhe link, preço ou botão
// passa a competir de igual para igual com quem paga 20%.
describe("DestinoPage · lotes mapeados (E0.17-d)", () => {
  it("renderiza a seção própria, com o selo em texto no HTML e a distância", () => {
    vi.mocked(useDestinationBySlug).mockReturnValue({ data: dest(), isLoading: false } as never);
    vi.mocked(useDestinationProspects).mockReturnValue({ data: [prospect()] } as never);

    render();

    expect(
      screen.getByRole("heading", { level: 2, name: /Outros estacionamentos na região/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Talentos Park" })).toBeInTheDocument();
    // Selo é TEXTO, não tooltip nem title: o crawler precisa ler.
    expect(screen.getByText("Sem reserva online")).toBeInTheDocument();
    // Mesmo `formatDistance` do card vendável, então 1,01 km sai como "1 km": o
    // formatador corta o zero à direita. Se este texto divergir, o card mapeado passa a
    // parecer de outro sistema na mesma página.
    expect(screen.getByText("1 km")).toBeInTheDocument();
    expect(screen.getByText(/R\. Projetada, 169/)).toBeInTheDocument();
  });

  it("o único link do card é a página do lote no Hub, nunca o canal do parceiro", () => {
    vi.mocked(useDestinationBySlug).mockReturnValue({ data: dest(), isLoading: false } as never);
    vi.mocked(useDestinationProspects).mockReturnValue({ data: [prospect()] } as never);

    render();

    const card = screen.getByTestId("prospect-card");
    const links = [...card.querySelectorAll("a")];
    // Um link, e ele aponta para dentro: sem link interno a página do lote nasce órfã, e
    // é ela que carrega o JSON-LD e o caminho de reivindicação. Link para o canal DELE
    // entregaria de graça o que íamos cobrar 20%, e link de reserva prometeria o que não
    // existe (CDC art. 30/31). Nenhum dos dois nasce numa refatoração sem este teste cair.
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute(
      "href",
      "/estacionamentos/aeroporto-de-guarulhos/talentos-park-aeroporto-recife",
    );
    expect(card.querySelectorAll("button")).toHaveLength(0);
    expect(card).not.toHaveTextContent(/R\$/);
    // Nenhum href absoluto: é assim que "link para fora" apareceria.
    expect(
      [...card.querySelectorAll("[href]")].filter((el) =>
        /^https?:\/\//.test(el.getAttribute("href") ?? ""),
      ),
    ).toHaveLength(0);
  });

  it("usa o nome do terminal na distância quando o destino tem um cadastrado", () => {
    vi.mocked(useDestinationBySlug).mockReturnValue({ data: dest(), isLoading: false } as never);
    vi.mocked(useDestinationProspects).mockReturnValue({
      data: [prospect({ reference_name: "Terminal 2", distance_km: 0.4 })],
    } as never);

    render();

    expect(screen.getByText(/400 m do Terminal 2/)).toBeInTheDocument();
  });

  it("sem lote mapeado, a seção não existe (não deixa cabeçalho órfão na página)", () => {
    vi.mocked(useDestinationBySlug).mockReturnValue({ data: dest(), isLoading: false } as never);

    render();

    expect(
      screen.queryByRole("heading", { name: /Outros estacionamentos na região/i }),
    ).not.toBeInTheDocument();
  });

  it("seção vendável vazia aponta para a de baixo, que é o caso normal em destino novo", () => {
    vi.mocked(useDestinationBySlug).mockReturnValue({ data: dest(), isLoading: false } as never);
    vi.mocked(useDestinationProspects).mockReturnValue({ data: [prospect()] } as never);

    render();

    expect(screen.getByText(/Ainda não temos reserva online em Guarulhos/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Os estacionamentos que mapeamos na região estão logo abaixo/i),
    ).toBeInTheDocument();
  });

  it("sem vendável e sem mapeado, o estado vazio não promete uma seção que não existe", () => {
    vi.mocked(useDestinationBySlug).mockReturnValue({ data: dest(), isLoading: false } as never);

    render();

    expect(screen.getByText(/Ainda não temos reserva online em Guarulhos/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/estão logo abaixo/i),
    ).not.toBeInTheDocument();
  });
});
