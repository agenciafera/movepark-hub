import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import FaqPerguntaPage, { type FaqPerguntaData } from "@/routes/faq-pergunta";

const DATA: FaqPerguntaData = {
  faq: {
    id: "f1",
    scope: "destination",
    destination_id: "gru",
    question: "Tem traslado em Guarulhos?",
    answer: "Tem. O transfer sai do estacionamento e deixa você no terminal.",
    body_md: "## Como funciona\n\nO motorista combina o retorno na chegada.",
    slug: "tem-traslado-em-guarulhos",
    updated_at: "2026-08-14T12:00:00Z",
    category: null,
    destination: {
      id: "gru",
      name: "Aeroporto Internacional de São Paulo–Guarulhos",
      short_name: "Guarulhos (GRU)",
      slug: "aeroporto-internacional-de-sao-paulo-guarulhos",
      code: "GRU",
    },
  },
  related: [
    {
      id: "f2",
      scope: "destination",
      destination_id: "gru",
      question: "As vagas em Guarulhos são cobertas?",
      answer: "As duas.",
      slug: "as-vagas-em-guarulhos-sao-cobertas",
      sort_order: 0,
      category: null,
      destination: null,
    },
  ],
  precos: {
    kind: "destino",
    destino: {
      slug: "aeroporto-internacional-de-sao-paulo-guarulhos",
      unitCount: 6,
      partnerCount: 4,
      byDuration: [
        { days: 1, from: 34.9, fromPerDay: 34.9 },
        { days: 7, from: 168, fromPerDay: 24 },
      ],
    },
  },
};

/** Blocos de preço e fechamento só entram em página desta categoria. */
const PAGAMENTOS = { slug: "pagamentos", label: "Pagamentos", sort_order: 2 };

function setup(data: FaqPerguntaData = DATA) {
  const router = createMemoryRouter(
    [{ path: "/faq/:slug", element: <FaqPerguntaPage />, loader: () => data }],
    { initialEntries: ["/faq/tem-traslado-em-guarulhos"] },
  );
  return render(
    <HelmetProvider>
      <RouterProvider router={router} />
    </HelmetProvider>,
  );
}

