import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GoogleReviewsBlock } from "./GoogleReviewsBlock";
import type { GooglePlaceSnapshot } from "@/types/domain";

const snapshot: GooglePlaceSnapshot = {
  place_id: "ChIJ_x",
  rating: 4.6,
  user_rating_count: 312,
  maps_uri: "https://maps.google.com/?cid=1",
  fetched_at: new Date().toISOString(),
  reviews: [
    {
      rating: 5,
      text: "Atendimento rapido e vaga coberta.",
      publishTime: "2026-07-02T10:00:00Z",
      relativePublishTimeDescription: "há um mês",
      authorName: "Ana P.",
      authorPhotoUri: "https://lh3.googleusercontent.com/a/1",
      authorUri: "https://www.google.com/maps/contrib/1",
      reviewUri: "https://maps.google.com/review/1",
    },
  ],
};

describe("GoogleReviewsBlock", () => {
  it("mostra a nota e deixa claro que a fonte e o Google", () => {
    render(<GoogleReviewsBlock snapshot={snapshot} placeName="Talentos Park" />);
    expect(screen.getByText(/4,6/)).toBeInTheDocument();
    expect(screen.getByText(/Google/i)).toBeInTheDocument();
  });

  it("credita o autor com nome, foto e link, que e condicao de uso", () => {
    render(<GoogleReviewsBlock snapshot={snapshot} placeName="Talentos Park" />);
    expect(screen.getByText("Ana P.")).toBeInTheDocument();
    const foto = screen.getByAltText("Ana P.") as HTMLImageElement;
    expect(foto.src).toContain("lh3.googleusercontent.com");
    const link = screen.getByRole("link", { name: /ver no google/i });
    expect(link).toHaveAttribute("href", "https://maps.google.com/review/1");
  });

  it("nao renderiza quando o snapshot passou dos 30 dias, porque o HTML do SSG tambem e cache", () => {
    const velho = { ...snapshot, fetched_at: "2026-01-01T00:00:00Z" };
    const { container } = render(<GoogleReviewsBlock snapshot={velho} placeName="Talentos Park" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("nao renderiza sem snapshot", () => {
    const { container } = render(<GoogleReviewsBlock snapshot={null} placeName="Talentos Park" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("nao renderiza quando o lugar nao tem avaliacao nenhuma", () => {
    const vazio = { ...snapshot, rating: null, user_rating_count: 0, reviews: [] };
    const { container } = render(<GoogleReviewsBlock snapshot={vazio} placeName="Talentos Park" />);
    expect(container).toBeEmptyDOMElement();
  });
});
