import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { ReviewWithAuthor } from "@/types/domain";

export const operatorReviewsKeys = {
  all: ["operator-reviews"] as const,
  list: (companyId: string) => [...operatorReviewsKeys.all, companyId] as const,
};

export type OperatorReview = ReviewWithAuthor & { location_name: string | null };

/** Avaliações das unidades da empresa do operator (p/ responder). */
export function useOperatorReviews(companyId: string | undefined) {
  return useQuery({
    queryKey: companyId ? operatorReviewsKeys.list(companyId) : [...operatorReviewsKeys.all, "none"],
    enabled: !!companyId,
    queryFn: async (): Promise<OperatorReview[]> => {
      const { data: locs } = await supabase
        .from("location")
        .select("id, name")
        .eq("company_id", companyId!)
        .is("deleted_at", null);
      const ids = (locs ?? []).map((l) => l.id);
      if (ids.length === 0) return [];
      const names: Record<string, string> = {};
      for (const l of locs ?? []) names[l.id] = l.name;

      const { data, error } = await supabase
        .from("review")
        .select("*, profile:profiles(full_name)")
        .in("location_id", ids)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      // deno-lint-ignore no-explicit-any
      return (data ?? []).map((r: any) => ({
        ...r,
        author_name: r.profile?.full_name ?? null,
        location_name: names[r.location_id] ?? null,
      }));
    },
  });
}

/** Responder (ou limpar a resposta de) uma avaliação — RPC SECURITY DEFINER. */
export function useRespondReview(companyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { reviewId: string; response: string }): Promise<void> => {
      const { error } = await supabase.rpc("operator_respond_review", {
        p_review_id: args.reviewId,
        p_response: args.response,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: operatorReviewsKeys.all });
      if (companyId) qc.invalidateQueries({ queryKey: operatorReviewsKeys.list(companyId) });
    },
  });
}
