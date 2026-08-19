import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { HelmetProvider } from "react-helmet-async";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/utils";
import ListingPage from "./listing";

/**
 * Trava do ADR-009: bloco de promessa não renderiza sem consultar capacidade.
 *
 * O teste é de RENDER, e não de leitura do código, porque é o que o cliente vê que vincula a
 * Movepark. Se alguém puser um selo de vaga garantida direto na casca, o caso da unidade
 * externa quebra aqui, mesmo que o código pareça correto.
 */

const BASE = import.meta.env.VITE_SUPABASE_URL;
const ROTA =
  "/p/virapark/virapark/covered?from=2026-08-12T16:00:00.000Z&to=2026-08-21T16:00:00.000Z";
const PATH = "/p/:operatorSlug/:locationSlug/:parkingTypeCode";
const URL_SAIDA =
  "https://virapark.movepark.co/virapark/vaga-coberta?utm_source=movepark&utm_medium=organic&utm_campaign=afiliado-movepark";

function linha(
  checkoutMode: "hub" | "external",
  basePrice = 40,
  go2park = false,
  go2parkWhatsapp: string | null = null,
  photos: string[] = [],
) {
  return {
    id: "lpt-1",
    capacity: 100,
    is_active: true,
    external_checkout_url: checkoutMode === "external" ? URL_SAIDA : null,
    location: {
      id: "loc-1",
      slug: "virapark",
      name: "Virapark",
      address: "Antiga Rod. Santos Dumont, Km 64",
      phone: null,
      email: null,
      notice: null,
      has_notice: false,
      directions_text: null,
      shuttle_frequency_minutes: null,
      shuttle_to_terminal_minutes: null,
      reservation_policy: null,
      checkout_mode: checkoutMode,
      go2park_enabled: go2park,
      go2park_whatsapp: go2parkWhatsapp,
      timezone: "America/Sao_Paulo",
      latitude: -23,
      longitude: -47,
      google_place_id: null,
      has_pcd_config: false,
      has_passenger_quantity: false,
      review_avg: 5,
      review_count: 1,
      photos,
      company: {
        id: "c-1",
        slug: "virapark",
        name: "Virapark",
        legal_name: null,
        created_at: "2025-08-01T12:00:00Z",
      },
      amenities: [],
    },
    company_parking_type: {
      base_price: basePrice,
      parking_type: { code: "covered", name: "Vaga Coberta", description: null },
    },
  };
}

function montaPagina(
  checkoutMode: "hub" | "external",
  basePrice?: number,
  go2park = false,
  go2parkWhatsapp: string | null = null,
  photos: string[] = [],
  /** Total por duração que o motor devolve. Sem isto, o motor não responde e não há faixa. */
  precoPorDuracao?: Record<number, number | null>,
) {
  server.use(
    http.get(`${BASE}/rest/v1/location_parking_type`, () =>
      HttpResponse.json([linha(checkoutMode, basePrice, go2park, go2parkWhatsapp, photos)]),
    ),
  );
  if (precoPorDuracao) {
    server.use(
      http.post(`${BASE}/rest/v1/rpc/simulate_price`, async ({ request }) => {
        const body = (await request.json()) as { p_days: number };
        return HttpResponse.json({ price: precoPorDuracao[body.p_days] ?? null });
      }),
    );
  }
  // A página emite <Helmet> (meta + JSON-LD), que precisa do provider para montar.
  return renderWithProviders(
    <HelmetProvider>
      <ListingPage />
    </HelmetProvider>,
    { route: ROTA, path: PATH },
  );
}

/** Promessas de transação, pelo texto que o cliente lê. */
const PROMESSAS = [
  /Vaga garantida/i,
  /Cancelamento grátis/i,
  /Garantia Movepark/i,
  /Política de cancelamento/i,
  /Preço travado/i,
];

/**
 * Tudo que a página PUBLICA sem mostrar: meta description e os blocos de JSON-LD.
 *
 * Existe porque o gate acima só olhava texto visível, e por isso passou um ano sem ver que o
 * schema das unidades externas prometia "Cancelamento grátis até 24h", nota de avaliação,
 * `availability: InStock` e `price: 0.00`. Promessa publicada vincula do mesmo jeito, e é esta
 * versão que o Google indexa e a IA cita.
 */
function publicado(): string {
  const meta = document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "";
  const schemas = [...document.querySelectorAll('script[type="application/ld+json"]')].map(
    (s) => s.textContent ?? "",
  );
  return [meta, ...schemas].join(" ");
}

