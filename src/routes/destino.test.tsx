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

  it("o card mapeado é clicável inteiro, e o texto do link continua sendo só o nome", () => {
    vi.mocked(useDestinationBySlug).mockReturnValue({ data: dest(), isLoading: false } as never);
    vi.mocked(useDestinationProspects).mockReturnValue({ data: [prospect()] } as never);

    render();

    const card = screen.getByTestId("prospect-card");
    const link = card.querySelector("a")!;
    // Área de clique esticada por `::after` sobre o card, que precisa de `relative` no pai.
    // Sem isso o alvo vira o título, um retângulo pequeno demais para o polegar, enquanto o
    // card vendável logo acima é clicável inteiro. Envolver o card todo num `<Link>` também
    // resolveria o alvo, mas engoliria endereço, distância e selo no texto âncora.
    expect(card.className).toContain("relative");
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
    availability: { remaining: null, sold_out: false, near_capacity: false, near_capacity_message: null },
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
        { id: "p1", name: "Talentos Park", slug: "talentos-park", address: null, latitude: 0, longitude: 0, google_maps_url: null, amenities: [], description: null, distance_km: null, reference_name: null },
      ],
      units: [unidade()],
    });

    render();

    const lista = await waitFor(() => {
      const achado = ldJson().find((s) => s["@type"] === "ItemList");
      expect(achado).toBeTruthy();
      return achado!;
    });
    const itens = lista.itemListElement as { position: number; name: string; url: string }[];
    expect(itens).toHaveLength(2);
    // Vendável primeiro, mapeado depois: é a mesma ordem da tela, e a separação é o produto
    // que o parceiro compra (ADR-010).
    expect(itens[0].name).toBe("Abbapark · Vaga Coberta");
    expect(itens[0].url).toContain("/p/abbapark/aeroporto-afonso-pena/covered");
    expect(itens[1].name).toBe("Talentos Park");
    expect(itens[1].url).toContain("/estacionamentos/aeroporto-de-guarulhos/talentos-park");
  });

  it("não afirma preço nem disponibilidade no dado estruturado", async () => {
    // ADR-009: num HTML congelado, "resta 1 vaga" ou um preço de janela vira mentira na hora
    // seguinte. O ItemList carrega só nome e URL.
    loaderData.mockReturnValue({ destination: dest(), prospects: [], units: [unidade()] });

    render();

    const lista = await waitFor(() => {
      const achado = ldJson().find((s) => s["@type"] === "ItemList");
      expect(achado).toBeTruthy();
      return achado!;
    });
    const bruto = JSON.stringify(lista);
    expect(bruto).not.toContain("offers");
    expect(bruto).not.toContain("InStock");
    expect(bruto).not.toContain("price");
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

  it("os dois blocos de card estão ligados, não só a lista", async () => {
    mockBuscas([unidade()], [unidade({ id: "lpt-top" })]);

    render();

    const coracoes = screen.getAllByRole("button", { name: "Salvar nos favoritos" });
    expect(coracoes).toHaveLength(2);
    for (const botao of coracoes) await userEvent.click(botao);

    // Cada card salva o SEU tipo de vaga: o do bloco curado e o da lista.
    expect(new Set(JSON.parse(localStorage.getItem("mp:saved") ?? "[]"))).toEqual(
      new Set(["lpt-top", "lpt1"]),
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
