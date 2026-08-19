import { describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HelmetProvider } from "react-helmet-async";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import CalculadoraPage, { type CalculadoraData } from "@/routes/calculadora";
import { formatBRL } from "@/lib/format";
import type { PriceUnit } from "@/features/price-index/priceIndex.logic";

const DIAS = [1, 7, 15, 30];

function unit(overrides: Partial<PriceUnit>): PriceUnit {
  return {
    company_slug: "aerovalet",
    company_name: "Aerovalet",
    location_slug: "aeroporto-guarulhos",
    location_name: "Aeroporto de Guarulhos",
    parking_type_code: "uncovered",
    parking_type_name: "Vaga Descoberta",
    checkout_mode: "external",
    review_avg: null,
    review_count: 0,
    has_shuttle: false,
    shuttle_minutes: null,
    distance_m: 477,
    min_stay_days: null,
    price_updated_at: "2026-08-14T10:00:00Z",
    prices: [
      { days: 1, total: 18.9, old_total: 22.68 },
      { days: 7, total: 111.3, old_total: 133.56 },
      { days: 15, total: 223.5, old_total: 268.2 },
      { days: 30, total: 447, old_total: 536.4 },
    ],
    ...overrides,
  };
}

const DATA: CalculadoraData = {
  generatedAt: "2026-08-14T15:00:00Z",
  catalogo: [
    {
      slug: "aeroporto-internacional-de-sao-paulo-guarulhos",
      name: "Aeroporto Internacional de São Paulo Guarulhos",
      short_name: "Guarulhos (GRU)",
      state: "SP",
    },
    {
      slug: "aeroporto-de-confins",
      name: "Aeroporto de Confins",
      short_name: "Confins (CNF)",
      state: "MG",
    },
    {
      slug: "aeroporto-santos-dumont",
      name: "Aeroporto Santos Dumont",
      short_name: "Santos Dumont (SDU)",
      state: "RJ",
    },
  ],
  prospects: {
    "aeroporto-internacional-de-sao-paulo-guarulhos": [
      { name: "Talentos Park", slug: "talentos-park", distance_km: 1.2 },
    ],
    "aeroporto-de-confins": [{ name: "Golden Park", slug: "golden-park", distance_km: 1.4 }],
  },
  data: {
    days: DIAS,
    destinations: [
      {
        slug: "aeroporto-internacional-de-sao-paulo-guarulhos",
        code: "GRU",
        name: "Aeroporto Internacional de São Paulo Guarulhos",
        short_name: "Guarulhos (GRU)",
        type: "airport",
        city: "Guarulhos",
        state: "SP",
        units: [
          unit({}),
          unit({
            company_slug: "aeropark",
            company_name: "Aeropark",
            min_stay_days: 2,
            prices: [
              { days: 1, total: null, old_total: null },
              { days: 7, total: 132.3, old_total: 158.76 },
              { days: 15, total: 268.5, old_total: 322.2 },
              { days: 30, total: 537, old_total: 644.4 },
            ],
          }),
        ],
      },
    ],
  },
};

function setup(data: CalculadoraData | null = DATA) {
  const router = createMemoryRouter(
    [
      {
        path: "/calculadora-estacionamento-aeroporto",
        element: <CalculadoraPage />,
        loader: () => data,
      },
    ],
    { initialEntries: ["/calculadora-estacionamento-aeroporto"] },
  );
  return render(
    <HelmetProvider>
      <RouterProvider router={router} />
    </HelmetProvider>,
  );
}

