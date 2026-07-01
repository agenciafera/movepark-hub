// Lógica pura das avaliações. Sem React/Supabase → testável (Vitest).
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatRating } from "@/lib/format";

/**
 * Contexto de estadia do card de avaliação (PRD-08.8): "Estacionou de DD/MM a DD/MM"
 * (ou "Estacionou em DD/MM" quando entrada e saída caem no mesmo dia). As datas vêm
 * denormalizadas em `review.stay_check_in/stay_check_out`. `null` quando faltar alguma
 * (reviews anteriores ao backfill) → a UI esconde a linha.
 */
export function stayContextLabel(
  checkIn: string | Date | null | undefined,
  checkOut: string | Date | null | undefined,
): string | null {
  if (!checkIn || !checkOut) return null;
  const from = format(new Date(checkIn), "dd/MM", { locale: ptBR });
  const to = format(new Date(checkOut), "dd/MM", { locale: ptBR });
  return from === to ? `Estacionou em ${from}` : `Estacionou de ${from} a ${to}`;
}

export type ReviewFormValues = {
  rating: number; // 1-5; 0 = não escolhido
  comment: string;
  cleanliness: number | null;
  service: number | null;
  value: number | null;
  access: number | null;
};

export type SubmitReviewArgs = {
  p_booking_id: string;
  p_rating: number;
  p_comment: string | null;
  p_cleanliness: number | null;
  p_service: number | null;
  p_value: number | null;
  p_access: number | null;
};

export const EMPTY_REVIEW_FORM: ReviewFormValues = {
  rating: 0,
  comment: "",
  cleanliness: null,
  service: null,
  value: null,
  access: null,
};

/** Valida o form. Retorna a mensagem de erro ou `null` se válido. */
export function validateReviewForm(v: ReviewFormValues): string | null {
  if (v.rating < 1 || v.rating > 5) return "Escolha uma nota de 1 a 5 estrelas.";
  return null;
}

/** Monta os argumentos da RPC `submit_review`. */
export function buildSubmitReviewArgs(bookingId: string, v: ReviewFormValues): SubmitReviewArgs {
  return {
    p_booking_id: bookingId,
    p_rating: v.rating,
    p_comment: v.comment.trim() || null,
    p_cleanliness: v.cleanliness,
    p_service: v.service,
    p_value: v.value,
    p_access: v.access,
  };
}

/**
 * Filtra itens de busca que têm avaliação (count > 0) — usado na curadoria
 * "Mais bem avaliados em [aeroporto]" (08.6), que só mostra unidades já avaliadas.
 */
export function topRated<T extends { location: { review_count: number | null } }>(items: T[]): T[] {
  return items.filter((i) => (i.location.review_count ?? 0) > 0);
}

/**
 * Rótulo do rating agregado: "4,8 · 248 avaliações". `null` quando não há
 * avaliações (a UI esconde o rating, não mostra "sem avaliações").
 */
export function ratingLabel(avg: number | null | undefined, count: number | null | undefined): string | null {
  if (!count || avg == null) return null;
  const n = count === 1 ? "avaliação" : "avaliações";
  return `${formatRating(avg)} · ${count} ${n}`;
}

export type ReviewSort = "recent" | "best";

type SortableReview = { rating: number; created_at: string };

/**
 * Ordena reviews para o bloco da unidade. "recent" = mais novas primeiro
 * (freshness, bom p/ GEO); "best" = maior nota primeiro, desempata pela mais
 * nova. Não muta o array de entrada.
 */
export function sortReviews<T extends SortableReview>(reviews: T[], mode: ReviewSort): T[] {
  const copy = [...reviews];
  if (mode === "best") {
    return copy.sort((a, b) => b.rating - a.rating || b.created_at.localeCompare(a.created_at));
  }
  return copy.sort((a, b) => b.created_at.localeCompare(a.created_at));
}
