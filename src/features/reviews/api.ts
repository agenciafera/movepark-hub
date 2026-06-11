import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Review, ReviewWithAuthor } from "@/types/domain";
import type { SubmitReviewArgs } from "./reviews.logic";

export const reviewsKeys = {
  all: ["reviews"] as const,
  mine: (bookingId: string) => [...reviewsKeys.all, "mine", bookingId] as const,
  location: (locationId: string) => [...reviewsKeys.all, "location", locationId] as const,
};

/** A avaliação do próprio usuário para uma reserva (prefill / saber se já avaliou). */
export function useMyReview(bookingId: string | undefined) {
  return useQuery({
    queryKey: bookingId ? reviewsKeys.mine(bookingId) : [...reviewsKeys.all, "mine", "none"],
    enabled: !!bookingId,
    queryFn: async (): Promise<Review | null> => {
      const { data, error } = await supabase
        .from("review")
        .select("*")
        .eq("booking_id", bookingId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Review | null;
    },
  });
}

/** Cria/atualiza a avaliação de uma reserva (RPC submit_review). */
export function useSubmitReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: SubmitReviewArgs): Promise<string> => {
      // params da RPC aceitam null; o type gen do Supabase não reflete isso.
      const { data, error } = await supabase.rpc("submit_review", args as never);
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: reviewsKeys.all }),
  });
}

/** Reviews publicados de uma unidade (+ nome do autor) — bloco na página da unidade. */
export function useLocationReviews(locationId: string | undefined, limit = 50) {
  return useQuery({
    queryKey: locationId
      ? reviewsKeys.location(locationId)
      : [...reviewsKeys.all, "location", "none"],
    enabled: !!locationId,
    staleTime: 60_000,
    queryFn: async (): Promise<ReviewWithAuthor[]> => {
      const { data, error } = await supabase
        .from("review")
        .select("*, profile:profiles(full_name)")
        .eq("location_id", locationId!)
        .eq("is_published", true)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      // deno-lint-ignore no-explicit-any
      return (data ?? []).map((r: any) => ({ ...r, author_name: r.profile?.full_name ?? null }));
    },
  });
}