describe("single da unidade PRÓPRIA", () => {
  it("mantém as promessas, porque quem cumpre é a Movepark", async () => {
    montaPagina("hub");
    await screen.findAllByText(/Virapark/i);

    for (const promessa of PROMESSAS) {
      await waitFor(() => expect(screen.getAllByText(promessa).length).toBeGreaterThan(0));
    }
  });

  it("não declara responsabilidade de terceiro", async () => {
    montaPagina("hub");
    await screen.findAllByText(/Virapark/i);
    expect(screen.queryByText(/não se aplicam a esta reserva/i)).not.toBeInTheDocument();
    expect(screen.queryAllByTestId("external-checkout-cta")).toHaveLength(0);
  });

  it("publica as promessas no schema, porque aqui elas são verdade", async () => {
    // Contraparte do gate: capacidade que some onde não vale tem que sobreviver onde vale, senão
    // o conserto vira apagão de SEO na unidade própria, que é a maioria da base.
    montaPagina("hub");
    await screen.findAllByText(/Virapark/i);
    await waitFor(() => expect(publicado()).toMatch(/Virapark/));

    const fora = publicado();
    expect(fora).toMatch(/Cancelamento grátis até 24h/);
    expect(fora).toMatch(/aggregateRating/);
    expect(fora).toMatch(/InStock/);
    expect(fora).toMatch(/"price":"40.00"/);
    expect(fora).not.toMatch(/A reserva é feita e administrada por/);
  });
});

describe("single da unidade EXTERNA", () => {
  it("mantém datas, preço e a tabela por duração", async () => {
    // O preço é informação da unidade (espelhado da tabela do parceiro) e é o que faz a
    // pessoa decidir. Some o que a Movepark não cumpre, não o que ela mostra.
    montaPagina("external");
    await screen.findAllByText(/Virapark/i);
    expect(screen.getAllByText(/Ver preços por duração/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Total/i).length).toBeGreaterThan(0);
  });

  it("nenhuma Tarifa entra no total sem ninguém escolher", async () => {
    // Regressão: o seletor sumiu mas o default `flex` continuava somando o acréscimo, e o
    // total ficava R$ 12,90 acima do preço do estacionamento numa unidade onde a Movepark
    // não vende Tarifa nenhuma.
    montaPagina("external");
    await screen.findAllByText(/Virapark/i);
    expect(screen.queryAllByText(/Tarifa Flex/i)).toHaveLength(0);
    expect(screen.queryAllByText(/Tarifa Superflex/i)).toHaveLength(0);
  });

  it("não vende tarifa nem pede cupom", async () => {
    montaPagina("external");
    await screen.findAllByText(/Virapark/i);
    expect(screen.queryAllByText(/Escolha sua tarifa/i)).toHaveLength(0);
    expect(screen.queryAllByPlaceholderText(/Cupom de desconto/i)).toHaveLength(0);
  });

  it("nenhuma promessa de transação sobrevive", async () => {
    montaPagina("external");
    await screen.findAllByText(/Virapark/i);

    for (const promessa of PROMESSAS) {
      expect(screen.queryAllByText(promessa)).toHaveLength(0);
    }
  });

  it("declara quem responde pela reserva, no lugar das promessas", async () => {
    montaPagina("external");
    expect(
      await screen.findByText(/A reserva desta unidade é feita e administrada por Virapark/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/As garantias da Movepark não se aplicam a esta reserva/i),
    ).toBeInTheDocument();
  });

  it("o CTA leva para o parceiro com a marcação de afiliado", async () => {
    montaPagina("external");
    // A página monta o card duas vezes (mobile e aside do desktop); no DOM de teste os dois
    // existem, porque quem esconde um deles é CSS.
    const [cta] = await screen.findAllByTestId("external-checkout-cta");
    expect(cta).toHaveAttribute("href", expect.stringContaining("utm_campaign=afiliado-movepark"));
    expect(cta).toHaveAttribute("href", expect.stringContaining("virapark.movepark.co"));
  });

  it("não mostra nota nem bloco de avaliação, mesmo com avaliação histórica", async () => {
    // A linha tem review_count = 1 e review_avg = 5, de reserva feita durante os testes.
    montaPagina("external");
    await screen.findAllByText(/Virapark/i);
    expect(screen.queryByText(/avaliaç/i)).not.toBeInTheDocument();
  });

  it("nenhuma promessa sobrevive no que a página publica sem mostrar", async () => {
    montaPagina("external");
    await screen.findAllByText(/Virapark/i);
    // Espera o Helmet montar antes de afirmar ausência, senão o teste passa por estar vazio.
    await waitFor(() => expect(publicado()).toMatch(/Virapark/));

    const fora = publicado();
    expect(fora).not.toMatch(/Cancelamento grátis/i);
    expect(fora).not.toMatch(/aggregateRating/);
    expect(fora).not.toMatch(/Nota 5,0 de 5/);
    expect(fora).not.toMatch(/InStock/);
  });

  it("publica de quem é a reserva, no lugar das promessas", async () => {
    montaPagina("external");
    await screen.findAllByText(/Virapark/i);
    await waitFor(() =>
      expect(publicado()).toMatch(/A reserva é feita e administrada por Virapark\./),
    );
  });

  it("não publica preço zero quando a tabela vem espelhada do parceiro", async () => {
    // base_price = 0 é o estado real das unidades espelhadas: a tabela vem do parceiro e o campo
    // do catálogo nunca foi preenchido.
    montaPagina("external", 0);
    await screen.findAllByText(/Virapark/i);
    await waitFor(() => expect(publicado()).toMatch(/Virapark/));

    const fora = publicado();
    expect(fora).not.toMatch(/R\$\s0,00/);
    expect(fora).not.toMatch(/"price":"0.00"/);
  });

  it("não publica Product sem offers, review nem aggregateRating", async () => {
    // O que sobrou do conserto de 12/08: sem preço e sem nota, o `Product` saía só com nome,
    // descrição e foto, e o Search Console reprovava as dezessete páginas do sitemap com
    // "Especifique offers, review ou aggregateRating". Nó sem nada que qualifique não é emitido.
    montaPagina("external", 0);
    await screen.findAllByText(/Virapark/i);
    await waitFor(() => expect(publicado()).toMatch(/Virapark/));

    const fora = publicado();
    expect(fora).not.toMatch(/"@type":"Product"/);
    // O que descreve o lugar continua publicado: o nó do lugar não exige oferta.
    expect(fora).toMatch(/"ParkingFacility"/);
  });

  it('com o motor respondendo, publica AggregateOffer e mostra o "a partir de"', async () => {
    // base_price = 0 não quer dizer vaga sem preço: quer dizer campo de catálogo não
    // preenchido. O motor sabe o preço, e é ele que decide o que a tela mostra e o que o
    // schema afirma, com o MESMO número nos dois lugares (ADR-009).
    montaPagina("external", 0, false, null, [], { 1: null, 7: 188.3, 15: 388.5, 30: 777 });
    await screen.findAllByText(/Virapark/i);
    await waitFor(() => expect(publicado()).toMatch(/AggregateOffer/));

    const fora = publicado();
    expect(fora).toMatch(/"lowPrice":"25.90"/);
    expect(fora).toMatch(/"highPrice":"26.90"/);
    // A vaga continua sendo do parceiro: preço sim, estoque não.
    expect(fora).not.toMatch(/InStock/);
    // E a tela diz o mesmo número que o schema.
    expect(await screen.findAllByText(/A partir de R\$\s?25,90/)).not.toHaveLength(0);
  });

  it("publica image absoluta, porque caminho relativo do legado o buscador não resolve", async () => {
    montaPagina("external", 0, false, null, ["/Estacionamentos/virapark/virapark_001.webp"]);
    await screen.findAllByText(/Virapark/i);
    await waitFor(() => expect(publicado()).toMatch(/Virapark/));

    expect(publicado()).toMatch(
      /https:\/\/movepark\.co\/Estacionamentos\/virapark\/virapark_001\.webp/,
    );
  });
});

