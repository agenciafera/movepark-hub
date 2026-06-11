import { describe, expect, it } from "vitest";
import {
  buildSubmitReviewArgs,
  EMPTY_REVIEW_FORM,
  ratingLabel,
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
