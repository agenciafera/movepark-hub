import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { detectBrand } from "@/lib/card-brand";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database";

type PaymentMethodRow = Database["public"]["Tables"]["payment_method"]["Row"];

const KEY = ["my-payment-methods"] as const;

export function useMyPaymentMethods(profileId: string | undefined) {
  return useQuery({
    queryKey: [...KEY, profileId ?? "anon"],
    queryFn: async (): Promise<PaymentMethodRow[]> => {
      if (!profileId) return [];
      const { data, error } = await supabase
        .from("payment_method")
        .select("*")
        .eq("profile_id", profileId)
        .is("deleted_at", null)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PaymentMethodRow[];
    },
    enabled: !!profileId,
    staleTime: 60_000,
  });
}

// A detecção da bandeira é a mesma do checkout (`@/lib/card-brand`); a antiga daqui dizia que
// todo cartão começado em 6 era Elo.
export { detectBrand };

export function useCreatePaymentMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      profile_id: string;
      card_number: string; // só usado pra extrair last4/brand. NÃO É ARMAZENADO.
      holder_name?: string;
      expiry_month: number;
      expiry_year: number;
      is_default: boolean;
    }) => {
      const digits = args.card_number.replace(/\D/g, "");
      const last4 = digits.slice(-4);
      const brand = detectBrand(digits);

      if (args.is_default) {
        await supabase
          .from("payment_method")
          .update({ is_default: false })
          .eq("profile_id", args.profile_id);
      }

      const { error } = await supabase.from("payment_method").insert({
        profile_id: args.profile_id,
        provider: "mock",
        provider_token: `mock_${Date.now()}`,
        brand,
        last4,
        holder_name: args.holder_name ?? null,
        expiry_month: args.expiry_month,
        expiry_year: args.expiry_year,
        is_default: args.is_default,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useSetDefaultPaymentMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; profileId: string }) => {
      await supabase
        .from("payment_method")
        .update({ is_default: false })
        .eq("profile_id", args.profileId);
      const { error } = await supabase
        .from("payment_method")
        .update({ is_default: true })
        .eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeletePaymentMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("payment_method")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
