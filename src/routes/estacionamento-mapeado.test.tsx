import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HelmetProvider } from "react-helmet-async";
import { renderWithProviders } from "@/test/utils";
import EstacionamentoMapeadoPage from "@/routes/estacionamento-mapeado";
import type { Destination, ProspectCard as ProspectCardData } from "@/types/domain";

// O iframe do mapa some do render de teste: o happy-dom lança ao conectar um iframe.
vi.mock("@/components/shared/MapEmbed", () => ({ MapEmbed: () => null }));

const loaderData = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useLoaderData: () => loaderData() };
});

function dest(overrides: Partial<Destination> = {}): Destination {
  return {
    id: "d1",
    code: "REC",
    name: "Aeroporto Internacional do Recife/Guararapes",
    short_name: "Recife (REC)",
    slug: "aeroporto-internacional-do-recife-guararapes",
    type: "airport",
    city: "Recife",
    state: "PE",
    country: "BR",
    latitude: -8.1264,
    longitude: -34.9236,
    is_published: true,
    ...overrides,
  } as Destination;
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
    google_place_id: null,
    google_rating: null,
    google_rating_count: 0,
    ...overrides,
  };
}

function render() {
  return renderWithProviders(
    <HelmetProvider>
      <EstacionamentoMapeadoPage />
    </HelmetProvider>,
    {
      route:
        "/estacionamentos/aeroporto-internacional-do-recife-guararapes/talentos-park-aeroporto-recife",
    },
  );
}

beforeEach(() => {
  loaderData.mockReturnValue({ destination: dest(), prospect: prospect() });
  window.dataLayer = [];
});

