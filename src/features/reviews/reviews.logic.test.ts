import { describe, expect, it } from "vitest";
import {
  buildSubmitReviewArgs,
  EMPTY_REVIEW_FORM,
  MIN_AVALIACOES_PARA_NOTA,
  periodoDaNota,
  ratingLabel,
  sortReviews,
  stayContextLabel,
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
    { id: "d", location: { review_count: 12 } },
  ];
  /** Chamar de "mais bem avaliado" quem tem três opiniões é superlativo sobre ruído. */
  it("mantém só quem passou do piso de volume", () => {
    expect(topRated(items).map((i) => i.id)).toEqual(["d"]);
  });
  it("vazio quando ninguém passou do piso", () => {
    expect(topRated([{ id: "x", location: { review_count: 4 } }])).toEqual([]);
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

describe("stayContextLabel", () => {
  // Datas em horário local do meio-dia → DD/MM estável independente do timezone do runner.
  const jun14 = new Date(2026, 5, 14, 12, 0);
  const jun16 = new Date(2026, 5, 16, 12, 0);

  it("período de vários dias: 'Estacionou de DD/MM a DD/MM'", () => {
    expect(stayContextLabel(jun14, jun16)).toBe("Estacionou de 14/06 a 16/06");
  });
  it("mesmo dia: 'Estacionou em DD/MM'", () => {
    expect(stayContextLabel(jun14, jun14)).toBe("Estacionou em 14/06");
  });
  it("null quando falta alguma data", () => {
    expect(stayContextLabel(null, jun16)).toBeNull();
    expect(stayContextLabel(jun14, null)).toBeNull();
    expect(stayContextLabel(null, null)).toBeNull();
  });
});

describe("ratingLabel", () => {
  it("formata avg + contagem (pt-BR)", () => {
    expect(ratingLabel(4.8, 248)).toBe("4,8 · 248 avaliações");
    expect(ratingLabel(4.6, MIN_AVALIACOES_PARA_NOTA)).toBe("4,6 · 5 avaliações");
  });
  it("null quando não há avaliações", () => {
    expect(ratingLabel(null, 0)).toBeNull();
    expect(ratingLabel(4.5, 0)).toBeNull();
    expect(ratingLabel(null, 3)).toBeNull();
  });
  /**
   * O caso que a atividade Conteúdo 30 mandou fechar: uma opinião não sustenta nota. A IA
   * repete o 5,0, o leitor decide por ele, e a avaliação seguinte derruba tudo.
   */
  it("null abaixo do piso de volume, mesmo com nota cheia", () => {
    expect(ratingLabel(5, 1)).toBeNull();
    expect(ratingLabel(5, 2)).toBeNull();
    expect(ratingLabel(4.9, MIN_AVALIACOES_PARA_NOTA - 1)).toBeNull();
  });
});

describe("periodoDaNota", () => {
  it("mês a mês no mesmo ano", () => {
    expect(periodoDaNota("2026-03-04T10:00:00Z", "2026-09-17T10:00:00Z")).toBe(
      "de mar a set de 2026",
    );
  });
  it("tudo no mesmo mês vira uma data só", () => {
    expect(periodoDaNota("2026-09-02T10:00:00Z", "2026-09-17T10:00:00Z")).toBe("em set de 2026");
  });
  it("anos diferentes carregam os dois anos", () => {
    expect(periodoDaNota("2025-11-02T10:00:00Z", "2026-02-17T10:00:00Z")).toBe(
      "de nov de 2025 a fev de 2026",
    );
  });
  it("sem data não inventa período", () => {
    expect(periodoDaNota(null, "2026-09-17T10:00:00Z")).toBeNull();
    expect(periodoDaNota("ontem", "hoje")).toBeNull();
  });
});
