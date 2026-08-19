import { describe, expect, it, vi, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HelmetProvider } from "react-helmet-async";
import { mockAuth, mockSession, renderWithProviders } from "@/test/utils";
import { server } from "@/test/msw/server";
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

// useLoaderData lança fora de um data router. Configurável porque o caminho do SSG (com
// loader) e o do cliente (sem) rendem coisas diferentes, e é justamente o do SSG que o bug
// da lista não pré-renderizada vivia.
const loaderData = vi.fn(() => null as unknown);
// `useNavigate` é espionado porque o favorito do anônimo termina numa navegação pro /login,
// e a árvore de teste renderiza a página solta (sem rota de destino pra onde ir).
const navigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useLoaderData: () => loaderData(),
    useParams: vi.fn(() => ({ slug: "aeroporto-de-guarulhos" })),
    useNavigate: () => navigate,
  };
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

function render(opts?: { auth?: ReturnType<typeof mockAuth> }) {
  return renderWithProviders(
    <HelmetProvider>
      <DestinoPage />
    </HelmetProvider>,
    { route: "/destinos/aeroporto-de-guarulhos", auth: opts?.auth },
  );
}

/** Data de coleta relativa a agora, porque o guard de frescor conta a partir do relógio. */
function diasAtras(dias: number): string {
  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
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
    google_fetched_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  // Volta ao caminho do cliente (sem loader) a cada teste. Sem isto, o primeiro teste que
  // simula o SSG contamina todos os seguintes, porque `mockReturnValue` não se desfaz sozinho
  // e a página prefere o dado do loader ao do hook.
  loaderData.mockReturnValue(null);
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
    expect(screen.getByRole("link", { name: /Ver todos e escolher datas/i })).toHaveAttribute(
      "href",
      "/search?dest=GRU",
    );
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
        dest({
          id: "d2",
          slug: "aeroporto-de-viracopos",
          name: "Aeroporto de Viracopos",
          short_name: "Viracopos",
          seo_label: "Aeroporto Viracopos (VCP)",
        }),
        dest({
          id: "d3",
          slug: "aeroporto-de-congonhas",
          name: "Aeroporto de Congonhas",
          short_name: "Congonhas",
          seo_label: "Aeroporto Congonhas (CGH)",
        }),
      ],
    } as never);

    render();

    // "Aeroporto Viracopos", e não "Viracopos": o bigrama "estacionamento aeroporto <X>"
    // é 40,6% dos cliques da página, e o cross-link é onde ele vira link interno.
    expect(screen.getByRole("link", { name: "Aeroporto Viracopos" })).toHaveAttribute(
      "href",
      "/destinos/aeroporto-de-viracopos",
    );
    expect(screen.getByRole("link", { name: "Aeroporto Congonhas" })).toBeInTheDocument();
    // Sem preço no card: ele é navegação, não comparação.
    expect(screen.getByRole("link", { name: "Aeroporto Congonhas" })).not.toHaveTextContent(
      /a partir de/i,
    );
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
// presença é de graça, conversão é paga. Uma linha mapeada que ganhe preço, botão ou link
// para o canal do parceiro passa a competir de igual para igual com quem paga 20%.
//
// Desde o redesenho de 19/08/2026 o lote mapeado aparece UMA vez na página, na lista de
// proximidade, marcado. Antes ele saía em card e de novo na lista, com informação
// diferente em cada aparição.
describe("DestinoPage · lotes mapeados (E0.17-d)", () => {
  /** A linha do lote mapeado na lista de proximidade. */
  function linhaMapeada() {
    return screen
      .getAllByTestId("proximity-row")
      .find((li) => li.getAttribute("data-kind") === "mapped")!;
  }

  it("entra na lista de proximidade com o selo em texto no HTML, endereço e distância", () => {
    vi.mocked(useDestinationBySlug).mockReturnValue({ data: dest(), isLoading: false } as never);
    vi.mocked(useDestinationProspects).mockReturnValue({ data: [prospect()] } as never);

    render();

    expect(
      screen.getByRole("heading", { level: 2, name: /Distância até o terminal/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Talentos Park" })).toBeInTheDocument();
    // Selo é TEXTO, não tooltip nem title: o crawler precisa ler.
    expect(screen.getByText("Sem reserva online")).toBeInTheDocument();
    // Mesmo `formatDistance` do lado vendável, então 1,01 km sai como "1 km": o
    // formatador corta o zero à direita. Se este texto divergir, o lote mapeado passa a
    // parecer de outro sistema na mesma página.
    const linha = linhaMapeada();
    expect(linha).toHaveTextContent("1 km do terminal");
    expect(linha).toHaveTextContent(/R\. Projetada, 169/);
  });

  it("o único link da linha é a página do lote no Hub, nunca o canal do parceiro", () => {
    vi.mocked(useDestinationBySlug).mockReturnValue({ data: dest(), isLoading: false } as never);
    vi.mocked(useDestinationProspects).mockReturnValue({ data: [prospect()] } as never);

    render();

    const linha = linhaMapeada();
    const links = [...linha.querySelectorAll("a")];
    // Um link, e ele aponta para dentro: sem link interno a página do lote nasce órfã, e
    // é ela que carrega o JSON-LD e o caminho de reivindicação. Link para o canal DELE
    // entregaria de graça o que íamos cobrar 20%, e link de reserva prometeria o que não
    // existe (CDC art. 30/31). Nenhum dos dois nasce numa refatoração sem este teste cair.
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute(
      "href",
      "/estacionamentos/aeroporto-de-guarulhos/talentos-park-aeroporto-recife",
    );
    expect(linha.querySelectorAll("button")).toHaveLength(0);
    expect(linha).not.toHaveTextContent(/R\$/);
    // Nenhum href absoluto: é assim que "link para fora" apareceria.
    expect(
      [...linha.querySelectorAll("[href]")].filter((el) =>
        /^https?:\/\//.test(el.getAttribute("href") ?? ""),
      ),
    ).toHaveLength(0);
  });

  it("a linha é clicável inteira, e o texto do link continua sendo só o nome", () => {
    vi.mocked(useDestinationBySlug).mockReturnValue({ data: dest(), isLoading: false } as never);
    vi.mocked(useDestinationProspects).mockReturnValue({ data: [prospect()] } as never);

    render();

    const linha = linhaMapeada();
    const link = linha.querySelector("a")!;
    // Área de clique esticada por `::after` sobre a linha, que precisa de `relative` no pai.
    // Sem isso o alvo vira o título, um retângulo pequeno demais para o polegar. Envolver a
    // linha toda num `<Link>` também resolveria o alvo, mas engoliria endereço, distância e
    // selo no texto âncora.
    expect(linha.className).toContain("relative");
    expect(link.className).toContain("after:absolute");
    expect(link.className).toContain("after:inset-0");
    expect(link).toHaveTextContent("Talentos Park");
    expect(link).not.toHaveTextContent(/Sem reserva online|R\. Projetada/);
  });

  it("destino sem hero usa a imagem da marca, não a paisagem de destinos", async () => {
    // Paisagem afirma geografia: a de destinos já teve litoral, e o card de Goiânia,
    // a 800 km do mar, mostrava mar. Sem hero, o card não pode sugerir lugar nenhum.
    vi.mocked(useDestinationBySlug).mockReturnValue({
      data: dest({ hero_image_url: null }),
      isLoading: false,
    } as never);
    vi.mocked(useDestinationProspects).mockReturnValue({ data: [] } as never);

    render();

    const og = await waitFor(() => {
      const m = document.head.querySelector('meta[property="og:image"]');
      expect(m).toBeTruthy();
      return m!.getAttribute("content")!;
    });
    expect(og).toContain("/og/marca-");
    expect(og).not.toContain("/og/destinos-");
  });

  it("mostra a nota do Google na linha mapeada, rotulada, e nada quando não há snapshot", () => {
    vi.mocked(useDestinationBySlug).mockReturnValue({ data: dest(), isLoading: false } as never);
    vi.mocked(useDestinationProspects).mockReturnValue({
      data: [
        prospect({
          google_rating: 4.4,
          google_rating_count: 137,
          google_fetched_at: diasAtras(3),
        }),
      ],
    } as never);

    const { unmount } = render();

    // Rotulada: sem o "no Google" a nota de lá se confunde com a da Movepark, que aqui é
    // impossível de existir (lote mapeado não gera reserva, e review exige booking).
    expect(linhaMapeada()).toHaveTextContent("4,4 · 137 avaliações· no Google");
    unmount();

    vi.mocked(useDestinationProspects).mockReturnValue({ data: [prospect()] } as never);
    render();
    expect(linhaMapeada()).not.toHaveTextContent(/avaliações/);
  });

  it("some com a nota do Google quando o snapshot passou dos 30 dias", () => {
    // Esta página prefere o dado do LOADER, que roda no build: o filtro de 30 dias da RPC
    // acontece uma vez, no dia do deploy, e o HTML sai congelado com o resultado dele. Sem o
    // guard na página, a versão construída no dia 0 seguia servindo a nota no dia 31, e o
    // `is_hidden` ligado no dia 1 nunca chegava nela. É o único caminho onde nem a policy,
    // nem o join da RPC, nem o hook do cliente alcançam.
    vi.mocked(useDestinationBySlug).mockReturnValue({ data: dest(), isLoading: false } as never);
    loaderData.mockReturnValue({
      destination: dest(),
      prospects: [
        prospect({
          google_rating: 4.4,
          google_rating_count: 137,
          google_fetched_at: diasAtras(31),
        }),
      ],
      units: [],
    });

    render();

    const linha = linhaMapeada();
    expect(linha).not.toHaveTextContent(/no Google/);
    expect(linha).not.toHaveTextContent(/avaliações/);
    // O resto da linha continua: endereço e distância são fato do lugar, não conteúdo do
    // Google sob prazo de cache.
    expect(linha).toHaveTextContent("Talentos Park");
  });

  it("usa o nome do terminal na distância quando o lote tem um cadastrado", () => {
    vi.mocked(useDestinationBySlug).mockReturnValue({ data: dest(), isLoading: false } as never);
    vi.mocked(useDestinationProspects).mockReturnValue({
      data: [prospect({ reference_name: "Terminal 2", distance_km: 0.4 })],
    } as never);

    render();

    // Aparece na linha e no resumo do topo da página, então a asserção escopa a linha.
    expect(linhaMapeada()).toHaveTextContent("400 m do Terminal 2");
  });

  it("sem parceiro medido e sem lote mapeado, a lista não existe (sem cabeçalho órfão)", () => {
    vi.mocked(useDestinationBySlug).mockReturnValue({ data: dest(), isLoading: false } as never);

    render();

    expect(
      screen.queryByRole("heading", { name: /Distância até o terminal/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryAllByTestId("proximity-row")).toHaveLength(0);
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
    expect(screen.queryByText(/estão logo abaixo/i)).not.toBeInTheDocument();
  });
});

/** Card no formato que o loader entrega (o mesmo `SearchResultItem` da busca). */
function unidade(over: Record<string, unknown> = {}) {
  return {
    id: "lpt1",
    operator: { slug: "abbapark", name: "Abbapark" },
    location: {
      id: "loc1",
      slug: "aeroporto-afonso-pena",
      name: "Aeroporto Afonso Pena",
      address: "Av. Rocha Pombo",
      latitude: -25.5,
      longitude: -49.1,
      distance_km: 1.8,
      nearest_terminal: null,
      review_avg: 4.6,
      review_count: 12,
      cover_image: null,
      high_demand_today: false,
    },
    parking_type: { code: "covered", name: "Vaga Coberta" },
    capacity: 80,
    availability: {
      remaining: null,
      sold_out: false,
      near_capacity: false,
      near_capacity_message: null,
    },
    price: { total: 30, old_price: null, per_day: 30, days: 1 },
    min_stay_days: null,
    amenities: [],
    ...over,
  };
}

function ldJson(): Record<string, unknown>[] {
  return [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) =>
    JSON.parse(s.textContent ?? "{}"),
  );
}

describe("lista de unidades no HTML do build", () => {
  // O bug medido em 13/08/2026: dist/destinos/aeroporto-afonso-pena.html tinha ZERO
  // ocorrências de "/p/", nenhum nome de unidade e 41 skeletons, porque a lista só existia
  // depois do fetch da Edge `search` no cliente. A página que disputa "estacionamento
  // aeroporto curitiba" (12.321 impressões no trimestre) chegava ao crawler sem oferta e
  // sem um único link interno.
  beforeEach(() => {
    vi.mocked(useDestinationBySlug).mockReturnValue({ data: undefined, isLoading: false } as never);
    vi.mocked(useSearchResults).mockReturnValue({ data: undefined, isLoading: true } as never);
  });

  it("renderiza os cards do loader antes de a busca responder", () => {
    loaderData.mockReturnValue({ destination: dest(), prospects: [], units: [unidade()] });

    render();

    // O card tem mais de um link para a mesma unidade (capa e corpo); basta um deles.
    const links = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href") ?? "")
      .filter((h) => h.startsWith("/p/"));
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]).toContain("/p/abbapark/aeroporto-afonso-pena/covered");
    expect(screen.getAllByText(/Abbapark/i).length).toBeGreaterThan(0);
  });

  it("emite ItemList com as unidades e com os lotes mapeados, na ordem visível", async () => {
    loaderData.mockReturnValue({
      destination: dest(),
      prospects: [
        {
          id: "p1",
          name: "Talentos Park",
          slug: "talentos-park",
          address: null,
          latitude: 0,
          longitude: 0,
          google_maps_url: null,
          amenities: [],
          description: null,
          distance_km: null,
          reference_name: null,
        },
      ],
      units: [unidade()],
    });

    render();

    const lista = await waitFor(() => {
      const achado = ldJson().find((s) => s["@type"] === "ItemList");
      expect(achado).toBeTruthy();
      return achado!;
    });
    const itens = lista.itemListElement as {
      position: number;
      item: { "@type": string; name: string; url: string };
    }[];
    expect(itens).toHaveLength(2);
    // Vendável primeiro, mapeado depois: é a mesma ordem da tela, e a separação é o produto
    // que o parceiro compra (ADR-010). A URL separa os dois em qualquer caso: vendável aponta
    // para `/p/...`, mapeado para `/estacionamentos/...`. O `@type` acompanha o que o item
    // consegue afirmar: sem matriz do motor não há oferta, e `Product` sem oferta é item
    // inválido, então quem não tem preço sai como `ParkingFacility`. Esta fixture não tem
    // matriz, por isso os dois vêm como lugar. O caso com matriz está logo abaixo.
    expect(itens[0].item["@type"]).toBe("ParkingFacility");
    expect(itens[0].item.name).toBe("Abbapark · Vaga Coberta");
    expect(itens[0].item.url).toContain("/p/abbapark/aeroporto-afonso-pena/covered");
    expect(itens[1].item["@type"]).toBe("ParkingFacility");
    expect(itens[1].item.name).toBe("Talentos Park");
    expect(itens[1].item.url).toContain("/estacionamentos/aeroporto-de-guarulhos/talentos-park");
  });

  it("sem matriz do motor, o item vendável descreve o lugar em vez de chutar preço", async () => {
    // A lista sai da VITRINE, não da matriz: se o motor não respondeu no build, o schema
    // continua descrevendo a tela. O que ele não pode é inventar um preço para ter `Offer`.
    //
    // Até 19/08/2026 esse item saía como `Product` sem `offers`, que é justamente o item que o
    // Search Console reprova ("Especifique offers, review ou aggregateRating"), e que derrubou
    // as dezessete páginas de unidade. Um item inválido invalida a lista junto, então o
    // degradado é `ParkingFacility`: descreve o lugar, não exige oferta e não chuta nada.
    loaderData.mockReturnValue({ destination: dest(), prospects: [], units: [unidade()] });

    render();

    const lista = await waitFor(() => {
      const achado = ldJson().find((s) => s["@type"] === "ItemList");
      expect(achado).toBeTruthy();
      return achado!;
    });
    const itens = lista.itemListElement as { item: Record<string, unknown> }[];
    expect(itens).toHaveLength(1);
    expect(itens[0].item.name).toBe("Abbapark · Vaga Coberta");
    expect(itens[0].item["@type"]).toBe("ParkingFacility");
    expect(itens[0].item.offers).toBeUndefined();
    expect(JSON.stringify(lista)).not.toContain("InStock");
  });

  it("com matriz, emite AggregateOffer e cala sobre disponibilidade no checkout externo", async () => {
    // ADR-009 na superfície do schema: `InStock` é promessa de vaga garantida, e quem
    // controla o estoque da unidade externa é o parceiro. O preço, esse pode: a tabela de
    // 1/7/15/30 diárias sai no HTML do build, e o schema espelha o que está na tela.
    loaderData.mockReturnValue({
      destination: dest(),
      prospects: [],
      units: [unidade()],
      generatedAt: "2026-08-17T00:00:00.000Z",
      priceDestination: {
        slug: "aeroporto-de-guarulhos",
        code: "GRU",
        name: "Aeroporto de Guarulhos",
        short_name: "Guarulhos (GRU)",
        type: "airport",
        city: "Guarulhos",
        state: "SP",
        units: [
          {
            company_slug: "abbapark",
            company_name: "Abbapark",
            location_slug: "aeroporto-afonso-pena",
            location_name: "Abbapark",
            parking_type_code: "covered",
            parking_type_name: "Vaga Coberta",
            checkout_mode: "external",
            review_avg: null,
            review_count: 0,
            has_shuttle: true,
            shuttle_minutes: null,
            distance_m: 900,
            min_stay_days: null,
            price_updated_at: "2026-08-16T00:00:00.000Z",
            prices: [
              { days: 1, total: 30, old_total: 40 },
              { days: 7, total: 175, old_total: 280 },
            ],
          },
        ],
      },
    });

    render();

    const lista = await waitFor(() => {
      const achado = ldJson().find((s) => s["@type"] === "ItemList");
      expect(achado).toBeTruthy();
      return achado!;
    });
    const itens = lista.itemListElement as {
      item: { offers?: Record<string, unknown> };
    }[];
    expect(itens[0].item.offers).toMatchObject({
      "@type": "AggregateOffer",
      priceCurrency: "BRL",
      lowPrice: "30.00",
      highPrice: "175.00",
      offerCount: 2,
    });
    expect(JSON.stringify(lista)).not.toContain("InStock");
  });

  it("destino sem unidade diz isso, em vez de mandar skeleton para o crawler", () => {
    // Recife e Navegantes: o loader já sabe no build que não há reserva online ali, então o
    // HTML tem que sair com a frase que explica, não com 41 caixas cinzas.
    loaderData.mockReturnValue({ destination: dest(), prospects: [], units: [] });

    render();

    expect(screen.getByText(/Ainda não temos reserva online/i)).toBeInTheDocument();
  });

  it("sem loader (navegação no cliente) o skeleton continua valendo", () => {
    loaderData.mockReturnValue(null);
    vi.mocked(useDestinationBySlug).mockReturnValue({ data: dest(), isLoading: false } as never);

    render();

    expect(screen.queryByText(/Ainda não temos reserva online/i)).not.toBeInTheDocument();
  });

  it("o link do card não leva data assada no build", () => {
    // `defaultWindow()` roda no build. Se from/to entrarem no href do HTML estático, todo
    // card publicado aponta para um D+7 do dia do deploy e envelhece até o próximo build.
    loaderData.mockReturnValue({ destination: dest(), prospects: [], units: [unidade()] });

    render();

    const hrefs = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href") ?? "")
      .filter((h) => h.startsWith("/p/"));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href).not.toContain("from=");
      expect(href).not.toContain("to=");
    }
  });
});

