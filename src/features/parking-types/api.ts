import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database, Json } from "@/types/database";
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
type PricingRuleRow = Database["public"]["Tables"]["pricing_rule"]["Row"];

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

/**
 * Salva a precificação (regra + faixas + base) numa única RPC SECURITY DEFINER, que valida a posse
 * da empresa (E1.4.1). As tabelas pricing_rule/pricing_tier têm RLS só de leitura, e a escrita direta
 * pelo operador dava 403; a RPC é o caminho server-authoritative.
 */
export function useOperatorSetPricing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      locationParkingTypeId: string;
      basePrice: number | null;
      rule: Record<string, unknown>;
      tiers: { from_day: number; to_day: number | null; unit_price: number | null; total_price: number | null }[];
    }) => {
      const { error } = await supabase.rpc("operator_set_pricing", {
        p_location_parking_type_id: args.locationParkingTypeId,
        // a RPC aceita null (numeric); o tipo gerado não reflete a nulidade do parâmetro
        p_base_price: args.basePrice as number,
        p_rule: args.rule as Json,
        p_tiers: args.tiers as unknown as Json,
      });
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
