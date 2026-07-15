import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * Motor de Crescimento: acesso a dados (Clube, carteira, Indicação).
 *
 * O backend já mora no Postgres:
 * - `get_my_membership()` → nível atual + progresso (tabelas membership/membership_tier)
 * - `get_my_wallet()`     → saldo da carteira + expiração + extrato (wallet_ledger)
 * - `get_my_referrals()`  → código, link e contagem de indicações
 * - `redeem_referral_code(code)` → atribui uma indicação a um novo cliente
 * Todas são RPCs SECURITY DEFINER; as tabelas ficam trancadas por RLS.
 */

export const growthKeys = {
  membership: ["growth", "membership"] as const,
  wallet: ["growth", "wallet"] as const,
  referrals: ["growth", "referrals"] as const,
  lastBooking: (profileId: string) => ["growth", "last-booking", profileId] as const,
};

export type MembershipInfo = {
  tier_code: string;
  tier_name: string;
  cashback_bps: number;
  perks: string[];
  completed_bookings: number;
  window_bookings: number;
  tier_since: string;
  next_tier: {
    code: string;
    name: string;
    min_bookings: number;
    bookings_needed: number;
  } | null;
};

export type ReferralInfo = {
  code: string;
  link: string;
  counts: { pending: number; qualified: number; rewarded: number };
  referrals: {
    id: string;
    status: "pending" | "qualified" | "rewarded" | "expired" | "void";
    referred_email: string | null;
    reward_amount: number;
    created_at: string;
    qualified_at: string | null;
  }[];
};

export type WalletTransaction = {
  amount_cents: number;
  kind: "cashback" | "referral" | "debit" | "expire" | "adjust";
  note: string | null;
  created_at: string;
  expires_at: string | null;
};

export type WalletInfo = {
  balance_cents: number;
  expiring_cents: number;
  expiring_at: string | null;
  transactions: WalletTransaction[];
};

export type LastBooking = {
  code: string;
  locationName: string;
  companyName: string;
  parkingTypeName: string | null;
  vehicleLabel: string | null;
  /** URL da página do lote pra recomeçar a reserva. */
  listingUrl: string | null;
};

export function useMembership(enabled: boolean) {
  return useQuery({
    queryKey: growthKeys.membership,
    queryFn: async (): Promise<MembershipInfo> => {
      const { data, error } = await supabase.rpc("get_my_membership");
      if (error) throw error;
      return data as unknown as MembershipInfo;
    },
    enabled,
    staleTime: 60_000,
  });
}

export function useWallet(enabled: boolean) {
  return useQuery({
    queryKey: growthKeys.wallet,
    queryFn: async (): Promise<WalletInfo> => {
      const { data, error } = await supabase.rpc("get_my_wallet");
      if (error) throw error;
      return data as unknown as WalletInfo;
    },
    enabled,
    staleTime: 60_000,
  });
}

export function useReferrals(enabled: boolean) {
  return useQuery({
    queryKey: growthKeys.referrals,
    queryFn: async (): Promise<ReferralInfo> => {
      const { data, error } = await supabase.rpc("get_my_referrals");
      if (error) throw error;
      return data as unknown as ReferralInfo;
    },
    enabled,
    staleTime: 60_000,
  });
}

/** Última reserva concluída do cliente — base da recompra em 1 toque. */
export function useLastCompletedBooking(profileId: string | undefined) {
  return useQuery({
    queryKey: growthKeys.lastBooking(profileId ?? "anon"),
    queryFn: async (): Promise<LastBooking | null> => {
      if (!profileId) return null;
      const { data, error } = await supabase
        .from("booking")
        .select(
          `code, check_out_at,
           location:location!inner(name, slug, company:company!inner(name, slug)),
           booking_item:booking_item(item_type, parking_type:parking_type(name, code)),
           vehicle:vehicle(model, license_plate)`,
        )
        .eq("profile_id", profileId)
        .eq("status", "completed")
        .order("check_out_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      // deno-lint-ignore no-explicit-any
      const r = data as any;
      const parkingItem = (r.booking_item ?? []).find(
        // deno-lint-ignore no-explicit-any
        (b: any) => b.item_type === "parking",
      );
      const ptCode = parkingItem?.parking_type?.code ?? null;
      const listingUrl =
        r.location?.company?.slug && r.location?.slug && ptCode
          ? `/p/${r.location.company.slug}/${r.location.slug}/${ptCode}`
          : null;
      const vehicleLabel = r.vehicle
        ? [r.vehicle.model, r.vehicle.license_plate].filter(Boolean).join(" · ")
        : null;
      return {
        code: r.code,
        locationName: r.location?.name ?? "",
        companyName: r.location?.company?.name ?? "",
        parkingTypeName: parkingItem?.parking_type?.name ?? null,
        vehicleLabel,
        listingUrl,
      };
    },
    enabled: !!profileId,
    staleTime: 60_000,
  });
}

/** Atribui uma indicação (novo cliente informa o código de quem o indicou). */
export function useRedeemReferral() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (code: string): Promise<{ ok: boolean; error?: string }> => {
      const { data, error } = await supabase.rpc("redeem_referral_code", { p_code: code });
      if (error) throw error;
      return data as unknown as { ok: boolean; error?: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: growthKeys.referrals }),
  });
}
