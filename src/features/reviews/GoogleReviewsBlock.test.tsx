import { render, screen, within } from "@testing-library/react";
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
    {
      rating: 4,
      text: "Bom preco, mas o shuttle demorou.",
      publishTime: "2026-06-10T10:00:00Z",
      relativePublishTimeDescription: "há dois meses",
      authorName: "Bruno S.",
      authorPhotoUri: "https://lh3.googleusercontent.com/a/2",
      authorUri: "https://www.google.com/maps/contrib/2",
      reviewUri: "https://maps.google.com/review/2",
    },
  ],
};

describe("GoogleReviewsBlock", () => {
  it("nomeia o Google no heading e deixa a nota agregada inequivoca sobre a fonte", () => {
    render(<GoogleReviewsBlock snapshot={snapshot} placeName="Talentos Park" />);
    expect(screen.getByRole("heading", { name: /avaliações no google/i })).toBeInTheDocument();
    expect(screen.getByText("4,6")).toBeInTheDocument();
    // A nota agregada é o número que mais se confunde com a nota da Movepark na mesma página:
    // tem que sobrar texto visível "no Google" perto dela, além do heading e do link de rodapé.
    expect(screen.getByText("no Google")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /ver todas as avaliações no google/i }),
    ).toHaveAttribute("href", "https://maps.google.com/?cid=1");
  });

  it("credita cada avaliação com nome, foto e link do autor, que e condicao de uso", () => {
    render(<GoogleReviewsBlock snapshot={snapshot} placeName="Talentos Park" />);

    const cards = screen.getAllByRole("listitem");
    expect(cards).toHaveLength(2);

    const [anaCard, brunoCard] = cards;

    const anaFoto = within(anaCard).getByAltText("Ana P.") as HTMLImageElement;
    expect(anaFoto.src).toContain("lh3.googleusercontent.com");
    expect(anaFoto).toHaveAttribute("width", "32");
    expect(anaFoto).toHaveAttribute("height", "32");
    expect(anaFoto).toHaveAttribute("referrerPolicy", "no-referrer");
    expect(within(anaCard).getByRole("link", { name: "Ana P." })).toHaveAttribute(
      "href",
      "https://www.google.com/maps/contrib/1",
    );
    expect(within(anaCard).getByRole("link", { name: /ver no google/i })).toHaveAttribute(
      "href",
      "https://maps.google.com/review/1",
    );
    expect(within(anaCard).getByText("Atendimento rapido e vaga coberta.")).toBeInTheDocument();

    const brunoFoto = within(brunoCard).getByAltText("Bruno S.") as HTMLImageElement;
    expect(brunoFoto).toHaveAttribute("width", "32");
    expect(brunoFoto).toHaveAttribute("height", "32");
    expect(within(brunoCard).getByRole("link", { name: "Bruno S." })).toHaveAttribute(
      "href",
      "https://www.google.com/maps/contrib/2",
    );
    expect(within(brunoCard).getByRole("link", { name: /ver no google/i })).toHaveAttribute(
      "href",
      "https://maps.google.com/review/2",
    );
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