describe("CalculadoraPage", () => {
  it("abre já calculada: painel de melhor preço e tabela ranqueada de 7 diárias", async () => {
    setup();
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Saber quanto custa estacionar no aeroporto leva 10 segundos",
      }),
    ).toBeInTheDocument();
    // O veredito responde antes da lista: melhor preço, economia contra o balcão
    // e preço por diária, tudo do parceiro mais barato.
    const painel = screen.getByText("Melhor preço").closest("div")!.parentElement!;
    expect(painel.textContent).toContain(formatBRL(111.3));
    expect(painel.textContent).toContain(formatBRL(22.26)); // 133,56 - 111,30
    expect(painel.textContent).toContain(formatBRL(15.9));
    expect(screen.getByRole("link", { name: "Reservar essa vaga" })).toHaveAttribute(
      "href",
      "/p/aerovalet/aeroporto-guarulhos/uncovered",
    );

    const tabela = screen.getByRole("table", { name: /Preço de/ });
    // Ranking: Aerovalet (111,30) na posição 01, com o selo de menor preço.
    expect(tabela.textContent).toContain("01");
    expect(tabela.textContent).toContain("menor preço");
    expect(tabela.textContent).toContain(formatBRL(111.3));
    // Balcão de 7 diárias riscado.
    expect(tabela.textContent).toContain(formatBRL(133.56));
  });

  it("o parceiro tem Reservar na tabela; o lote mapeado fica na gaveta, sem preço", async () => {
    setup();
    const tabela = await screen.findByRole("table", { name: /Preço de/ });
    const reservar = within(tabela).getAllByRole("link", { name: "Reservar" });
    expect(reservar[0]).toHaveAttribute("href", "/p/aerovalet/aeroporto-guarulhos/uncovered");
    // O lote sem contrato não polui o ranking de quem tem preço (ADR-010).
    expect(tabela.textContent).not.toContain("Talentos Park");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /1 sem reserva online/ }));
    expect(screen.getByText("Talentos Park")).toBeInTheDocument();
    expect(
      screen.getByText("Mapeados pela nossa equipe. O preço é a tabela do local."),
    ).toBeInTheDocument();
    const fichas = screen.getAllByRole("link", { name: "Ver ficha" });
    expect(fichas[fichas.length - 1]).toHaveAttribute(
      "href",
      "/estacionamentos/aeroporto-internacional-de-sao-paulo-guarulhos/talentos-park",
    );
  });

  it("o atalho de 1 diária recalcula e mostra a estadia mínima como linha, sem preço inventado", async () => {
    setup();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "1 diária" }));
    const tabela = await screen.findByRole("table", { name: /Preço de/ });
    await waitFor(() => expect(tabela.textContent).toContain("entrada a partir de 2 diárias"));
    expect(tabela.textContent).toContain("Aeropark");
    expect(tabela.textContent).toContain(formatBRL(18.9));
  });

  it("diárias fora de 1 a 60 são recusadas com mensagem, sem precisar de botão", async () => {
    setup();
    const user = userEvent.setup();
    const campo = await screen.findByLabelText("Diárias");
    await user.clear(campo);
    await user.type(campo, "99");
    // O cálculo é ao vivo (debounce curto); a recusa aparece sozinha.
    expect(await screen.findByRole("alert")).toHaveTextContent("Informe de 1 a 60 diárias.");
  });

  it("destino sem parceiro entra no select e abre os mapeados sozinho, com o seja-parceiro", async () => {
    setup();
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByLabelText("Destino"), "aeroporto-de-confins");
    expect(
      await screen.findByRole("heading", {
        name: "Todas as opções em Confins (CNF), da mais barata",
      }),
    ).toBeInTheDocument();
    // Sem ranking, a gaveta deixa de ser gaveta: a lista já vem aberta.
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("Golden Park")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Reservar" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Seja parceiro Movepark" })).toHaveAttribute(
      "href",
      "/seja-parceiro",
    );
  });

  it("destino sem parceiro e sem lote mapeado explica o mapeamento", async () => {
    setup();
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByLabelText("Destino"), "aeroporto-santos-dumont");
    expect(
      await screen.findByRole("heading", {
        name: "Todas as opções em Santos Dumont (SDU), da mais barata",
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Ainda estamos mapeando/).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "página do destino" })).toHaveAttribute(
      "href",
      "/destinos/aeroporto-santos-dumont",
    );
  });

  it("abre no modo estacionamento: a pergunta aparece e a conta de app fica guardada", async () => {
    setup();
    expect(await screen.findByText("O que você quer calcular?")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Preço da vaga/ })).toBeChecked();
    // Sem o modo app, nem os campos nem a seção de comparação existem.
    expect(screen.queryByLabelText("Distância em km")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "De app ou de carro?" })).not.toBeInTheDocument();
    expect(screen.getByRole("table", { name: /Preço de/ })).toBeInTheDocument();
  });

  it("escolher o modo app habilita a calculadora específica e esconde o ranking", async () => {
    setup();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("radio", { name: /Carro ou app/ }));
    // App a 25 km sem dinâmica: 2 corridas de 61,25 = 122,50; estacionar 7 diárias = 111,30.
    const veredito = await screen.findByText("Estacionar sai mais barato");
    const painel = veredito.closest("div")!.parentElement!;
    expect(painel.textContent).toContain(formatBRL(11.2));
    expect(painel.textContent).toContain(formatBRL(122.5));
    expect(painel.textContent).toContain(formatBRL(111.3));
    expect(painel.textContent).toContain("estacionar sai mais barato a partir de 1 diária");
    expect(screen.getByLabelText("Distância em km")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("quando estacionar vence, o veredito recomenda o parceiro com as datas da conta", async () => {
    setup();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("radio", { name: /Carro ou app/ }));
    // Estacionar vence (111,30 contra 122,50): o CTA já leva a duração calculada.
    const cta = await screen.findByRole("link", { name: "Reservar a vaga mais barata" });
    const href = cta.getAttribute("href")!;
    expect(href).toContain("/p/aerovalet/aeroporto-guarulhos/uncovered?");
    expect(href).toContain("from=");
    expect(href).toContain("to=");
    expect(screen.getByText(/entrada amanhã às 22h/)).toBeInTheDocument();
  });

  it("a corrida manual sobrepõe a estimativa e pode virar o jogo", async () => {
    setup();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("radio", { name: /Carro ou app/ }));
    const campo = await screen.findByLabelText("Valor da corrida de ida");
    await user.type(campo, "40");
    // 2 × 40 = 80 < 111,30: o app vence e a página diz isso na cara.
    expect(await screen.findByText("Ir de app sai mais barato")).toBeInTheDocument();
    expect(screen.getByText("Ida e volta, no valor que você informou")).toBeInTheDocument();
  });

  it("o comparativo com o balcão mostra preço, e a promessa fica de fora na unidade externa", async () => {
    setup();
    // A unidade mais barata da fixture é `checkout_mode: "external"`: quem cumpre
    // cancelamento e vaga garantida ali é o parceiro, não a Movepark (ADR-009).
    const tabela = await screen.findByRole("table", { name: /Reserva online contra tarifa/ });
    expect(tabela.textContent).toContain("Preço por diária");
    expect(tabela.textContent).toContain(formatBRL(15.9));
    expect(tabela.textContent).toContain(formatBRL(19.08)); // 133,56 / 7 diárias
    expect(tabela.textContent).toContain(formatBRL(111.3));
    expect(tabela.textContent).toContain(formatBRL(133.56));
    expect(tabela.textContent).not.toContain("Cancelamento");
    expect(tabela.textContent).not.toContain("Vaga");
    // O selo verde fica ao lado do ícone, então o texto vem partido em nós.
    expect(screen.getByText(/de economia/).textContent).toContain(formatBRL(22.26));
  });

  it("na unidade que fecha no Hub, o comparativo ganha as linhas de promessa", async () => {
    const noHub: CalculadoraData = {
      ...DATA,
      data: {
        ...DATA.data,
        destinations: [{ ...DATA.data.destinations[0], units: [unit({ checkout_mode: "hub" })] }],
      },
    };
    setup(noHub);
    const tabela = await screen.findByRole("table", { name: /Reserva online contra tarifa/ });
    expect(tabela.textContent).toContain("Reservada com o parceiro escolhido");
    expect(tabela.textContent).toContain("Grátis, conforme a Tarifa");
    expect(tabela.textContent).toContain("Sujeita a lotação");
  });

  it("a lista de destinos agrupa por região e recalcula ao escolher", async () => {
    setup();
    const user = userEvent.setup();
    expect(await screen.findByText("Sudeste")).toBeInTheDocument();
    // GRU e CNF são Sudeste; SDU também. Nenhuma região vazia vira cabeçalho.
    expect(screen.queryByText("Norte")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confins (CNF)" }));
    expect(
      await screen.findByRole("heading", {
        name: "Todas as opções em Confins (CNF), da mais barata",
      }),
    ).toBeInTheDocument();
  });

  it("sem dado, explica e aponta para a busca", async () => {
    setup(null);
    expect(await screen.findByText("Calculadora indisponível")).toBeInTheDocument();
  });
});
