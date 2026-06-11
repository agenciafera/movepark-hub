import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { ReviewWithAuthor } from "@/types/domain";

export const managerReviewsKeys = {
  all: ["manager-reviews"] as const,
  list: (onlyUnpublished: boolean) => [...managerReviewsKeys.all, onlyUnpublished] as const,
};

export type ManagerReview = ReviewWithAuthor & {
  location_name: string | null;
  company_name: string | null;
};

/** Todas as avaliações (hub_admin lê tudo via RLS), p/ moderação. */
export function useAllReviews(onlyUnpublished = false) {
  return useQuery({
    queryKey: managerReviewsKeys.list(onlyUnpublished),
    queryFn: async (): Promise<ManagerReview[]> => {
      let q = supabase
        .from("review")
        .select(
          "*, profile:profiles(full_name), location:location(name, company:company(name))",
        )
        .order("created_at", { ascending: false })
        .limit(300);
      if (onlyUnpublished) q = q.eq("is_published", false);
      const { data, error } = await q;
      if (error) throw error;
      // deno-lint-ignore no-explicit-any
      return (data ?? []).map((r: any) => ({
        ...r,
        author_name: r.profile?.full_name ?? null,
        location_name: r.location?.name ?? null,
        company_name: r.location?.company?.name ?? null,
      }));
    },
  });
}

/** Publica/despublica uma avaliação (RLS review_admin_moderate gateia o hub_admin). */
export function useSetReviewPublished() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; is_published: boolean }): Promise<void> => {
      const { error } = await supabase
        .from("review")
        .update({ is_published: args.is_published })
        .eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: managerReviewsKeys.all });
      qc.invalidateQueries({ queryKey: ["reviews"] }); // agregado/listagem pública
    },
  });
}
