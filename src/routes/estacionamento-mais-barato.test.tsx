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
    await screen.findByRole("heading", { name: "Menor preço com reserva pela Movepark" });
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
      const blocos = [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) =>
        JSON.parse(s.textContent ?? "{}"),
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

  /** A praça completa: lote ainda sem preço pesquisado (inclusive o oficial) entra por link. */
  it("lista os lotes mapeados sem preço com link pra ficha", async () => {
    setup({
      ...DATA,
      lotes: [
        {
          name: "Estapar",
          public_name: "Estacionamento Oficial de Viracopos (Estapar)",
          slug: "estapar-legado",
          public_slug: "estacionamento-oficial-viracopos-estapar",
          researched_daily_brl: null,
          researched_weekly_brl: null,
          researched_biweekly_brl: null,
          researched_monthly_brl: null,
          researched_at: null,
        },
      ],
    });
    expect(
      await screen.findByRole("heading", { name: "E os outros estacionamentos da região?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Estacionamento Oficial de Viracopos (Estapar)" }),
    ).toHaveAttribute(
      "href",
      "/estacionamentos/aeroporto-de-viracopos/estacionamento-oficial-viracopos-estapar",
    );
    // Sem preço pesquisado, a tabela do mercado não aparece.
    expect(
      screen.queryByRole("heading", { name: "Sem reserva online pela Movepark" }),
    ).not.toBeInTheDocument();
  });

  it("sem lote mapeado, a seção da região não aparece", async () => {
    setup();
    await screen.findByRole("heading", { name: "Menor preço com reserva pela Movepark" });
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
        .find((d) => Array.isArray(d) && d[0]?.["@type"] === "Product");
      expect(achado).toBeDefined();
      return achado as {
        name: string;
        image?: string[];
        offers: { lowPrice: string; offerCount: number; priceValidUntil?: string };
      }[];
    });

    // Virapark descoberta, Garageinn descoberta e Virapark coberta: três vagas, não quatro
    // linhas de ranking.
    expect(lista).toHaveLength(3);
    const nomes = lista.map((p) => p.name);
    expect(nomes).toEqual([
      "Virapark · Vaga Descoberta",
      "Garageinn · Vaga Descoberta",
      "Virapark · Vaga Coberta",
    ]);

    const vencedor = lista[0];
    expect(vencedor.offers.lowPrice).toBe("40.00");
    expect(vencedor.offers.offerCount).toBe(1);
    expect(vencedor.offers.priceValidUntil).toBe("2026-12-15");
    expect(vencedor.image).toEqual(["https://movepark.co/Estacionamentos/virapark/capa.webp"]);
  });

  /**
   * Conteúdo 39: em Confins o parceiro único (BePark, R$ 45,00) virava "a diária mais barata
   * perto do aeroporto", enquanto o mercado cobrava R$ 20,00. A resposta tem que ser verdade
   * para o mercado e idêntica no texto visível e no FAQPage (ADR-002).
   */
  describe("praça de parceiro único com mercado mais barato", () => {
    const hoje = new Date().toISOString().slice(0, 10);
    const lote = (name: string, d1: number, d7: number) => ({
      name,
      public_name: `${name} - Estacionamento Aeroporto Confins`,
      slug: name.toLowerCase().replace(/\s+/g, "-"),
      public_slug: name.toLowerCase().replace(/\s+/g, "-"),
      researched_daily_brl: d1,
      researched_weekly_brl: d7,
      researched_biweekly_brl: null,
      researched_monthly_brl: null,
      researched_at: hoje,
    });
    const CONFINS: MaisBaratoData = {
      destino: {
        name: "Aeroporto de Confins",
        short_name: "Confins (CNF)",
        slug: "aeroporto-confins",
        code: "CNF",
      },
      unitCount: 1,
      generatedAt: "2026-10-06T12:00:00Z",
      linhas: [1, 7].map((days) => ({
        days,
        vencedor: {
          label: "BePark",
          parkingTypeName: "Vaga Coberta",
          total: days === 1 ? 45 : 200,
          perDay: days === 1 ? 45 : 200 / 7,
          path: "/estacionamentos/aeroporto-confins/bepark",
          photo: null,
          key: "bepark/coberta",
        },
        vice: null,
      })),
      lotes: [lote("AeroPark Confins", 20, 119), lote("Central Park", 22, 140)],
    };
    const norm = (t: string | null | undefined) => (t ?? "").replace(/\u00a0/g, " ");

    it("a resposta nomeia o menor preço do mercado e o menor com reserva", async () => {
      setup(CONFINS);
      await screen.findByRole("heading", { level: 1 });
      const pagina = norm(document.body.textContent);
      expect(pagina).toContain(
        "a diária avulsa mais barata perto do Aeroporto de Confins é R$ 20,00, no AeroPark Confins",
      );
      expect(pagina).toContain("Com reserva pela Movepark, a menor diária é R$ 45,00, no BePark");
      expect(pagina).not.toMatch(/mais barata perto do Aeroporto de Confins custa R\$ 45,00/);
      expect(pagina).toContain("1 com reserva pela Movepark");
      expect(pagina).toContain("2 sem reserva online, com preço pesquisado");
      // A description cita o menor do mercado, mas sem prometer reserva por ele (ADR-009).
      await waitFor(() => {
        const meta = norm(
          document.querySelector('meta[name="description"]')?.getAttribute("content"),
        );
        expect(meta).toContain("A partir de R$ 20,00 a diária.");
        expect(meta).not.toContain("reserve");
      });
    });

    it("o FAQPage traz exatamente o texto visível", async () => {
      setup(CONFINS);
      await screen.findByRole("heading", { name: "Perguntas rápidas" });
      await waitFor(() => {
        const faqPage = [...document.querySelectorAll('script[type="application/ld+json"]')]
          .map((s) => JSON.parse(s.textContent ?? "{}"))
          .find((b) => b["@type"] === "FAQPage");
        const resposta = faqPage?.mainEntity?.[0]?.acceptedAnswer?.text as string;
        expect(norm(resposta)).toMatch(/^Hoje, a diária avulsa mais barata .* é R\$ 20,00/);
        // O mesmo parágrafo aparece no topo e na pergunta rápida.
        const paragrafos = [...document.querySelectorAll("p")].filter(
          (p) => p.textContent === resposta,
        );
        expect(paragrafos.length).toBeGreaterThanOrEqual(2);
      });
    });

    it("lote pesquisado aparece com data, sem virar oferta nem botão de reserva", async () => {
      setup(CONFINS);
      expect(
        await screen.findByRole("heading", { name: "Sem reserva online pela Movepark" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "AeroPark Confins" })).toHaveAttribute(
        "href",
        "/estacionamentos/aeroporto-confins/aeroPark-confins".toLowerCase(),
      );
      expect(document.querySelectorAll("time").length).toBeGreaterThanOrEqual(2);
      await waitFor(() => {
        const produtos = [...document.querySelectorAll('script[type="application/ld+json"]')]
          .map((s) => JSON.parse(s.textContent ?? "{}"))
          .find((d) => Array.isArray(d) && d[0]?.["@type"] === "Product") as { name: string }[];
        // ADR-010: só a vaga do parceiro vira Product/Offer.
        expect(produtos.map((p) => p.name)).toEqual(["BePark · Vaga Coberta"]);
      });
      // ADR-009: nenhum "reservar" aponta para ficha de lote mapeado.
      const reservas = screen.getAllByRole("link", { name: /reservar/i });
      expect(reservas.every((a) => !a.getAttribute("href")?.includes("aeropark"))).toBe(true);
    });
  });
});
