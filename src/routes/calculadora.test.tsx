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
  it("abre já calculada: 7 diárias no primeiro destino, ranqueado", async () => {
    setup();
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Calculadora de estacionamento de aeroporto",
      }),
    ).toBeInTheDocument();
    const secao = screen
      .getByRole("heading", { name: "7 diárias em Guarulhos (GRU)" })
      .closest("section")!;
    // Ranking: Aerovalet (111,30) antes do Aeropark (132,30).
    const lista = within(secao as HTMLElement).getAllByRole("listitem");
    expect(lista[0].textContent).toContain("1. Aerovalet");
    expect(lista[0].textContent).toContain(formatBRL(111.3));
    expect(lista[0].textContent).toContain("menor preço");
  });

  it("o atalho de 1 diária recalcula na hora e explica a estadia mínima", async () => {
    setup();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "1 diária" }));
    expect(
      await screen.findByRole("heading", { name: "1 diária em Guarulhos (GRU)" }),
    ).toBeInTheDocument();
    // O Aeropark exige 2 diárias e sai da conta, com o motivo visível.
    expect(screen.getByText(/Fora desta conta por estadia mínima/)).toBeInTheDocument();
    expect(screen.getByText(/Aeropark \(a partir de 2 diárias\)/)).toBeInTheDocument();
  });

  it("cada resultado tem o botão Reservar apontando para a vaga", async () => {
    setup();
    const links = await screen.findAllByRole("link", { name: "Reservar" });
    expect(links[0]).toHaveAttribute("href", "/p/aerovalet/aeroporto-guarulhos/uncovered");
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