describe("Página do lote mapeado (E0.17-e · ADR-010)", () => {
  it("mostra o que a página tem: nome, selo, endereço, distância e a ausência de preço", () => {
    render();

    expect(screen.getByRole("heading", { level: 1, name: "Talentos Park" })).toBeInTheDocument();
    expect(screen.getByText("Sem reserva online")).toBeInTheDocument();
    expect(screen.getByText(/R\. Projetada, 169/)).toBeInTheDocument();
    expect(screen.getByText(/1 km do Recife \(REC\)/)).toBeInTheDocument();
    // Preço declarado como ausente, não omitido: quem chega da busca precisa saber que a
    // falta de preço é da oferta, e não da página.
    expect(screen.getByText(/Preço: não informado/)).toBeInTheDocument();
  });

  /**
   * O entregável que a spec pede por escrito: renderizar a single de um lote mapeado e
   * afirmar que NÃO existe nenhum elemento com ação de reserva na árvore. É o que impede
   * alguém de reintroduzir o botão numa refatoração de layout, e é a diferença entre esta
   * página e a do WordPress, que hoje tem um "Gostaria de fazer uma reserva?" flutuando
   * sobre um lote onde reserva não existe.
   */
  it("não tem NENHUM caminho de reserva: sem botão de reservar, sem data, sem preço", () => {
    render();

    expect(screen.queryByRole("button", { name: /reservar agora|reserve|fazer reserva/i })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByLabelText(/check-?in|check-?out|data/i)).toBeNull();
    expect(document.querySelectorAll('input[type="date"]')).toHaveLength(0);
    expect(document.body).not.toHaveTextContent(/R\$/);
    expect(document.body).not.toHaveTextContent(/por diária|diárias/i);
  });

  it("não linka o canal do parceiro, nem exibe o telefone", () => {
    render();

    const externos = [...document.querySelectorAll("a")].filter((a) =>
      /^https?:\/\//.test(a.getAttribute("href") ?? ""),
    );
    // Referral da Movepark no Analytics dele é a venda dos 20% morrendo.
    expect(externos).toHaveLength(0);
    // Q-021: o telefone é guardado e não exibido. Ele nem chega ao componente (a RPC não
    // devolve a coluna), e esta asserção é o alarme para o dia em que alguém "só adicionar
    // o campo" no retorno.
    expect(document.body).not.toHaveTextContent(/98692|\(81\)/);
  });

  it("mostra as avaliações do Google quando o loader traz snapshot, e some sem ele", () => {
    // Única prova social possível aqui: nota Movepark exige `booking`, e lote mapeado não
    // gera nenhum. Vem do loader, não de hook, porque precisa sair no HTML do build.
    loaderData.mockReturnValue({
      destination: dest(),
      prospect: prospect({ google_place_id: "ChIJ_x" }),
      google: {
        place_id: "ChIJ_x",
        rating: 4.4,
        user_rating_count: 137,
        maps_uri: "https://maps.google.com/?cid=1",
        fetched_at: new Date().toISOString(),
        reviews: [],
      },
    });
    const { unmount } = render();

    expect(screen.getByRole("heading", { name: /avaliações no google/i })).toBeInTheDocument();
    expect(screen.getByText("4,4")).toBeInTheDocument();
    // O bloco traz os primeiros links externos desta página, e eles só podem apontar para o
    // Google: a atribuição é condição de uso do conteúdo. Link para o site ou o motor de
    // reserva do lote continua proibido, aqui e em qualquer bloco novo.
    const externos = [...document.querySelectorAll("a")]
      .map((a) => a.getAttribute("href") ?? "")
      .filter((h) => /^https?:\/\//.test(h));
    expect(externos.length).toBeGreaterThan(0);
    expect(externos.every((h) => /^https:\/\/(maps|www)\.google\.com\//.test(h))).toBe(true);
    // A nota do Google NÃO entra no JSON-LD: `aggregateRating` no schema afirmaria em nome
    // da Movepark uma nota que é do Google.
    const blocos = [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) =>
      JSON.parse(s.textContent ?? "{}"),
    );
    expect(blocos.some((b) => "aggregateRating" in b)).toBe(false);
    unmount();

    loaderData.mockReturnValue({ destination: dest(), prospect: prospect() });
    render();
    expect(screen.queryByRole("heading", { name: /avaliações no google/i })).toBeNull();
  });

  it("o pedido de reserva vira evento, não tabela, e responde sem prometer aviso", async () => {
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole("button", { name: /me avise quando abrir/i }));

    expect(window.dataLayer).toContainEqual(
      expect.objectContaining({
        event: "prospect_demand_signal",
        prospect_slug: "talentos-park-aeroporto-recife",
      }),
    );
    // A confirmação não promete avisar ninguém: não coletamos contato, então prometer
    // seria mentira. Ela diz o que o clique faz de verdade.
    expect(screen.getByRole("status")).toHaveTextContent(/Recebemos seu pedido/i);
  });

  it("a reivindicação tem bloco próprio e leva a um caminho real, não a um beco", () => {
    render();

    expect(
      screen.getByRole("heading", { name: /É o administrador deste estacionamento/i }),
    ).toBeInTheDocument();
    // O `?lote=` é o que liga o lead à ficha. Sem ele, quando a unidade nascer ninguém
    // sabe de qual lote mapeado ela veio, e o carimbo de procedência vira palpite manual.
    expect(screen.getByRole("link", { name: /Reivindicar esta página/i })).toHaveAttribute(
      "href",
      "/seja-parceiro?lote=p1",
    );
  });

  // A FORMA do schema é asserida em jsonld.test.ts, sobre a função pura. Aqui o que
  // importa provar é que a página monta o bloco com os dados do lote, e não do destino.
  it("emite o ParkingFacility do lote na página", async () => {
    render();

    const facility = await waitFor(() => {
      const blocos = [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) =>
        JSON.parse(s.textContent ?? "{}"),
      );
      const encontrado = blocos.find((b) => b["@type"] === "ParkingFacility");
      expect(encontrado).toBeTruthy();
      return encontrado;
    });

    expect(facility.name).toBe("Talentos Park");
    expect(facility.geo).toEqual({
      "@type": "GeoCoordinates",
      latitude: -8.1309368,
      longitude: -34.9156297,
    });
    expect(facility.address.addressLocality).toBe("Recife");
    expect(facility.url).toBe(
      "https://hub.movepark.co/estacionamentos/aeroporto-internacional-do-recife-guararapes/talentos-park-aeroporto-recife",
    );
  });

  /**
   * FAQ do AEROPORTO (escopo destination) na página do lote: fato do destino, sem
   * promessa de transação deste lote. A resposta fica no DOM mesmo fechada
   * (forceMount) e o FAQPage espelha o visível.
   */
  it("mostra o FAQ do aeroporto quando o loader entrega, com FAQPage espelhando", async () => {
    loaderData.mockReturnValue({
      destination: dest(),
      prospect: prospect(),
      faqs: [
        {
          id: "fd1",
          scope: "destination",
          location_id: null,
          destination_id: "d1",
          question: "Tem traslado no Recife?",
          answer: "Os parceiros credenciados levam até o terminal.",
          sort_order: 0,
          category: null,
          slug: "tem-traslado-no-recife",
        },
      ],
    });
    render();

    expect(
      screen.getByRole("heading", { name: /Perguntas frequentes sobre estacionar perto do Recife/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Os parceiros credenciados levam até o terminal."),
    ).toBeInTheDocument();

    await waitFor(() => {
      const blocos = [...document.querySelectorAll('script[type="application/ld+json"]')].map(
        (s) => JSON.parse(s.textContent ?? "{}"),
      );
      const faqPage = blocos.find((b) => b["@type"] === "FAQPage");
      expect(faqPage?.mainEntity?.[0]?.name).toBe("Tem traslado no Recife?");
    });
  });

  it("sem FAQ do destino, a seção não existe", () => {
    render();
    expect(screen.queryByRole("heading", { name: /Perguntas frequentes/ })).toBeNull();
  });
});
