import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { renderWithProviders } from "@/test/utils";
import FaqPage from "@/routes/faq";
import { useFaqCategories, useFaqs } from "@/features/faqs/api";

vi.mock("@/features/faqs/api", async (orig) => {
  const actual = await orig<typeof import("@/features/faqs/api")>();
  return { ...actual, useFaqCategories: vi.fn(), useFaqs: vi.fn() };
});

const CATS = [
  { id: "c1", slug: "reservas", label: "Reservas", sort_order: 1 },
  { id: "c2", slug: "pagamentos", label: "Pagamentos", sort_order: 2 },
];

function setup() {
  vi.mocked(useFaqCategories).mockReturnValue({ data: CATS } as never);
  vi.mocked(useFaqs).mockReturnValue({ data: [], isLoading: false } as never);
  return renderWithProviders(
    <HelmetProvider>
      <FaqPage />
    </HelmetProvider>,
  );
}

describe("FaqPage — seleção de categoria por breakpoint", () => {
  it("oferece o select de categoria (mobile) e a sidebar de botões (desktop) na mesma árvore", () => {
    setup();
    // A alternância mobile↔desktop é por CSS (tablet:hidden / hidden tablet:block),
    // então os dois coexistem no DOM. O select é um combobox rotulado "Categoria".
    expect(screen.getByRole("combobox", { name: "Categoria" })).toBeInTheDocument();
    // E os botões da sidebar, com as mesmas opções (Todas + categorias do banco).
    expect(screen.getByRole("button", { name: "Todas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reservas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pagamentos" })).toBeInTheDocument();
  });
});
