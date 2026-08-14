import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import FaqPage from "@/routes/faq";
import type { FaqIndexItem } from "@/features/faqs/api";

function faq(overrides: Partial<FaqIndexItem> & { id: string }): FaqIndexItem {
  return {
    scope: "global",
    destination_id: null,
    question: `Pergunta ${overrides.id}?`,
    answer: "Resposta.",
    slug: `pergunta-${overrides.id}`,
    sort_order: 0,
    category: null,
    destination: null,
    ...overrides,
  };
}

const RESERVAS = { slug: "reservas", label: "Reservas", sort_order: 1 };
const PAGAMENTOS = { slug: "pagamentos", label: "Pagamentos", sort_order: 2 };

const PERGUNTAS: FaqIndexItem[] = [
  faq({ id: "f1", question: "Como faço uma reserva?", answer: "Pelo site.", category: RESERVAS }),
  faq({ id: "f2", question: "Aceita PIX?", answer: "Aceita.", category: PAGAMENTOS }),
  faq({ id: "f3", question: "Posso remarcar?", answer: "Pode.", category: RESERVAS }),
];

/** A página lê o acervo do loader (SSG); o teste monta o data router igual à produção. */
function setup(data: FaqIndexItem[] = PERGUNTAS) {
  const router = createMemoryRouter(
    [{ path: "/faq", element: <FaqPage />, loader: () => data }],
    { initialEntries: ["/faq"] },
  );
  return render(
    <HelmetProvider>
      <RouterProvider router={router} />
    </HelmetProvider>,
  );
}

describe("FaqPage", () => {
  it("agrupa as perguntas em uma seção por categoria, na ordem do banco", async () => {
    const { container } = setup();
    await screen.findByRole("button", { name: "Como faço uma reserva?" });

    const titulos = [...container.querySelectorAll("section[id] h2")].map((h) => h.textContent);
    expect(titulos).toEqual(["Reservas", "Pagamentos"]);
    expect(container.querySelector("section#reservas")).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Aceita PIX?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Posso remarcar?" })).toBeInTheDocument();
  });

  /** É o que o crawler lê: a resposta existe no HTML mesmo com o accordion fechado. */
  it("a resposta está no DOM sem nenhum clique", async () => {
    setup();
    await screen.findByRole("button", { name: "Aceita PIX?" });
    expect(screen.getByText("Aceita.")).toBeInTheDocument();
  });

  it("cada pergunta com slug linka a própria página", async () => {
    const { container } = setup();
    await screen.findByRole("button", { name: "Aceita PIX?" });
    const hrefs = [...container.querySelectorAll('a[href^="/faq/"]')].map((a) =>
      a.getAttribute("href"),
    );
    expect(hrefs).toContain("/faq/pergunta-f2");
  });

  it("FAQ de destino vira seção própria depois das globais", async () => {
    const { container } = setup([
      ...PERGUNTAS,
      faq({
        id: "d1",
        scope: "destination",
        destination_id: "gru",
        question: "Tem traslado em Guarulhos?",
        destination: { name: "Aeroporto de Guarulhos", short_name: "Guarulhos", slug: "guarulhos" },
      }),
    ]);
    await screen.findByRole("button", { name: "Tem traslado em Guarulhos?" });
    const secao = container.querySelector("section#destino-guarulhos");
    expect(secao).toBeInTheDocument();
    expect(secao?.querySelector("h2")?.textContent).toBe("Sobre Guarulhos");
  });

  it("o índice leva às âncoras das categorias", async () => {
    const { container } = setup();
    await screen.findByRole("button", { name: "Aceita PIX?" });
    const indice = container.querySelector('nav[aria-label="Nesta página"]');
    const hrefs = [...(indice?.querySelectorAll("a") ?? [])].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["#reservas", "#pagamentos"]);
  });

  it("a busca continua na página", async () => {
    setup();
    expect(await screen.findByRole("textbox", { name: "Buscar pergunta" })).toBeInTheDocument();
  });

  it("sem resultado, explica em vez de mostrar página vazia", async () => {
    setup([]);
    expect(await screen.findByText("Nenhuma pergunta encontrada")).toBeInTheDocument();
  });

  /** Pergunta sem categoria não pode sumir da página. */
  it("pergunta sem categoria cai numa seção própria", async () => {
    const { container } = setup([
      faq({ id: "f9", question: "E isso aqui?", answer: "Resposta.", category: null }),
    ]);
    expect(await screen.findByRole("button", { name: "E isso aqui?" })).toBeInTheDocument();
    expect(container.querySelector("section#outras")).toBeInTheDocument();
  });
});