// O coração do card é o MESMO componente da /search e da home, e por muito tempo o destino
// passava `isSaved={false}` com um `onToggleSave` vazio: o botão aparecia, não salvava nada e
// não levava o anônimo pro login. A chave `VITE_CONSUMER_ACCOUNTS` esconde o coração no
// lançamento, mas ela volta, e quando voltar a divergência volta junto. Estes testes travam o
// contrato nos DOIS blocos de card da página, que é onde a regressão nasce.
describe("DestinoPage · favoritar (ligado no useSavedListings)", () => {
  const SUPABASE_URL = "http://localhost:54321";

  /** `useSearchResults` roda duas vezes na página: a lista (price_asc) e o bloco de mais bem
   *  avaliados (rating_desc). Aqui cada uma responde a sua, pra os cards não se confundirem. */
  function mockBuscas(lista: unknown[], topRated: unknown[] = []) {
    vi.mocked(useSearchResults).mockImplementation(((filters: { sort?: string } | null) =>
      filters?.sort === "rating_desc"
        ? { data: { results: topRated }, isLoading: false }
        : { data: { results: lista }, isLoading: false }) as never);
  }

  beforeEach(() => {
    localStorage.clear();
    navigate.mockClear();
    loaderData.mockReturnValue(null);
    vi.mocked(useDestinationBySlug).mockReturnValue({ data: dest(), isLoading: false } as never);
    mockBuscas([unidade()]);
  });

  it("anônimo: guarda a intenção e leva pro login, voltando pra esta página", async () => {
    render();

    await userEvent.click(screen.getByRole("button", { name: "Salvar nos favoritos" }));

    // A intenção fica no localStorage e é migrada pra conta no login (migratePendingSaves).
    expect(JSON.parse(localStorage.getItem("mp:saved") ?? "[]")).toEqual(["lpt1"]);
    expect(navigate).toHaveBeenCalledWith(
      `/login?next=${encodeURIComponent("/destinos/aeroporto-de-guarulhos")}`,
    );
  });

  it("cada card salva o seu tipo de vaga, e a vitrine é uma só", async () => {
    // O bloco "Mais bem avaliados" saiu no redesenho de 19/08/2026: ele repetia cards da
    // lista logo abaixo, e a nota já aparece dentro de cada card. Uma vitrine, um coração
    // por vaga.
    mockBuscas([unidade(), unidade({ id: "lpt2" })], []);

    render();

    const coracoes = screen.getAllByRole("button", { name: "Salvar nos favoritos" });
    expect(coracoes).toHaveLength(2);
    for (const botao of coracoes) await userEvent.click(botao);

    expect(new Set(JSON.parse(localStorage.getItem("mp:saved") ?? "[]"))).toEqual(
      new Set(["lpt1", "lpt2"]),
    );
  });

  it("logado: o coração reflete o que já está salvo", async () => {
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/profile_saved`, () =>
        HttpResponse.json([{ location_parking_type_id: "lpt1" }]),
      ),
    );

    render({ auth: mockAuth({ session: mockSession("customer", { userId: "u1" }) }) });

    expect(await screen.findByRole("button", { name: "Remover dos salvos" })).toBeInTheDocument();
  });

  it("logado: o clique grava em profile_saved, sem passar pelo login", async () => {
    const gravados: unknown[] = [];
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/profile_saved`, () => HttpResponse.json([])),
      http.post(`${SUPABASE_URL}/rest/v1/profile_saved`, async ({ request }) => {
        gravados.push(await request.json());
        return HttpResponse.json([], { status: 201 });
      }),
    );

    render({ auth: mockAuth({ session: mockSession("customer", { userId: "u1" }) }) });

    await userEvent.click(await screen.findByRole("button", { name: "Salvar nos favoritos" }));

    await waitFor(() =>
      expect(gravados).toEqual([{ profile_id: "u1", location_parking_type_id: "lpt1" }]),
    );
    expect(navigate).not.toHaveBeenCalled();
    expect(localStorage.getItem("mp:saved")).toBeNull();
  });
});

