// Lógica pura das avaliações. Sem React/Supabase → testável (Vitest).
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatRating } from "@/lib/format";
import { MIN_AVALIACOES_PARA_NOTA, temVolumeParaNota } from "@/lib/reviews-volume.mjs";

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
 * Filtra itens de busca cuja nota já tem volume para valer como afirmação, usado na
 * curadoria "Mais bem avaliados em [aeroporto]" (08.6). Chamar de "mais bem avaliado" um
 * lote com uma opinião é o mesmo erro do selo, só que com um superlativo em cima.
 */
export function topRated<T extends { location: { review_count: number | null } }>(items: T[]): T[] {
  return items.filter((i) => temVolumeParaNota(i.location.review_count));
}

/**
 * Rótulo do rating agregado: "4,8 · 248 avaliações". `null` quando a nota ainda não pode
 * ser publicada, e aí a UI esconde o rating em vez de mostrar "sem avaliações".
 *
 * O piso de volume (`MIN_AVALIACOES_PARA_NOTA`) mora aqui porque este é o caminho por onde
 * quase toda nota chega à tela: selo do card, topo da ficha, lista de destino e a nota do
 * Google. Gatear na origem é o que evita uma quinta marcação nascer sem o piso.
 */
export function ratingLabel(avg: number | null | undefined, count: number | null | undefined): string | null {
  if (!temVolumeParaNota(count) || avg == null) return null;
  const n = count === 1 ? "avaliação" : "avaliações";
  return `${formatRating(avg)} · ${count} ${n}`;
}

/**
 * O período que a nota cobre: "de mar a set de 2026", ou "em set de 2026" quando tudo caiu
 * no mesmo mês. `null` sem datas.
 *
 * Nota e contagem sem período dizem quanto, não quando. Uma média de 4,9 fechada há dois
 * anos descreve um pátio que talvez nem exista mais, e é justamente essa a diferença entre
 * o nosso número e o do comparador, que publica nota sem dizer de quando ela é.
 */
export function periodoDaNota(desde: string | null | undefined, ate: string | null | undefined): string | null {
  if (!desde || !ate) return null;
  const a = new Date(desde);
  const b = new Date(ate);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;

  const mes = (d: Date) => MESES[d.getMonth()];
  const mesmoMes = a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
  if (mesmoMes) return `em ${mes(b)} de ${b.getFullYear()}`;
  if (a.getFullYear() === b.getFullYear()) {
    return `de ${mes(a)} a ${mes(b)} de ${b.getFullYear()}`;
  }
  return `de ${mes(a)} de ${a.getFullYear()} a ${mes(b)} de ${b.getFullYear()}`;
}

const MESES = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

export { MIN_AVALIACOES_PARA_NOTA, temVolumeParaNota };

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
