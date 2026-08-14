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
  semPreco: [
    { slug: "aeroporto-de-confins", name: "Aeroporto de Confins", short_name: "Confins (CNF)" },
  ],
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

  it("cada destino vira uma tabela ordenada pela diária, com 7 e 15 dias em R$/dia", async () => {
    setup();
    expect(
      await screen.findByRole("heading", { level: 2, name: "Guarulhos (GRU)" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/ordenado pela diária mais baixa/)).toBeInTheDocument();
    const tabela = screen.getByRole("table");
    expect(tabela.textContent).toContain("7 dias (R$/dia)");
    expect(tabela.textContent).toContain("15 dias (R$/dia)");
    // 7 dias por R$ 111,30 = R$ 15,90 por dia, com o total logo abaixo.
    expect(tabela.textContent).toContain(formatBRL(15.9));
    expect(tabela.textContent).toContain(`total ${formatBRL(111.3)}`);
    // Não existe coluna de 30 dias no índice; ela vive na tabela completa.
    expect(tabela.textContent).not.toContain("30 dias");
  });

  it("o parceiro fica em destaque com o link de reserva da vaga", async () => {
    setup();
    expect(await screen.findByText("Parceiro Movepark")).toBeInTheDocument();
    const reservar = screen.getByRole("link", { name: "Reservar" });
    expect(reservar).toHaveAttribute("href", "/p/aerovalet/aeroporto-guarulhos/uncovered");
    const completa = screen.getAllByRole("link", { name: "Tabela completa" });
    expect(completa[0]).toHaveAttribute(
      "href",
      "/precos/aeroporto-internacional-de-sao-paulo-guarulhos",
    );
  });

  it("aeroporto sem parceiro precificado aparece na seção própria, linkando o destino", async () => {
    setup();
    expect(
      await screen.findByRole("heading", { name: "Aeroportos ainda sem reserva online" }),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Confins (CNF)" });
    expect(link).toHaveAttribute("href", "/destinos/aeroporto-de-confins");
  });

  it("sem dado, explica e aponta para a busca", async () => {
    setup(null);
    expect(await screen.findByText("Índice de preços indisponível")).toBeInTheDocument();
  });
});