describe("DestinoPage · quanto custa e distância", () => {
  // A página disputa "estacionamento aeroporto <X>", que é consulta de PREÇO, e até
  // 17/08/2026 respondia em prosa: os valores só existiam dentro de uma resposta de FAQ e
  // não havia uma única <table> no HTML. O comparador concorrente responde em tabela.
  beforeEach(() => {
    vi.mocked(useDestinationBySlug).mockReturnValue({ data: undefined, isLoading: false } as never);
    vi.mocked(useSearchResults).mockReturnValue({ data: undefined, isLoading: true } as never);
  });

  function unidadePreco(over: Record<string, unknown> = {}) {
    return {
      company_slug: "virapark",
      company_name: "Virapark",
      location_slug: "virapark",
      location_name: "Virapark",
      parking_type_code: "covered",
      parking_type_name: "Vaga Coberta",
      checkout_mode: "external",
      review_avg: null,
      review_count: 0,
      has_shuttle: false,
      shuttle_minutes: null,
      distance_m: 1289,
      min_stay_days: null,
      price_updated_at: "2026-08-16T22:00:38.941Z",
      prices: [
        { days: 1, total: 40, old_total: 40 },
        { days: 7, total: 174.3, old_total: 280 },
        { days: 15, total: 373.5, old_total: 600 },
        { days: 30, total: 747, old_total: 1200 },
      ],
      ...over,
    };
  }

  function comPreco(
    units: Record<string, unknown>[] = [unidadePreco()],
    prospects: unknown[] = [],
  ) {
    return {
      destination: dest(),
      prospects,
      units: [],
      generatedAt: "2026-08-17T03:00:00.000Z",
      priceDestination: {
        slug: "aeroporto-de-guarulhos",
        code: "GRU",
        name: "Aeroporto Internacional de São Paulo / Guarulhos",
        short_name: "Guarulhos",
        type: "airport",
        city: "Guarulhos",
        state: "SP",
        units,
      },
    };
  }

  it("renderiza a tabela de preço por duração no HTML, com total e valor por diária", () => {
    loaderData.mockReturnValue(comPreco());

    render();

    expect(
      screen.getByRole("heading", { name: /Quanto custa estacionar no Aeroporto Guarulhos/i }),
    ).toBeInTheDocument();
    // Uma <table> de verdade, com cabeçalho por duração: é o formato que buscador e LLM
    // extraem, e o que a página não tinha.
    const tabela = screen.getByRole("table");
    expect(tabela).toBeInTheDocument();
    // O período abre em 7 diárias, a compra mais comum, e é o que a a11y enxerga.
    expect(screen.getByRole("columnheader", { name: "Total 7 diárias" })).toBeInTheDocument();
    // Os outros períodos continuam NO DOM, escondidos: a página é pré-renderizada num
    // período só, e desmontar os demais tiraria a maior parte dos preços do HTML que
    // buscador e crawler de IA leem.
    // Escondido por CLASSE, não pelo atributo `hidden`: o atributo perde para o
    // `tablet:table-cell` do layout responsivo e o período inativo reapareceria.
    expect(tabela.querySelector("th.hidden")).toBeTruthy();
    expect(tabela.textContent).toContain("Total 30 diárias");
    expect(screen.getAllByText(/R\$\s?747,00/).length).toBeGreaterThan(0);
    // Balcão riscado e economia: o que separa o preço da Movepark do preço de chegar sem
    // reservar. O concorrente não tem esse dado.
    expect(screen.getAllByText(/R\$\s?1\.200,00/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/38% menor online/).length).toBeGreaterThan(0);
  });

  it("responde 'quanto custa' antes da tabela e mede a queda por permanência", () => {
    loaderData.mockReturnValue(comPreco());

    render();

    expect(screen.getByText(/1 diária:/)).toBeInTheDocument();
    // A frase que o comparador concorrente escreve à mão (e erra): aqui sai do dado.
    expect(screen.getByText(/a diária cai de/i).textContent?.replace(/\s+/g, " ")).toMatch(
      /R\$\s?40,00 para R\$\s?24,90 \(38% menos\).*1 para 30 diárias/,
    );
  });

  it("data a tabela e aponta a fonte, sem prometer o checkout da Movepark", () => {
    // Procedência é o que sustenta citação em LLM. E a frase não pode dizer "valor cobrado
    // no checkout": em unidade com checkout externo quem cobra é o parceiro (ADR-009).
    loaderData.mockReturnValue(comPreco());

    render();

    const nota = screen.getByText(/Conferido no motor de reservas em/i);
    expect(nota.textContent).toMatch(/17\/08\/2026/);
    expect(nota.textContent).toMatch(/tabela de parceiro mais recente de 16\/08\/2026/);
    expect(document.body.textContent).not.toMatch(/cobrado no checkout/i);
    expect(screen.getByRole("link", { name: /Ver a tabela completa de preços/i })).toHaveAttribute(
      "href",
      "/precos/aeroporto-de-guarulhos",
    );
    expect(
      screen.getByRole("link", { name: /Como a Movepark apura preço e distância/i }),
    ).toHaveAttribute("href", "/metodologia");
  });

  it("sem parceiro precificado, a seção não existe (sem cabeçalho órfão)", () => {
    loaderData.mockReturnValue({ destination: dest(), prospects: [], units: [] });

    render();

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText(/Quanto custa estacionar/i)).not.toBeInTheDocument();
  });

  it("lista a distância medida, misturando parceiro e lote mapeado na mesma régua", () => {
    // A distância sai do PostGIS (ADR-001). O comparador concorrente digita à mão: para a
    // mesma unidade em Viracopos ele publica 4,5 km onde a geodésica mede 1,3 km.
    loaderData.mockReturnValue(
      comPreco(
        [
          unidadePreco(),
          unidadePreco({
            company_slug: "garageinn",
            company_name: "Garageinn",
            location_slug: "garageinn",
            parking_type_code: "uncovered",
            parking_type_name: "Vaga Descoberta",
            distance_m: 328,
          }),
        ],
        [
          {
            id: "p1",
            name: "Talentos Park",
            slug: "talentos-park",
            address: null,
            latitude: 0,
            longitude: 0,
            google_maps_url: null,
            amenities: [],
            description: null,
            distance_km: 1.2,
            reference_name: null,
          },
        ],
      ),
    );

    render();

    expect(
      screen.getByRole("heading", { name: /Distância até o terminal do Aeroporto Guarulhos/i }),
    ).toBeInTheDocument();
    const linhas = screen.getAllByTestId("proximity-row").map((li) => ({
      texto: (li.textContent ?? "").replace(/\s+/g, " ").trim(),
      kind: li.getAttribute("data-kind"),
    }));
    // Ordem por distância medida, com o lote mapeado no meio e marcado. É o ponto:
    // parceiro e mapeado na mesma régua, sem misturar o que dá para reservar.
    expect(linhas).toEqual([
      { texto: "GarageinnReserva online328 m do terminal", kind: "partner" },
      { texto: "Talentos ParkSem reserva online1,2 km do terminal", kind: "mapped" },
      { texto: "ViraparkReserva online1,3 km do terminal", kind: "partner" },
    ]);
  });

  it("a abertura anuncia o parceiro mais perto, não o lote mapeado mais perto", () => {
    // Depois da correção de coordenada de 19/08/2026 os dois parceiros do GRU ficaram mais
    // longe que vários lotes mapeados. A frase fica ao lado de "N estacionamentos com
    // reserva online", e ali um número de lote sem reserva se lê como se fosse de parceiro.
    loaderData.mockReturnValue(
      comPreco(
        [unidadePreco({ distance_m: 4549 })],
        [
          {
            id: "p1",
            name: "Decolar Park",
            slug: "decolar-park",
            address: null,
            latitude: 0,
            longitude: 0,
            google_maps_url: null,
            amenities: [],
            description: null,
            distance_km: 1.6,
            reference_name: null,
          },
        ],
      ),
    );

    render();

    expect(
      screen.getByText(/o parceiro mais perto fica a 4,5 km do terminal/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/o parceiro mais perto fica a 1,6 km/i)).not.toBeInTheDocument();
    // E a ficha rotula de quem é o número.
    expect(screen.getByText("Parceiro mais perto")).toBeInTheDocument();
  });

  it("a meta description leva número em vez de promessa genérica", async () => {
    loaderData.mockReturnValue(comPreco());

    render();

    await waitFor(() => {
      const meta =
        document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "";
      expect(meta).toMatch(/Diária a partir de R\$\s?40,00/);
      expect(meta).toMatch(/7 diárias por R\$\s?174,30/);
      expect(meta.length).toBeLessThanOrEqual(160);
    });
  });
});