/**
 * Contraparte do gate: FATO da unidade não pode ser apagado junto com as promessas.
 *
 * O rastreio ao vivo da van (Go2Park) descreve o serviço do lote, não a transação, e as três
 * unidades que o têm hoje são justamente de checkout externo. Se um dia alguém passar o bloco
 * por `getLocationCapabilities`, o diferencial some exatamente de quem o tem, e este caso quebra.
 */
describe("Go2Park na single", () => {
  it("aparece na unidade EXTERNA, porque a van tem rastreio independente de onde a reserva fecha", async () => {
    montaPagina("external", undefined, true);
    await screen.findAllByText(/Virapark/i);

    await waitFor(() => expect(screen.getByTestId("go2park-credit")).toBeInTheDocument());
    expect(screen.getByTestId("go2park-chip")).toBeInTheDocument();
    expect(screen.getByText(/sem baixar app/)).toBeInTheDocument();
  });

  it("some na unidade sem contrato, mesmo sendo unidade própria", async () => {
    montaPagina("hub");
    await screen.findAllByText(/Virapark/i);

    expect(screen.queryByTestId("go2park-credit")).not.toBeInTheDocument();
    expect(screen.queryByTestId("go2park-chip")).not.toBeInTheDocument();
  });
});

/**
 * O contato da van fecha o ciclo: o bloco mostra o diferencial, e o CTA é o que faz o cliente
 * chegar na van no dia. O número é por unidade e vem do painel da Go2Park, então enquanto não foi
 * copiado o bloco existe sem botão. Um botão sem número certo mandaria quem acabou de pousar para
 * o telefone de outro estacionamento.
 */
describe("Contato da van na single", () => {
  it("com número, oferece salvar o contato", async () => {
    montaPagina("external", undefined, true, "+5519988013420");
    await screen.findAllByText(/Virapark/i);

    await waitFor(() => expect(screen.getByTestId("go2park-cta")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /WhatsApp/ })).toHaveAttribute(
      "href",
      expect.stringContaining("wa.me/5519988013420"),
    );
  });

  it("sem número, o crédito fica e o CTA não", async () => {
    montaPagina("external", undefined, true);
    await screen.findAllByText(/Virapark/i);

    await waitFor(() => expect(screen.getByTestId("go2park-credit")).toBeInTheDocument());
    expect(screen.queryByTestId("go2park-cta")).not.toBeInTheDocument();
  });
});
