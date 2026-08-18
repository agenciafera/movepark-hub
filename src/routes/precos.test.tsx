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

/**
 * `formatBRL` usa NBSP entre "R$" e o número, e o normalizador do Testing
 * Library colapsa isso para espaço comum. Sem normalizar o esperado também, a
 * comparação falha por um caractere invisível.
 */
const brl = (n: number) => formatBRL(n).replace(/\u00a0/g, " ");

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
  it("abre com o hero da página e o retrato em números, contando todos os aeroportos", async () => {
    setup();
    const h1 = await screen.findByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("O preço de cada estacionamento, sem consulta");

    const aeroportos = screen.getByText("Aeroportos no índice");
    expect(aeroportos.nextElementSibling).toHaveTextContent("3");
    // 1 unidade de parceiro + 2 lotes mapeados de Confins.
    const listados = screen.getByText("Estacionamentos listados");
    expect(listados.nextElementSibling).toHaveTextContent("3");
    // O NBSP do Intl entre "R$" e o número pede regex com \s.
    // 7 diárias é o período que abre a página: 111,30 / 7 = 15,90.
    expect(screen.getByText("Menor diária hoje, em 7 diárias").nextElementSibling).toHaveTextContent(
      /R\$\s15,90/,
    );
    expect(screen.getByText("até 17%")).toBeInTheDocument();
  });

  it("aeroporto com parceiro entra no grupo com reserva, com preço e o Reservar da vaga", async () => {
    setup();
    const grupo = (
      await screen.findByRole("heading", { level: 2, name: /Com reserva online/ })
    ).closest("section")!;
    const cartao = within(grupo).getByRole("heading", { level: 3, name: /Guarulhos \(GRU\)/ }).closest("section")!;

    expect(within(cartao).getByText(/ordenado pelo menor preço de 7 diárias/)).toBeInTheDocument();
    expect(within(cartao).getByText(/Aerovalet · Vaga Descoberta/)).toBeInTheDocument();
    expect(within(cartao).getByText(/Parceiro Movepark/)).toBeInTheDocument();
    // 7 diárias: 111,30 / 7 = 15,90 por diária, total 111,30.
    expect(within(cartao).getByText(brl(15.9))).toBeInTheDocument();
    expect(within(cartao).getByText(`total ${brl(111.3)}`)).toBeInTheDocument();

    const reservar = within(cartao).getByRole("link", { name: /Reservar/ });
    expect(reservar).toHaveAttribute("href", "/p/aerovalet/aeroporto-guarulhos/uncovered");
  });

  /**
   * A página é pré-renderizada num período só, e o seletor é do usuário. Se o
   * período inativo saísse do DOM, dois terços dos preços do índice não
   * existiriam no HTML que buscador e crawler de IA leem, justamente na página
   * que promete "o preço de cada estacionamento, sem consulta".
   */
  it("os três períodos ficam no HTML, e o seletor só troca qual deles aparece", async () => {
    setup();
    const cartao = (
      await screen.findByRole("heading", { level: 3, name: /Guarulhos \(GRU\)/ })
    ).closest("section")!;

    // Diária avulsa (18,90) e 15 diárias (223,50 / 15 = 14,90) estão no
    // documento mesmo com 7 diárias selecionado.
    expect(within(cartao).getByText(brl(18.9))).toBeInTheDocument();
    expect(within(cartao).getByText(`total ${brl(223.5)}`)).toBeInTheDocument();

    // Mas só o bloco do período ativo está visível.
    const totalDe7 = within(cartao).getByText(`total ${brl(111.3)}`);
    const totalDe15 = within(cartao).getByText(`total ${brl(223.5)}`);
    expect(totalDe7.closest("[hidden]")).toBeNull();
    expect(totalDe15.closest("[hidden]")).not.toBeNull();
  });

  it("o seletor de período troca o preço em destaque e o rótulo do grupo", async () => {
    setup();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Diária avulsa" }));

    const cartao = screen.getByRole("heading", { level: 3, name: /Guarulhos \(GRU\)/ }).closest("section")!;
    expect(within(cartao).getByText(/ordenado pelo menor preço de diária avulsa/)).toBeInTheDocument();
    // Agora o bloco de 7 diárias é que está escondido.
    expect(within(cartao).getByText(`total ${brl(111.3)}`).closest("[hidden]")).not.toBeNull();
    expect(screen.getByText("Menor diária hoje, em diária avulsa").nextElementSibling).toHaveTextContent(
      /R\$\s18,90/,
    );
  });

  it("aeroporto sem parceiro entra no grupo dos mapeados, sem preço e sem Reservar", async () => {
    setup();
    const grupo = (
      await screen.findByRole("heading", { level: 2, name: "Mapeados, sem reserva online" })
    ).closest("section")!;

    expect(within(grupo).getByRole("heading", { level: 3, name: "Confins (CNF)" })).toBeInTheDocument();
    expect(within(grupo).getByText(/Golden Park/)).toBeInTheDocument();
    expect(within(grupo).getByText(/Park do Aeroporto/)).toBeInTheDocument();
    expect(within(grupo).queryByRole("link", { name: /Reservar/ })).not.toBeInTheDocument();
    expect(within(grupo).getByRole("link", { name: "Ver os 2 no destino" })).toHaveAttribute(
      "href",
      "/destinos/aeroporto-de-confins",
    );
  });

  it("aeroporto sem nada ainda entra no grupo de mapeamento, apontando o seja-parceiro", async () => {
    setup();
    const grupo = (
      await screen.findByRole("heading", { level: 2, name: "Ainda mapeando" })
    ).closest("section")!;

    expect(within(grupo).getByRole("link", { name: "Santos Dumont (SDU)" })).toHaveAttribute(
      "href",
      "/destinos/aeroporto-santos-dumont",
    );
    expect(within(grupo).getByRole("link", { name: "Seja parceiro" })).toHaveAttribute(
      "href",
      "/seja-parceiro",
    );
  });

  it("a busca filtra os aeroportos, sem acento, e o limpar restaura", async () => {
    setup();
    const user = userEvent.setup();
    const busca = await screen.findByLabelText("Buscar aeroporto");
    await user.type(busca, "sao paulo");

    expect(screen.getByRole("heading", { level: 3, name: /Guarulhos \(GRU\)/ })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 3, name: "Confins (CNF)" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(screen.getByRole("heading", { level: 3, name: "Confins (CNF)" })).toBeInTheDocument();
  });

  it("o filtro de reserva online esconde os grupos sem parceiro precificado", async () => {
    setup();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("checkbox", { name: "Só com reserva online" }));

    expect(screen.getByRole("heading", { level: 3, name: /Guarulhos \(GRU\)/ })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 2, name: "Mapeados, sem reserva online" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2, name: "Ainda mapeando" })).not.toBeInTheDocument();
  });

  it("o filtro de estado corta pelo UF", async () => {
    setup();
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByLabelText("Estado"), "MG");

    expect(screen.getByRole("heading", { level: 3, name: "Confins (CNF)" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 3, name: /Guarulhos \(GRU\)/ })).not.toBeInTheDocument();
  });

  it("filtro sem resultado explica e oferece o limpar", async () => {
    setup();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Buscar aeroporto"), "galeao");

    expect(screen.getByText("Nenhum aeroporto com esse filtro")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Limpar filtros" })).toBeInTheDocument();
  });

  it("sem dado, explica e aponta para a busca", async () => {
    setup(null);
    expect(await screen.findByText("Índice de preços indisponível")).toBeInTheDocument();
  });
});
