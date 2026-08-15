import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  aeroportos: [
    {
      slug: "aeroporto-internacional-de-sao-paulo-guarulhos",
      code: "GRU",
      name: "Aeroporto Internacional de São Paulo Guarulhos",
      short_name: "Guarulhos (GRU)",
      city: "Guarulhos",
      state: "SP",
    },
    {
      slug: "aeroporto-de-confins",
      code: "CNF",
      name: "Aeroporto de Confins",
      short_name: "Confins (CNF)",
      city: "Confins",
      state: "MG",
    },
    {
      slug: "aeroporto-santos-dumont",
      code: "SDU",
      name: "Aeroporto Santos Dumont",
      short_name: "Santos Dumont (SDU)",
      city: "Rio de Janeiro",
      state: "RJ",
    },
  ],
  prospects: {
    "aeroporto-de-confins": [
      { name: "Golden Park", slug: "golden-park", distance_km: 1.4 },
      { name: "Park do Aeroporto", slug: "park-do-aeroporto", distance_km: 2.1 },
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
  it("abre com o h1 do índice e o retrato em números, contando todos os aeroportos", async () => {
    setup();
    expect(
      await screen.findByRole("heading", { level: 1, name: "Índice de preços de estacionamento" }),
    ).toBeInTheDocument();
    const aeroportosTile = screen.getByText("Aeroportos no índice");
    expect(aeroportosTile.nextElementSibling).toHaveTextContent("3");
    // 1 unidade de parceiro + 2 lotes mapeados de Confins.
    const listadosTile = screen.getByText("Estacionamentos listados");
    expect(listadosTile.nextElementSibling).toHaveTextContent("3");
    // O NBSP do Intl entre "R$" e o número pede regex com \s.
    expect(screen.getAllByText(/R\$\s18,90/).length).toBeGreaterThan(0);
    expect(screen.getByText("até 17%")).toBeInTheDocument();
  });

  it("aeroporto com parceiro tem tabela com preços e o botão Reservar da vaga", async () => {
    setup();
    const secao = (
      await screen.findByRole("heading", { level: 2, name: "Guarulhos (GRU)" })
    ).closest("section")!;
    expect(within(secao).getByText(/ordenado pela diária mais baixa/)).toBeInTheDocument();
    const tabela = within(secao).getByRole("table");
    expect(tabela.textContent).toContain("7 dias (R$/dia)");
    expect(tabela.textContent).toContain(formatBRL(15.9));
    expect(tabela.textContent).toContain(`total ${formatBRL(111.3)}`);
    expect(tabela.textContent).not.toContain("30 dias");
    expect(within(secao).getByText("Parceiro Movepark")).toBeInTheDocument();
    const reservar = within(secao).getByRole("link", { name: "Reservar" });
    expect(reservar).toHaveAttribute("href", "/p/aerovalet/aeroporto-guarulhos/uncovered");
  });

  it("aeroporto sem parceiro entra com os lotes mapeados, sem preço e sem Reservar", async () => {
    setup();
    const secao = (
      await screen.findByRole("heading", { level: 2, name: "Confins (CNF)" })
    ).closest("section")!;
    expect(within(secao).getByText("Golden Park")).toBeInTheDocument();
    expect(
      within(secao).getAllByText(/mapeado pela Movepark · sem reserva online/).length,
    ).toBe(2);
    expect(within(secao).getAllByText("consulte a tabela no local").length).toBe(2);
    expect(within(secao).queryByRole("link", { name: "Reservar" })).not.toBeInTheDocument();
    const ficha = within(secao).getAllByRole("link", { name: "Ver ficha" })[0];
    expect(ficha).toHaveAttribute("href", "/estacionamentos/aeroporto-de-confins/golden-park");
  });

  it("aeroporto sem nada ainda aparece na página, apontando o seja-parceiro", async () => {
    setup();
    const secao = (
      await screen.findByRole("heading", { level: 2, name: "Santos Dumont (SDU)" })
    ).closest("section")!;
    expect(within(secao).getByText(/Ainda estamos mapeando/)).toBeInTheDocument();
    expect(within(secao).getByRole("link", { name: "Seja parceiro Movepark" })).toHaveAttribute(
      "href",
      "/seja-parceiro",
    );
  });

  it("a busca da lateral filtra os aeroportos, sem acento, e o limpar restaura", async () => {
    setup();
    const user = userEvent.setup();
    const busca = await screen.findByLabelText("Buscar aeroporto");
    await user.type(busca, "sao paulo");
    expect(screen.getByRole("heading", { level: 2, name: "Guarulhos (GRU)" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 2, name: "Confins (CNF)" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("1 de 3 aeroportos").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(screen.getByRole("heading", { level: 2, name: "Confins (CNF)" })).toBeInTheDocument();
  });

  it("o filtro de reserva online esconde aeroporto sem parceiro precificado", async () => {
    setup();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("checkbox", { name: "Só com reserva online" }));
    expect(screen.getByRole("heading", { level: 2, name: "Guarulhos (GRU)" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 2, name: "Confins (CNF)" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 2, name: "Santos Dumont (SDU)" }),
    ).not.toBeInTheDocument();
  });

  it("o filtro de estado corta pelo UF", async () => {
    setup();
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByLabelText("Estado"), "MG");
    expect(screen.getByRole("heading", { level: 2, name: "Confins (CNF)" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 2, name: "Guarulhos (GRU)" }),
    ).not.toBeInTheDocument();
  });

  it("filtro sem resultado explica e oferece o limpar", async () => {
    setup();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Buscar aeroporto"), "galeao");
    expect(screen.getByText("Nenhum aeroporto com esse filtro.")).toBeInTheDocument();
  });

  it("sem dado, explica e aponta para a busca", async () => {
    setup(null);
    expect(await screen.findByText("Índice de preços indisponível")).toBeInTheDocument();
  });
});
