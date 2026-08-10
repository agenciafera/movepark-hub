import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { renderWithProviders } from "@/test/utils";
import FaqPage from "@/routes/faq";
import { useFaqs } from "@/features/faqs/api";

vi.mock("@/features/faqs/api", async (orig) => {
  const actual = await orig<typeof import("@/features/faqs/api")>();
  return { ...actual, useFaqCategories: vi.fn(), useFaqs: vi.fn() };
});

const RESERVAS = { id: "c1", slug: "reservas", label: "Reservas", sort_order: 1 };
const PAGAMENTOS = { id: "c2", slug: "pagamentos", label: "Pagamentos", sort_order: 2 };

const PERGUNTAS = [
  { id: "f1", question: "Como faço uma reserva?", answer: "Pelo site.", category: RESERVAS },
  { id: "f2", question: "Aceita PIX?", answer: "Aceita.", category: PAGAMENTOS },
  { id: "f3", question: "Posso remarcar?", answer: "Pode.", category: RESERVAS },
];

function setup(data: unknown[] = PERGUNTAS, isLoading = false) {
  vi.mocked(useFaqs).mockReturnValue({ data, isLoading } as never);
  return renderWithProviders(
    <HelmetProvider>
      <FaqPage />
    </HelmetProvider>,
  );
}

describe("FaqPage", () => {
  /**
   * Antes a categoria filtrava a lista, então o leitor via um recorte por vez e as
   * outras respostas nem existiam na página para o buscador. Agora cada categoria é
   * uma seção e todas ficam juntas.
   */
  it("agrupa as perguntas em uma seção por categoria, na ordem do banco", () => {
    const { container } = setup();

    const titulos = [...container.querySelectorAll("section[id] h2")].map((h) => h.textContent);
    expect(titulos).toEqual(["Reservas", "Pagamentos"]);
    expect(container.querySelector("section#reservas")).toBeInTheDocument();

    // As três perguntas estão na mesma página, não só as da categoria escolhida.
    expect(screen.getByRole("button", { name: "Como faço uma reserva?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aceita PIX?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Posso remarcar?" })).toBeInTheDocument();
  });

  it("o índice leva às âncoras das categorias", () => {
    const { container } = setup();
    const indice = container.querySelector('nav[aria-label="Nesta página"]');
    const hrefs = [...(indice?.querySelectorAll("a") ?? [])].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["#reservas", "#pagamentos"]);
  });

  it("a busca continua na página", () => {
    setup();
    expect(screen.getByRole("textbox", { name: "Buscar pergunta" })).toBeInTheDocument();
  });

  it("sem resultado, explica em vez de mostrar página vazia", () => {
    setup([]);
    expect(screen.getByText("Nenhuma pergunta encontrada")).toBeInTheDocument();
  });

  /** Pergunta sem categoria não pode sumir da página. */
  it("pergunta sem categoria cai numa seção própria", () => {
    const { container } = setup([
      { id: "f9", question: "E isso aqui?", answer: "Resposta.", category: null },
    ]);
    expect(container.querySelector("section#outras")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "E isso aqui?" })).toBeInTheDocument();
  });
});
