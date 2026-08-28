import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import PrecosDestinoPage, { type PrecosDestinoData } from "@/routes/precos-destino";
import { formatBRL } from "@/lib/format";
import type { PriceUnit } from "@/features/price-index/priceIndex.logic";

const DIAS = [1, 7, 15, 30];

function unit(overrides: Partial<PriceUnit>): PriceUnit {
  return {
    company_slug: "aerovalet",
    public_path: "/estacionamentos/aeroporto-guarulhos/aerovalet",
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
    photo: "/Estacionamentos/aerovalet/guarulhos/capa.webp",
    prices: [
      { days: 1, total: 18.9, old_total: 22.68 },
      { days: 7, total: 111.3, old_total: 133.56 },
      { days: 15, total: 223.5, old_total: 268.2 },
      { days: 30, total: 447, old_total: 536.4 },
    ],
    ...overrides,
  };
}

const DATA: PrecosDestinoData = {
  days: DIAS,
  destination: {
    slug: "aeroporto-internacional-de-sao-paulo-guarulhos",
    public_slug: "aeroporto-internacional-de-sao-paulo-guarulhos",
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
  others: [{ slug: "aeroporto-de-congonhas", name: "Aeroporto de Congonhas", short_name: "Congonhas (CGH)" }],
  generatedAt: "2026-08-14T15:00:00Z",
};

function setup(data: PrecosDestinoData | null = DATA) {
  const router = createMemoryRouter(
    [
      {
        path: "/estacionamentos/:destino/precos",
        element: <PrecosDestinoPage />,
        loader: () => data,
      },
    ],
    { initialEntries: ["/estacionamentos/aeroporto-guarulhos/precos"] },
  );
  return render(
    <HelmetProvider>
      <RouterProvider router={router} />
    </HelmetProvider>,
  );
}

describe("PrecosDestinoPage", () => {
  it("abre com o h1 do destino e a resposta rápida com o menor preço por duração", async () => {
    setup();
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Preços de estacionamento em Guarulhos (GRU)",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Resposta rápida" })).toBeInTheDocument();
    // O menor 30 dias é o Aerovalet (R$ 447,00); a frase precisa dizer quem pratica.
    const resposta = screen.getByRole("heading", { name: "Resposta rápida" }).closest("section")!;
    expect(resposta.textContent).toContain("30 diárias");
    expect(resposta.textContent).toContain("Aerovalet");
  });

  it("a tabela sai no HTML com balcão riscado e economia calculada", async () => {
    setup();
    const tabela = await screen.findByRole("table");
    // Balcão do Aerovalet em 7 diárias, riscado.
    expect(tabela.textContent).toContain(formatBRL(158.76));
    // Economia de 17% do Aerovalet na diária (18,90 contra 22,68).
    expect(tabela.textContent).toContain("17% menor online");
  });

  it("célula abaixo da estadia mínima explica a regra em vez de esconder a linha", async () => {
    setup();
    expect(await screen.findByText("entrada a partir de 2 diárias")).toBeInTheDocument();
  });

  it("cada linha tem o link Reservar apontando para a página da vaga", async () => {
    setup();
    const links = await screen.findAllByRole("link", { name: "Reservar" });
    expect(links[0]).toHaveAttribute(
      "href",
      "/estacionamentos/aeroporto-guarulhos/aerovalet",
    );
  });

  it("cruza com os preços dos outros destinos", async () => {
    setup();
    const link = await screen.findByRole("link", { name: "Congonhas (CGH)" });
    expect(link).toHaveAttribute("href", "/estacionamentos/aeroporto-de-congonhas/precos");
  });

  it("destino sem preço explica em vez de quebrar", async () => {
    setup(null);
    expect(await screen.findByText("Sem tabela de preços por aqui")).toBeInTheDocument();
  });

  it("publica image absoluta no Product, que o Google pede", async () => {
    setup();
    await screen.findByRole("heading", { level: 1 });

    const lista = [...document.querySelectorAll('script[type="application/ld+json"]')]
      .map((s) => JSON.parse(s.textContent ?? "{}"))
      .find((d) => d["@type"] === "ItemList");
    const itens = lista.itemListElement as { item: { image?: string[] } }[];
    expect(itens[0].item.image).toEqual([
      "https://movepark.co/Estacionamentos/aerovalet/guarulhos/capa.webp",
    ]);
    expect(itens.every((i) => i.item.image)).toBe(true);
  });

  it("deixa fora do JSON-LD a linha sem preço em nenhuma duração", async () => {
    // `Math.min()` de lista vazia é `Infinity`, e Product sem offers válida o Google reprova
    // como item inválido, o que derruba a lista inteira. A linha segue visível na tabela.
    setup({
      ...DATA,
      destination: {
        ...DATA.destination,
        units: [
          unit({}),
          unit({
            company_slug: "sem-preco",
            company_name: "Sem Preço",
            prices: DIAS.map((days) => ({ days, total: null, old_total: null })),
          }),
        ],
      },
    });
    await screen.findByRole("heading", { level: 1 });

    const lista = [...document.querySelectorAll('script[type="application/ld+json"]')]
      .map((s) => JSON.parse(s.textContent ?? "{}"))
      .find((d) => d["@type"] === "ItemList");
    expect(lista.itemListElement).toHaveLength(1);
    expect(JSON.stringify(lista)).not.toContain("Infinity");
    expect(JSON.stringify(lista)).not.toContain("Sem Preço");
  });
});
