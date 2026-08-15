import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
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
  prospects: {
    "aeroporto-internacional-de-sao-paulo-guarulhos": [
      { name: "Talentos Park", slug: "talentos-park", distance_km: 1.2 },
    ],
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
  it("abre já calculada: tabela ranqueada de 7 diárias no primeiro destino", async () => {
    setup();
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Calculadora de estacionamento de aeroporto",
      }),
    ).toBeInTheDocument();
    const tabela = screen.getByRole("table");
    // Ranking: Aerovalet (111,30) na posição 01, com o selo de menor preço.
    expect(tabela.textContent).toContain("01");
    expect(tabela.textContent).toContain("menor preço");
    expect(tabela.textContent).toContain(formatBRL(15.9));
    expect(tabela.textContent).toContain(formatBRL(111.3));
    // Balcão de 7 diárias riscado.
    expect(tabela.textContent).toContain(formatBRL(133.56));
  });

  it("o parceiro tem Reservar em destaque; o lote mapeado fecha a lista sem preço", async () => {
    setup();
    const tabela = await screen.findByRole("table");
    const reservar = within(tabela).getAllByRole("link", { name: "Reservar" });
    expect(reservar[0]).toHaveAttribute("href", "/p/aerovalet/aeroporto-guarulhos/uncovered");
    // Talentos Park: mapeado pela Movepark, consulta no local, ficha própria.
    expect(tabela.textContent).toContain("Talentos Park");
    expect(tabela.textContent).toContain("consulte a tabela no local");
    expect(tabela.textContent).toContain("sem reserva online");
    const fichas = within(tabela).getAllByRole("link", { name: "Ver ficha" });
    expect(fichas[fichas.length - 1]).toHaveAttribute(
      "href",
      "/estacionamentos/aeroporto-internacional-de-sao-paulo-guarulhos/talentos-park",
    );
  });

  it("o atalho de 1 diária recalcula e mostra a estadia mínima como linha, sem preço inventado", async () => {
    setup();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "1 diária" }));
    expect(
      await screen.findByRole("heading", { name: "1 diária em Guarulhos (GRU)" }),
    ).toBeInTheDocument();
    const tabela = screen.getByRole("table");
    expect(tabela.textContent).toContain("Aeropark");
    expect(tabela.textContent).toContain("entrada a partir de 2 diárias");
  });

  it("diárias fora de 1 a 60 são recusadas com mensagem", async () => {
    setup();
    const user = userEvent.setup();
    const campo = await screen.findByLabelText("Diárias");
    await user.clear(campo);
    await user.type(campo, "99");
    await user.click(screen.getByRole("button", { name: "Calcular" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Informe de 1 a 60 diárias.");
  });

  it("sem dado, explica e aponta para a busca", async () => {
    setup(null);
    expect(await screen.findByText("Calculadora indisponível")).toBeInTheDocument();
  });
});