describe("FaqPerguntaPage", () => {
  it("abre com a pergunta no h1 e a resposta rápida logo abaixo", async () => {
    setup();
    expect(
      await screen.findByRole("heading", { level: 1, name: "Tem traslado em Guarulhos?" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Resposta rápida" })).toBeInTheDocument();
    expect(
      screen.getByText("Tem. O transfer sai do estacionamento e deixa você no terminal."),
    ).toBeInTheDocument();
  });

  /** A palavra-chave de tráfego de aeroporto sai no primeiro parágrafo da página. */
  it("o primeiro parágrafo carrega a palavra-chave do aeroporto", async () => {
    setup();
    expect(
      await screen.findByText(/estacionamento no Aeroporto de Guarulhos \(GRU\)/),
    ).toBeInTheDocument();
  });

  it("renderiza o corpo expandido em markdown quando existe", async () => {
    setup();
    expect(await screen.findByRole("heading", { name: "Como funciona" })).toBeInTheDocument();
  });

  it("página de preço mostra a tabela de quanto custa com o dado do índice", async () => {
    setup({ ...DATA, faq: { ...DATA.faq!, category: PAGAMENTOS } } as FaqPerguntaData);
    expect(
      await screen.findByRole("heading", { name: /Quanto custa estacionar no Aeroporto de Guarulhos/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("1 diária")).toBeInTheDocument();
    expect(screen.getByText("R$ 34,90")).toBeInTheDocument();
  });

  /**
   * Fora da página de preço, o que sustenta a página é o corpo específico da
   * pergunta: tabela de preço, "Como reservar" e checklist quebrariam o
   * contexto do tema (a pergunta do exemplo é sobre traslado).
   */
  it("pergunta que não é de preço fica no contexto dela, sem blocos genéricos", async () => {
    setup();
    expect(await screen.findByRole("heading", { name: "Como funciona" })).toBeInTheDocument();
    expect(screen.getByText(/os detalhes estão logo abaixo/)).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /Quanto custa estacionar/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Como reservar com a Movepark" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "O que conferir antes de reservar" }),
    ).not.toBeInTheDocument();
    // Os CTAs de navegação continuam: eles não são conteúdo, são saída da página.
    expect(screen.getByRole("link", { name: "Reservar vaga em Guarulhos" })).toBeInTheDocument();
  });

  it("tem os dois CTAs: reservar e comparar preços", async () => {
    setup();
    const reservar = await screen.findByRole("link", { name: "Reservar vaga em Guarulhos" });
    expect(reservar).toHaveAttribute(
      "href",
      "/destinos/aeroporto-internacional-de-sao-paulo-guarulhos",
    );
    const comparar = screen.getByRole("link", { name: "Comparar preços em Guarulhos" });
    expect(comparar).toHaveAttribute(
      "href",
      "/precos/aeroporto-internacional-de-sao-paulo-guarulhos",
    );
  });

  it("página de preço lista o checklist do que conferir antes de reservar", async () => {
    setup({ ...DATA, faq: { ...DATA.faq!, category: PAGAMENTOS } } as FaqPerguntaData);
    expect(
      await screen.findByRole("heading", { name: "O que conferir antes de reservar" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Traslado até o terminal/)).toBeInTheDocument();
  });

  it("as relacionadas linkam as páginas delas", async () => {
    setup();
    const rel = await screen.findByRole("link", { name: /As vagas em Guarulhos são cobertas\?/ });
    expect(rel).toHaveAttribute("href", "/faq/as-vagas-em-guarulhos-sao-cobertas");
  });

  /**
   * Aeroporto sem parceiro precificado: depois da resposta rápida a página não
   * pode prometer reserva pela Movepark. O fechamento vira "como escolher", o
   * CTA aponta pro mapa da região e ninguém linka /precos/<slug> (não existe).
   */
  it("aeroporto sem parceiro mantém o contexto: sem promessa de reserva Movepark", async () => {
    setup({
      ...DATA,
      faq: {
        ...DATA.faq!,
        question: "Quanto custa estacionar em Confins?",
        category: PAGAMENTOS,
        destination_id: "cnf",
        destination: {
          id: "cnf",
          name: "Aeroporto de Confins",
          short_name: "Confins (CNF)",
          slug: "aeroporto-de-confins",
          code: "CNF",
        },
      },
      precos: null,
    } as FaqPerguntaData);
    expect(
      await screen.findByRole("heading", {
        name: "Como escolher o estacionamento no Aeroporto de Confins",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Como reservar com a Movepark" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/o comparativo da região está logo abaixo/)).toBeInTheDocument();
    const ver = screen.getByRole("link", { name: "Ver estacionamentos em Confins" });
    expect(ver).toHaveAttribute("href", "/destinos/aeroporto-de-confins");
    expect(
      screen.getByRole("link", { name: "Comparar preços em outros aeroportos" }),
    ).toHaveAttribute("href", "/precos");
    expect(screen.queryByRole("link", { name: /Reservar vaga/ })).not.toBeInTheDocument();
    expect(screen.getByText(/confirme a política na cotação/)).toBeInTheDocument();
  });

  /** Destino presente no índice só com lotes mapeados (sem preço) conta como sem parceiro. */
  it("destino no índice sem preço do motor também cai no fechamento sem parceiro", async () => {
    setup({
      ...DATA,
      faq: { ...DATA.faq!, category: PAGAMENTOS },
      precos: {
        kind: "destino",
        destino: {
          slug: "aeroporto-internacional-de-sao-paulo-guarulhos",
          unitCount: 0,
          partnerCount: 0,
          byDuration: [],
        },
      },
    } as FaqPerguntaData);
    expect(
      await screen.findByRole("heading", { name: /Como escolher o estacionamento/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Comparar preços em Guarulhos/ }),
    ).not.toBeInTheDocument();
  });

  it("pergunta global de preço cai na busca e no índice de preços da rede", async () => {
    setup({
      faq: {
        ...DATA.faq!,
        scope: "global",
        destination_id: null,
        destination: null,
        category: PAGAMENTOS,
      },
      related: [],
      precos: { kind: "rede", rede: { destinationCount: 21, unitCount: 40, minDailyFrom: 19.9 } },
    } as FaqPerguntaData);
    const cta = await screen.findByRole("link", { name: "Buscar estacionamento" });
    expect(cta).toHaveAttribute("href", "/search");
    expect(screen.getByRole("link", { name: "Comparar preços" })).toHaveAttribute(
      "href",
      "/precos",
    );
    expect(screen.getByText(/40 estacionamentos comparados em 21 destinos/)).toBeInTheDocument();
  });

  it("slug inexistente explica em vez de quebrar", async () => {
    setup(null);
    expect(await screen.findByText("Pergunta não encontrada")).toBeInTheDocument();
  });
});
