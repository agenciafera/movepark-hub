import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HelmetProvider } from "react-helmet-async";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import UberOuEstacionamentoPage, {
  type ComparadorAppData,
} from "@/routes/uber-ou-estacionamento";
import { formatBRL } from "@/lib/format";
import type { PriceUnit } from "@/features/price-index/priceIndex.logic";

const DIAS = [1, 7, 15, 30];

const UNIT: PriceUnit = {
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
};

const DATA: ComparadorAppData = {
  generatedAt: "2026-08-15T12:00:00Z",
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
        units: [UNIT],
      },
    ],
  },
};

function setup(data: ComparadorAppData | null = DATA) {
  const router = createMemoryRouter(
    [
      {
        path: "/uber-ou-estacionamento-aeroporto",
        element: <UberOuEstacionamentoPage />,
        loader: () => data,
      },
    ],
    { initialEntries: ["/uber-ou-estacionamento-aeroporto"] },
  );
  return render(
    <HelmetProvider>
      <RouterProvider router={router} />
    </HelmetProvider>,
  );
}

describe("UberOuEstacionamentoPage", () => {
  it("abre já comparada: 7 diárias, 25 km, com o veredito no HTML", async () => {
    setup();
    expect(
      await screen.findByRole("heading", { level: 1, name: "De app ou de carro para o aeroporto?" }),
    ).toBeInTheDocument();
    // App a 25 km sem dinâmica: 2,50 + 41,25 + 17,50 = 61,25 por corrida; 122,50 ida e volta.
    const cardApp = screen.getByRole("heading", { name: "De app, ida e volta" }).closest("div")!;
    expect(cardApp.textContent).toContain(formatBRL(122.5));
    // Estacionar 7 diárias: R$ 111,30 no Aerovalet. Vence e leva o destaque.
    const cardCarro = screen
      .getByRole("heading", { name: "De carro, estacionando" })
      .closest("div")!;
    expect(cardCarro.textContent).toContain(formatBRL(111.3));
    expect(cardCarro.className).toContain("border-mp-primary");
    expect(screen.getByText(/Estacionando, você economiza/).textContent).toContain(
      formatBRL(11.2),
    );
  });

  it("informa o break-even do trajeto", async () => {
    setup();
    // 1 diária (18,90) já é mais barata que as duas corridas (122,50).
    expect(await screen.findByText(/estacionar sai mais barato a partir de 1 diária/)).toBeInTheDocument();
  });

  it("a corrida manual sobrepõe a estimativa e pode virar o jogo", async () => {
    setup();
    const user = userEvent.setup();
    const campo = await screen.findByLabelText("Valor da corrida de ida");
    await user.type(campo, "40");
    // 2 × 40 = 80 < 111,30: o app vence e a página diz isso na cara.
    expect(await screen.findByText(/o app sai/)).toBeInTheDocument();
    const cardApp = screen.getByRole("heading", { name: "De app, ida e volta" }).closest("div")!;
    expect(cardApp.textContent).toContain(formatBRL(80));
    expect(cardApp.textContent).toContain("valor que você informou");
  });

  it("o combustível entra na conta do carro quando marcado", async () => {
    setup();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("checkbox", { name: /Somar combustível/ }));
    const cardCarro = screen
      .getByRole("heading", { name: "De carro, estacionando" })
      .closest("div")!;
    expect(cardCarro.textContent).toContain("combustível");
  });

  it("a metodologia declara a fórmula, a fonte e as marcas de terceiros", async () => {
    setup();
    const secao = (
      await screen.findByRole("heading", { name: "Como esta conta é feita" })
    ).closest("section")!;
    expect(secao.textContent).toContain("30 km/h");
    expect(within(secao as HTMLElement).getByRole("link", { name: /Calculauto/ })).toHaveAttribute(
      "href",
      expect.stringContaining("calculauto"),
    );
    expect(secao.textContent).toContain("marcas dos seus respectivos donos");
  });

  it("sem dado, explica e aponta para a busca", async () => {
    setup(null);
    expect(await screen.findByText("Comparador indisponível")).toBeInTheDocument();
  });
});
