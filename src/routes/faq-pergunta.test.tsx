import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import FaqPerguntaPage from "@/routes/faq-pergunta";
import type { FaqPageData } from "@/features/faqs/api";

const DATA: FaqPageData = {
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
      name: "Aeroporto Internacional de São Paulo",
      short_name: "Guarulhos",
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
};

function setup(data: FaqPageData | null = DATA) {
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

  it("renderiza o corpo expandido em markdown quando existe", async () => {
    setup();
    expect(await screen.findByRole("heading", { name: "Como funciona" })).toBeInTheDocument();
  });

  it("pergunta de destino leva pro destino, e as relacionadas linkam as páginas delas", async () => {
    setup();
    const cta = await screen.findByRole("link", { name: "Estacionamentos em Guarulhos" });
    expect(cta).toHaveAttribute(
      "href",
      "/destinos/aeroporto-internacional-de-sao-paulo-guarulhos",
    );
    const rel = screen.getByRole("link", { name: /As vagas em Guarulhos são cobertas\?/ });
    expect(rel).toHaveAttribute("href", "/faq/as-vagas-em-guarulhos-sao-cobertas");
  });

  it("pergunta global cai na busca como ação principal", async () => {
    setup({
      faq: { ...DATA.faq, scope: "global", destination_id: null, destination: null },
      related: [],
    });
    const cta = await screen.findByRole("link", { name: "Buscar estacionamento" });
    expect(cta).toHaveAttribute("href", "/search");
  });

  it("slug inexistente explica em vez de quebrar", async () => {
    setup(null);
    expect(await screen.findByText("Pergunta não encontrada")).toBeInTheDocument();
  });
});
