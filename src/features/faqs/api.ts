import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type {
  Faq,
  FaqCategoryInsert,
  FaqCategoryRow,
  FaqInsert,
  FaqListFilters,
  FaqUpdate,
} from "./types";

const FAQ_KEY = ["faqs"] as const;
const CAT_KEY = ["faq-categories"] as const;

const FAQ_SELECT =
  "id, scope, location_id, category_id, question, answer, sort_order, is_published, created_at, updated_at, deleted_at, created_by, updated_by, category:faq_category(id, slug, label, sort_order)";

// ---------- Categories ----------

export function useFaqCategories() {
  return useQuery({
    queryKey: CAT_KEY,
    queryFn: async (): Promise<FaqCategoryRow[]> => {
      const { data, error } = await supabase
        .from("faq_category")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("label", { ascending: true });
      if (error) throw error;
      return (data ?? []) as FaqCategoryRow[];
    },
    staleTime: 5 * 60_000,
  });
}

export function useUpsertFaqCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: FaqCategoryInsert & { id?: string }) => {
      const { error } = await supabase
        .from("faq_category")
        .upsert(payload, { onConflict: "id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CAT_KEY }),
  });
}

export function useDeleteFaqCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("faq_category").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CAT_KEY }),
  });
}

// ---------- FAQs ----------

export function useFaqs(filters: FaqListFilters = {}) {
  const key = [
    ...FAQ_KEY,
    filters.scope ?? "any",
    filters.locationId ?? "none",
    filters.companyId ?? "none",
    filters.categorySlug ?? "any",
    filters.query ?? "",
    filters.includeUnpublished ?? false,
  ];

  return useQuery({
    queryKey: key,
    queryFn: async (): Promise<Faq[]> => {
      let q = supabase.from("faq").select(FAQ_SELECT).is("deleted_at", null);

      if (!filters.includeUnpublished) q = q.eq("is_published", true);
      if (filters.scope) q = q.eq("scope", filters.scope);
      if (filters.locationId) q = q.eq("location_id", filters.locationId);
      if (filters.companyId) {
        // Operator vê todas as FAQs das locations da empresa
        const { data: locs } = await supabase
          .from("location")
          .select("id")
          .eq("company_id", filters.companyId);
        const ids = (locs ?? []).map((l) => l.id);
        if (ids.length === 0) return [];
        q = q.in("location_id", ids);
      }
      if (filters.categorySlug) {
        const { data: cat } = await supabase
          .from("faq_category")
          .select("id")
          .eq("slug", filters.categorySlug)
          .maybeSingle();
        if (!cat) return [];
        q = q.eq("category_id", cat.id);
      }
      if (filters.query && filters.query.trim().length >= 2) {
        const escaped = filters.query.trim().replace(/[%_]/g, (m) => `\\${m}`);
        q = q.ilike("question", `%${escaped}%`);
      }

      q = q
        .order("scope", { ascending: false }) // location > global
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      const { data, error } = await q.limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as Faq[];
    },
    staleTime: 60_000,
  });
}

export function useCreateFaq() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: FaqInsert): Promise<Faq> => {
      const { data, error } = await supabase
        .from("faq")
        .insert(payload)
        .select(FAQ_SELECT)
        .single();
      if (error) throw error;
      return data as unknown as Faq;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: FAQ_KEY }),
  });
}

export function useUpdateFaq() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; patch: FaqUpdate }): Promise<Faq> => {
      const { data, error } = await supabase
        .from("faq")
        .update(args.patch)
        .eq("id", args.id)
        .select(FAQ_SELECT)
        .single();
      if (error) throw error;
      return data as unknown as Faq;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: FAQ_KEY }),
  });
}

export function useDeleteFaq() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("faq")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: FAQ_KEY }),
  });
}

// ---------- Combined (Edge Function — consumer/listing/MCP) ----------

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-faq`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export type FaqCombinedItem = {
  id: string;
  scope: "global" | "location";
  location_id: string | null;
  question: string;
  answer: string;
  sort_order: number;
  category: { slug: string; label: string; sort_order: number } | null;
};

export function useFaqCombined(args: {
  locationId?: string;
  categorySlug?: string;
  query?: string;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: [
      "faq-combined",
      args.locationId ?? "none",
      args.categorySlug ?? "any",
      args.query ?? "",
    ],
    queryFn: async (): Promise<FaqCombinedItem[]> => {
      const res = await fetch(FN_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          apikey: ANON_KEY,
          authorization: `Bearer ${ANON_KEY}`,
        },
        body: JSON.stringify({
          location_id: args.locationId,
          category_slug: args.categorySlug,
          query: args.query,
        }),
      });
      if (!res.ok) throw new Error(`get-faq ${res.status}`);
      const json = (await res.json()) as { items: FaqCombinedItem[] };
      return json.items ?? [];
    },
    enabled: args.enabled ?? true,
    staleTime: 60_000,
  });
}
