import { describe, expect, it, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { ReviewsBlock } from "./ReviewsBlock";
import { useLocationReviews } from "./api";
import type { ReviewWithAuthor } from "@/types/domain";

vi.mock("./api", () => ({ useLocationReviews: vi.fn() }));

function review(over: Partial<ReviewWithAuthor> & { id: string }): ReviewWithAuthor {
  return {
    rating: 5,
    comment: `Comentário ${over.id}`,
    created_at: "2026-06-01T00:00:00Z",
    author_name: "Cliente",
    owner_response: null,
    ...over,
  } as ReviewWithAuthor;
}

function mockReviews(list: ReviewWithAuthor[]) {
  vi.mocked(useLocationReviews).mockReturnValue({ data: list } as never);
}

describe("ReviewsBlock", () => {
  it("some quando não há avaliações", () => {
    mockReviews([]);
    const { container } = renderWithProviders(<ReviewsBlock locationId="loc-1" totalCount={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lidera com o resumo em rating-display quando há nota média, com o período junto", () => {
    mockReviews([
      review({ id: "r1", created_at: "2026-03-04T00:00:00Z" }),
      review({ id: "r2", created_at: "2026-06-10T00:00:00Z" }),
    ]);
    renderWithProviders(<ReviewsBlock locationId="loc-1" totalCount={127} avg={4.8} />);
    expect(
      screen.getByRole("img", { name: "Nota 4,8 de 5, 127 avaliações, de mar a jun de 2026" }),
    ).toBeInTheDocument();
  });

  /**
   * Conteúdo 30: abaixo do piso some a MÉDIA, não as avaliações. Cada comentário é fato de
   * quem escreveu, com data ao lado; o que não se sustenta é a estatística em cima de duas
   * opiniões.
   */
  it("abaixo do piso de volume some o resumo e os comentários ficam", () => {
    mockReviews([review({ id: "r1" }), review({ id: "r2" })]);
    renderWithProviders(<ReviewsBlock locationId="loc-1" totalCount={2} avg={5} />);
    expect(screen.queryByRole("img", { name: /^Nota/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Comentário r1/)).toBeInTheDocument();
  });

  it("pagina de 6 em 6 com 'Ver mais'", () => {
    mockReviews(Array.from({ length: 8 }, (_, i) => review({ id: `r${i}` })));
    renderWithProviders(<ReviewsBlock locationId="loc-1" totalCount={8} />);
    // 6 visíveis no início → 2 restantes
    expect(screen.getByText(/Comentário r0/)).toBeInTheDocument();
    expect(screen.queryByText(/Comentário r7/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Ver mais avaliações/ }));
    expect(screen.getByText(/Comentário r7/)).toBeInTheDocument();
  });

  it("mostra o contexto de estadia quando há datas (PRD-08.8)", () => {
    mockReviews([
      review({
        id: "comdatas",
        stay_check_in: "2026-06-14T12:00:00",
        stay_check_out: "2026-06-16T12:00:00",
      }),
    ]);
    renderWithProviders(<ReviewsBlock locationId="loc-1" totalCount={1} />);
    expect(screen.getByText("Estacionou de 14/06 a 16/06")).toBeInTheDocument();
  });

  it("esconde o contexto de estadia quando faltam datas", () => {
    mockReviews([review({ id: "semdatas", stay_check_in: null, stay_check_out: null })]);
    renderWithProviders(<ReviewsBlock locationId="loc-1" totalCount={1} />);
    expect(screen.queryByText(/Estacionou/)).not.toBeInTheDocument();
  });

  it("ordena por 'Melhor avaliadas'", () => {
    mockReviews([
      review({ id: "baixa", rating: 2, comment: "nota baixa", created_at: "2026-06-10T00:00:00Z" }),
      review({ id: "alta", rating: 5, comment: "nota alta", created_at: "2026-06-01T00:00:00Z" }),
    ]);
    renderWithProviders(<ReviewsBlock locationId="loc-1" totalCount={2} />);
    fireEvent.click(screen.getByRole("button", { name: "Melhor avaliadas" }));
    const cards = screen.getAllByText(/nota (alta|baixa)/);
    expect(cards[0]).toHaveTextContent("nota alta");
  });
});
