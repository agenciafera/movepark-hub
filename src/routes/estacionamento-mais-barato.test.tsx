import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import EstacionamentoMaisBaratoPage, {
  type MaisBaratoData,
} from "@/routes/estacionamento-mais-barato";

const DATA: MaisBaratoData = {
  destino: {
    name: "Aeroporto de Viracopos",
    short_name: "Viracopos (VCP)",
    slug: "aeroporto-de-viracopos",
    code: "VCP",
  },
  unitCount: 4,
  generatedAt: "2026-09-16T12:00:00Z",
  linhas: [
    {
      days: 1,
      vencedor: {
        label: "Virapark",
        parkingTypeName: "Vaga Descoberta",
        total: 40,
        perDay: 40,
        path: "/p/virapark/matriz/uncovered",
        photo: "/Estacionamentos/virapark/capa.webp",
        key: "virapark/matriz/uncovered",
      },
      vice: {
        label: "Garageinn",
        parkingTypeName: "Vaga Descoberta",
        total: 45,
        perDay: 45,
        path: "/p/garageinn/matriz/uncovered",
        photo: null,
        key: "garageinn/matriz/uncovered",
      },
    },
    {
      days: 7,
      vencedor: {
        label: "Virapark",
        parkingTypeName: "Vaga Coberta",
        total: 174.3,
        perDay: 24.9,
        path: "/p/virapark/matriz/covered",
        photo: "/Estacionamentos/virapark/capa.webp",
        key: "virapark/matriz/covered",
      },
      vice: null,
    },
  ],
};

function setup(data: MaisBaratoData = DATA) {
  const router = createMemoryRouter(
    [
      {
        path: "/estacionamento-mais-barato/:slug",
        element: <EstacionamentoMaisBaratoPage />,
        loader: () => data,
      },
    ],
    { initialEntries: ["/estacionamento-mais-barato/aeroporto-de-viracopos"] },
  );
  return render(
    <HelmetProvider>
      <RouterProvider router={router} />
    </HelmetProvider>,
  );
}

describe("EstacionamentoMaisBaratoPage", () => {
  it("o h1 é a pergunta e a resposta direta nomeia o vencedor com o preço", async () => {
    setup();
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Qual é o estacionamento mais barato no Aeroporto de Viracopos?",
      }),
    ).toBeInTheDocument();
    // O mesmo texto sai na resposta direta e na pergunta rápida espelhada (ADR-002).
    expect(
      screen.getAllByText(
        /a diária avulsa mais barata perto do Aeroporto de Viracopos custa R\$ 40,00, no Virapark/,
      ).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("a tabela traz vencedor com link e a segunda opção", async () => {
    setup();
    await screen.findByRole("heading", { name: "Menor preço por duração" });
    const vencedor = screen.getAllByRole("link", { name: "Virapark" })[0];
    expect(vencedor).toHaveAttribute("href", "/p/virapark/matriz/uncovered");
    expect(screen.getByText(/Garageinn, R\$ 45,00/)).toBeInTheDocument();
    expect(screen.getByText("sem segunda opção")).toBeInTheDocument();
  });

  it("o FAQPage espelha as perguntas rápidas visíveis", async () => {
    setup();
    await screen.findByRole("heading", { name: "Perguntas rápidas" });
    expect(
      screen.getByRole("heading", {
        name: "Qual é o estacionamento mais barato no Aeroporto de Viracopos?",
        level: 3,
      }),
    ).toBeInTheDocument();
    await waitFor(() => {
      const blocos = [...document.querySelectorAll('script[type="application/ld+json"]')].map(
        (s) => JSON.parse(s.textContent ?? "{}"),
      );
      const faqPage = blocos.find((b) => b["@type"] === "FAQPage");
      expect(faqPage?.mainEntity?.[0]?.name).toBe(
        "Qual é o estacionamento mais barato no Aeroporto de Viracopos?",
      );
    });
  });

  it("tem os dois CTAs: reservar e comparar preços", async () => {
    setup();
    const reservar = await screen.findByRole("link", { name: "Reservar vaga em Viracopos" });
    expect(reservar).toHaveAttribute("href", "/estacionamentos/aeroporto-de-viracopos");
    expect(screen.getByRole("link", { name: "Comparar preços em Viracopos" })).toHaveAttribute(
      "href",
      "/estacionamentos/aeroporto-de-viracopos/precos",
    );
  });

  /** A praça completa: mapeados (inclusive o oficial) entram por link, sem preço. */
  it("lista os lotes mapeados da região com link pra ficha, sem preço", async () => {
    setup({
      ...DATA,
      mapeados: [{ name: "Estacionamento Oficial de Viracopos (Estapar)", slug: "estacionamento-oficial-viracopos-estapar" }],
    } as MaisBaratoData);
    expect(
      await screen.findByRole("heading", { name: "E os outros estacionamentos da região?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Estacionamento Oficial de Viracopos (Estapar)" }),
    ).toHaveAttribute(
      "href",
      "/estacionamentos/aeroporto-de-viracopos/estacionamento-oficial-viracopos-estapar",
    );
  });

  it("sem lote mapeado, a seção da região não aparece", async () => {
    setup();
    await screen.findByRole("heading", { name: "Menor preço por duração" });
    expect(
      screen.queryByRole("heading", { name: "E os outros estacionamentos da região?" }),
    ).not.toBeInTheDocument();
  });

  it("sem preço no destino, explica e aponta pro índice", async () => {
    setup(null);
    expect(await screen.findByText("Ainda não temos preços neste destino")).toBeInTheDocument();
  });

  /**
   * A página responde com número, e número só vale para máquina quando sai estruturado.
   * O `Product` é a vaga, não a linha: a mesma unidade vence em mais de uma duração.
   */
  it("emite Product com AggregateOffer por vaga do ranking, sem repetir a unidade", async () => {
    setup();
    await screen.findByRole("heading", { level: 1 });

    const lista = await waitFor(() => {
      const achado = [...document.querySelectorAll('script[type="application/ld+json"]')]
        .map((s) => JSON.parse(s.textContent ?? "{}"))
        .find(
          (d) =>
            d["@type"] === "ItemList" &&
            d.itemListElement?.[0]?.item?.["@type"] === "Product",
        );
      expect(achado).toBeDefined();
      return achado as {
        numberOfItems: number;
        itemListElement: {
          item: {
            name: string;
            image?: string[];
            offers: { lowPrice: string; offerCount: number; priceValidUntil?: string };
          };
        }[];
      };
    });

    // Virapark descoberta, Garageinn descoberta e Virapark coberta: três vagas, não quatro
    // linhas de ranking.
    expect(lista.numberOfItems).toBe(3);
    const nomes = lista.itemListElement.map((e) => e.item.name);
    expect(nomes).toEqual([
      "Virapark · Vaga Descoberta",
      "Garageinn · Vaga Descoberta",
      "Virapark · Vaga Coberta",
    ]);

    const vencedor = lista.itemListElement[0].item;
    expect(vencedor.offers.lowPrice).toBe("40.00");
    expect(vencedor.offers.offerCount).toBe(1);
    expect(vencedor.offers.priceValidUntil).toBe("2026-12-15");
    expect(vencedor.image).toEqual(["https://movepark.co/Estacionamentos/virapark/capa.webp"]);
  });
});
