import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database";
import type { ParkingType } from "@/types/domain";

type LocationParkingTypeRow = Database["public"]["Tables"]["location_parking_type"]["Row"];
type LocationParkingTypeInsert = Database["public"]["Tables"]["location_parking_type"]["Insert"];
type LocationParkingTypeUpdate = Database["public"]["Tables"]["location_parking_type"]["Update"];
type CompanyParkingTypeRow = Database["public"]["Tables"]["company_parking_type"]["Row"];
type CompanyParkingTypeInsert =
  Database["public"]["Tables"]["company_parking_type"]["Insert"];
type CompanyParkingTypeUpdate =
  Database["public"]["Tables"]["company_parking_type"]["Update"];
type PricingTierRow = Database["public"]["Tables"]["pricing_tier"]["Row"];
type PricingTierInsert = Database["public"]["Tables"]["pricing_tier"]["Insert"];
type PricingTierUpdate = Database["public"]["Tables"]["pricing_tier"]["Update"];
type PricingRuleRow = Database["public"]["Tables"]["pricing_rule"]["Row"];
type PricingRuleInsert = Database["public"]["Tables"]["pricing_rule"]["Insert"];
type PricingRuleUpdate = Database["public"]["Tables"]["pricing_rule"]["Update"];

export type CompanyParkingTypeWithCatalog = CompanyParkingTypeRow & {
  parking_type: Pick<ParkingType, "id" | "code" | "name">;
};

export type LocationParkingTypeWithRelations = LocationParkingTypeRow & {
  company_parking_type: {
    id: string;
    base_price: number;
    parking_type: { id: string; code: string; name: string };
  };
  pricing_rule: (PricingRuleRow & { tiers: PricingTierRow[] }) | null;
};

export const parkingTypesKeys = {
  all: ["parking-types"] as const,
  byLocation: (locationId: string) =>
    [...parkingTypesKeys.all, "location", locationId] as const,
};

export function useLocationParkingTypes(locationId: string | undefined) {
  return useQuery({
    queryKey: locationId
      ? parkingTypesKeys.byLocation(locationId)
      : ["parking-types", "location", "none"],
    queryFn: async (): Promise<LocationParkingTypeWithRelations[]> => {
      if (!locationId) return [];
      const { data, error } = await supabase
        .from("location_parking_type")
        .select(
          "*, company_parking_type:company_parking_type(id, base_price, parking_type:parking_type(id, code, name)), pricing_rule:pricing_rule!pricing_rule_location_parking_type_id_fkey(*, tiers:pricing_tier(*))",
        )
        .eq("location_id", locationId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as LocationParkingTypeWithRelations[];
    },
    enabled: !!locationId,
  });
}

export function useUpdateLocationParkingType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: LocationParkingTypeUpdate }) => {
      const { error } = await supabase
        .from("location_parking_type")
        .update(patch)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: parkingTypesKeys.all }),
  });
}

/* ------------------- Catálogo global + por empresa ---------------- */

export function useGlobalParkingTypes() {
  return useQuery({
    queryKey: ["parking-types", "catalog"] as const,
    queryFn: async (): Promise<ParkingType[]> => {
      const { data, error } = await supabase
        .from("parking_type")
        .select("*")
        .order("name");
      if (error) throw error;
      return (data ?? []) as ParkingType[];
    },
  });
}

export function useCompanyParkingTypes(companyId: string | undefined) {
  return useQuery({
    queryKey: companyId ? (["parking-types", "company", companyId] as const) : (["parking-types", "company", "none"] as const),
    queryFn: async (): Promise<CompanyParkingTypeWithCatalog[]> => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("company_parking_type")
        .select("*, parking_type:parking_type(id, code, name)")
        .eq("company_id", companyId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as CompanyParkingTypeWithCatalog[];
    },
    enabled: !!companyId,
  });
}

export function useEnableCompanyParkingType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CompanyParkingTypeInsert): Promise<CompanyParkingTypeRow> => {
      const { data, error } = await supabase
        .from("company_parking_type")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as CompanyParkingTypeRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: parkingTypesKeys.all }),
  });
}

export function useCreateLocationParkingType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: LocationParkingTypeInsert) => {
      const { data, error } = await supabase
        .from("location_parking_type")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as LocationParkingTypeRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: parkingTypesKeys.all }),
  });
}

export function useUpdateCompanyParkingType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: CompanyParkingTypeUpdate;
    }) => {
      const { error } = await supabase.from("company_parking_type").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: parkingTypesKeys.all }),
  });
}

/* ------------------- Pricing rule + tier ---------------- */

export function useUpsertPricingRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: PricingRuleInsert): Promise<PricingRuleRow> => {
      // Há unique constraint em location_parking_type_id → upsert nessa coluna
      const { data, error } = await supabase
        .from("pricing_rule")
        .upsert(payload, { onConflict: "location_parking_type_id" })
        .select()
        .single();
      if (error) throw error;
      return data as PricingRuleRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: parkingTypesKeys.all }),
  });
}

export function useUpdatePricingRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: PricingRuleUpdate }) => {
      const { error } = await supabase.from("pricing_rule").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: parkingTypesKeys.all }),
  });
}

export function useCreatePricingTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: PricingTierInsert) => {
      const { error } = await supabase.from("pricing_tier").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: parkingTypesKeys.all }),
  });
}

export function useUpdatePricingTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: PricingTierUpdate }) => {
      const { error } = await supabase.from("pricing_tier").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: parkingTypesKeys.all }),
  });
}

export function useDeletePricingTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pricing_tier").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: parkingTypesKeys.all }),
  });
}

/* ------------------- Outras LPTs (para escolher fonte de surcharge) ---------------- */

export function useLocationParkingTypesByCompany(
  companyId: string | undefined,
  excludeId?: string,
) {
  return useQuery({
    queryKey: ["parking-types", "by-company", companyId, excludeId ?? "none"] as const,
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("location_parking_type")
        .select(
          "id, location:location(id, name), company_parking_type:company_parking_type(id, company_id, parking_type:parking_type(name))",
        );
      if (error) throw error;
      type Row = {
        id: string;
        location: { id: string; name: string } | null;
        company_parking_type: {
          id: string;
          company_id: string;
          parking_type: { name: string } | null;
        };
      };
      return ((data ?? []) as unknown as Row[])
        .filter((r) => r.id !== excludeId)
        .filter((r) => r.company_parking_type.company_id === companyId)
        .map((r) => ({
          id: r.id,
          label: `${r.location?.name ?? "?"} · ${r.company_parking_type.parking_type?.name ?? "?"}`,
        }));
    },
    enabled: !!companyId,
  });
}

/* ------------------- Simulador de preço (RPC) ---------------- */

type SimulateResult =
  | { price: number; old_price?: number | null; error?: string }
  | { error: string };

export function useSimulatePrice() {
  return useMutation({
    mutationFn: async (args: {
      company: string;
      location: string;
      parkingType: string;
      days: number;
    }): Promise<SimulateResult> => {
      const { data, error } = await supabase.rpc("simulate_price", {
        p_company: args.company,
        p_location: args.location,
        p_parking_type: args.parkingType,
        p_days: args.days,
      });
      if (error) throw error;
      return data as SimulateResult;
    },
  });
}
