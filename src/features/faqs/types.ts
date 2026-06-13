import type { Database } from "@/types/database";

export type FaqScope = Database["public"]["Enums"]["faq_scope"];
export type FaqRow = Database["public"]["Tables"]["faq"]["Row"];
export type FaqInsert = Database["public"]["Tables"]["faq"]["Insert"];
export type FaqUpdate = Database["public"]["Tables"]["faq"]["Update"];
export type FaqCategoryRow = Database["public"]["Tables"]["faq_category"]["Row"];
export type FaqCategoryInsert = Database["public"]["Tables"]["faq_category"]["Insert"];

/** FAQ enriquecida com a categoria embedada (joinada). */
export type Faq = FaqRow & {
  category: Pick<FaqCategoryRow, "id" | "slug" | "label" | "sort_order"> | null;
};

export type FaqListFilters = {
  scope?: FaqScope;
  locationId?: string | null;
  destinationId?: string | null;
  companyId?: string;
  categorySlug?: string;
  query?: string;
  includeUnpublished?: boolean;
};
