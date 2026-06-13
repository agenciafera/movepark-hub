import { describe, expect, it } from "vitest";
import {
  buildSubmitReviewArgs,
  EMPTY_REVIEW_FORM,
  ratingLabel,
  sortReviews,
  topRated,
  validateReviewForm,
  type ReviewFormValues,
} from "./reviews.logic";

const base: ReviewFormValues = { ...EMPTY_REVIEW_FORM, rating: 5, comment: "Ótimo" };

describe("validateReviewForm", () => {
  it("exige nota 1-5", () => {
    expect(validateReviewForm({ ...base, rating: 0 })).toMatch(/1 a 5/);
    expect(validateReviewForm({ ...base, rating: 6 })).toMatch(/1 a 5/);
  });
  it("aceita form válido", () => {
    expect(validateReviewForm(base)).toBeNull();
  });
});

describe("buildSubmitReviewArgs", () => {
  it("monta args com comment trimado/nulo e sub-notas", () => {
    const args = buildSubmitReviewArgs("bk1", {
      ...base,
      comment: "  ",
      cleanliness: 5,
      service: 4,
      value: null,
      access: 3,
    });
    expect(args).toEqual({
      p_booking_id: "bk1",
      p_rating: 5,
      p_comment: null,
      p_cleanliness: 5,
      p_service: 4,
      p_value: null,
      p_access: 3,
    });
  });
});

describe("topRated", () => {
  const items = [
    { id: "a", location: { review_count: 0 } },
    { id: "b", location: { review_count: 3 } },
    { id: "c", location: { review_count: null } },
  ];
  it("mantém só itens com avaliação (count > 0)", () => {
    expect(topRated(items).map((i) => i.id)).toEqual(["b"]);
  });
  it("vazio quando nenhum tem avaliação", () => {
    expect(topRated([{ id: "x", location: { review_count: 0 } }])).toEqual([]);
  });
});

describe("sortReviews", () => {
  const reviews = [
    { id: "a", rating: 3, created_at: "2026-06-01T00:00:00Z" },
    { id: "b", rating: 5, created_at: "2026-05-01T00:00:00Z" },
    { id: "c", rating: 5, created_at: "2026-06-10T00:00:00Z" },
  ];
  it("recent: mais novas primeiro", () => {
    expect(sortReviews(reviews, "recent").map((r) => r.id)).toEqual(["c", "a", "b"]);
  });
  it("best: maior nota primeiro, desempata pela mais nova", () => {
    expect(sortReviews(reviews, "best").map((r) => r.id)).toEqual(["c", "b", "a"]);
  });
  it("não muta o array de entrada", () => {
    const original = [...reviews];
    sortReviews(reviews, "best");
    expect(reviews).toEqual(original);
  });
});

describe("ratingLabel", () => {
  it("formata avg + contagem (pt-BR)", () => {
    expect(ratingLabel(4.8, 248)).toBe("4,8 · 248 avaliações");
    expect(ratingLabel(5, 1)).toBe("5,0 · 1 avaliação");
  });
  it("null quando não há avaliações", () => {
    expect(ratingLabel(null, 0)).toBeNull();
    expect(ratingLabel(4.5, 0)).toBeNull();
    expect(ratingLabel(null, 3)).toBeNull();
  });
});
