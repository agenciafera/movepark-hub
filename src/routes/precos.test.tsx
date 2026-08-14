import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import PrecosPage, { type PrecosIndexData } from "@/routes/precos";
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

const DATA: PrecosIndexData = {
  generatedAt: "2026-08-14T15:00:00Z",
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

function setup(data: PrecosIndexData | null = DATA) {
  const router = createMemoryRouter(
    [{ path: "/precos", element: <PrecosPage />, loader: () => data }],
    { initialEntries: ["/precos"] },
  );
  return render(
    <HelmetProvider>
      <RouterProvider router={router} />
    </HelmetProvider>,
  );
}

describe("PrecosPage", () => {
  it("abre com o h1 do índice e o retrato em números", async () => {
    setup();
    expect(
      await screen.findByRole("heading", { level: 1, name: "Índice de preços de estacionamento" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Menor diária hoje")).toBeInTheDocument();
    // O NBSP do Intl entre "R$" e o número pede regex com \s.
    expect(screen.getAllByText(/R\$\s18,90/).length).toBeGreaterThan(0);
    expect(screen.getByText("até 17%")).toBeInTheDocument();
  });

  it("cada destino vira um cartão com o menor preço por duração e o link da tabela", async () => {
    setup();
    const card = await screen.findByRole("link", { name: /Guarulhos \(GRU\)/ });
    expect(card).toHaveAttribute(
      "href",
      "/precos/aeroporto-internacional-de-sao-paulo-guarulhos",
    );
    expect(card.textContent).toContain("30 diárias");
    expect(card.textContent).toContain(formatBRL(447));
  });

  it("sem dado, explica e aponta para a busca", async () => {
    setup(null);
    expect(await screen.findByText("Índice de preços indisponível")).toBeInTheDocument();
  });
});
