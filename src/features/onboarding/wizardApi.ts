import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { ParkingType } from "@/types/domain";

export const onboardingKeys = {
  all: ["onboarding-wizard"] as const,
  data: (companyId: string) => [...onboardingKeys.all, companyId] as const,
};

// Select dos tipos de vaga + preço do wizard. O embed de `pricing_rule` PRECISA do
// hint do FK `pricing_rule_location_parking_type_id_fkey` — pricing_rule tem 2 FKs
// p/ location_parking_type (location_parking_type_id e surcharge_source_id) e sem o
// hint o PostgREST retorna PGRST201 (relação ambígua), zerando os itens/preços.
export const WIZARD_LPT_SELECT =
  "id, capacity, company_parking_type:company_parking_type!inner(id, parking_type_id, base_price, parking_type:parking_type!inner(code, name)), pricing_rule:pricing_rule!pricing_rule_location_parking_type_id_fkey(id, strategy, pricing_tier(from_day, to_day, unit_price, total_price, is_old_price))";

// ── Tipos de visão do wizard ────────────────────────────────────────────────
export type WizardTier = {
  from_day: number;
  to_day: number | null;
  unit_price: number | null;
  total_price: number | null;
};

export type WizardParkingItem = {
  location_parking_type_id: string;
  company_parking_type_id: string;
  parking_type_id: string;
  code: string;
  name: string;
  base_price: number;
  capacity: number;
  strategy: string | null;
  tiers: WizardTier[];
};

export type WizardAddon = {
  add_on_service_id: string;
  location_id: string;
  code: string;
  name: string;
  base_price: number;
};

export type OnboardingData = {
  company: {
    id: string;
    name: string;
    legal_name: string | null;
    tax_id: string | null;
    logo_url: string | null;
    onboarding_status: string;
  };
  currentStep: number;
  location: {
    id: string;
    name: string;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    timezone: string;
    phone: string | null;
    email: string | null;
    reservation_policy: string | null;
    photos: string[];
  } | null;
  items: WizardParkingItem[];
  addons: WizardAddon[];
  catalog: Pick<ParkingType, "id" | "code" | "name">[];
};

export function useOnboardingData(companyId: string | undefined) {
  return useQuery({
    queryKey: companyId ? onboardingKeys.data(companyId) : [...onboardingKeys.all, "none"],
    enabled: !!companyId,
    queryFn: async (): Promise<OnboardingData> => {
      const cid = companyId!;

      const [{ data: company }, { data: onboarding }, { data: catalog }] = await Promise.all([
        supabase.from("company").select("id, name, legal_name, tax_id, logo_url, onboarding_status").eq("id", cid).single(),
        supabase.from("company_onboarding").select("current_step").eq("company_id", cid).maybeSingle(),
        supabase.from("parking_type").select("id, code, name").order("name"),
      ]);

      const { data: loc } = await supabase
        .from("location")
        .select("id, name, address, latitude, longitude, timezone, phone, email, reservation_policy, photos")
        .eq("company_id", cid)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      let items: WizardParkingItem[] = [];
      let addons: WizardAddon[] = [];

      if (loc) {
        // pricing_rule tem 2 FKs p/ location_parking_type (location_parking_type_id e
        // surcharge_source_id) → o embed precisa do hint do FK, senão o PostgREST
        // retorna PGRST201 (relação ambígua) e os itens (com preços) não carregam.
        const { data: lpts, error: lptsErr } = await supabase
          .from("location_parking_type")
          .select(WIZARD_LPT_SELECT)
          .eq("location_id", loc.id);
        if (lptsErr) throw lptsErr;

        // deno-lint-ignore no-explicit-any
        items = (lpts ?? []).map((r: any) => {
          const rule = Array.isArray(r.pricing_rule) ? r.pricing_rule[0] : r.pricing_rule;
          const tiers: WizardTier[] = (rule?.pricing_tier ?? [])
            // deno-lint-ignore no-explicit-any
            .filter((t: any) => !t.is_old_price)
            // deno-lint-ignore no-explicit-any
            .map((t: any) => ({
              from_day: t.from_day,
              to_day: t.to_day,
              unit_price: t.unit_price !== null ? Number(t.unit_price) : null,
              total_price: t.total_price !== null ? Number(t.total_price) : null,
            }))
            .sort((a: WizardTier, b: WizardTier) => a.from_day - b.from_day);
          return {
            location_parking_type_id: r.id,
            company_parking_type_id: r.company_parking_type.id,
            parking_type_id: r.company_parking_type.parking_type_id,
            code: r.company_parking_type.parking_type.code,
            name: r.company_parking_type.parking_type.name,
            base_price: Number(r.company_parking_type.base_price),
            capacity: r.capacity,
            strategy: rule?.strategy ?? null,
            tiers,
          };
        });

        const { data: las } = await supabase
          .from("location_add_on_service")
          .select("location_id, add_on_service:add_on_service!inner(id, code, name, base_price)")
          .eq("location_id", loc.id);
        // deno-lint-ignore no-explicit-any
        addons = (las ?? []).map((r: any) => ({
          add_on_service_id: r.add_on_service.id,
          location_id: r.location_id,
          code: r.add_on_service.code,
          name: r.add_on_service.name,
          base_price: Number(r.add_on_service.base_price),
        }));
      }

      return {
        // deno-lint-ignore no-explicit-any
        company: company as any,
        currentStep: onboarding?.current_step ?? 0,
        location: loc
          ? { ...loc, photos: Array.isArray(loc.photos) ? (loc.photos as string[]) : [] }
          : null,
        items,
        addons,
        catalog: catalog ?? [],
      };
    },
  });
}

// ── Mutations (RPCs SECURITY DEFINER) ───────────────────────────────────────
function useRpc<TArgs extends Record<string, unknown>>(
  fn: string,
  companyId: string | undefined,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: TArgs) => {
      // deno-lint-ignore no-explicit-any
      const { data, error } = await supabase.rpc(fn as any, args as any);
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      if (companyId) qc.invalidateQueries({ queryKey: onboardingKeys.data(companyId) });
    },
  });
}

export const useUpdateCompanyStep = (cid?: string) => useRpc("onboarding_update_company", cid);
export const useUpsertLocation = (cid?: string) => useRpc("onboarding_upsert_location", cid);
export const useSetParkingTypes = (cid?: string) => useRpc("onboarding_set_parking_types", cid);
export const useSetPricing = (cid?: string) => useRpc("onboarding_set_pricing", cid);
export const useSetAddons = (cid?: string) => useRpc("onboarding_set_addons", cid);
export const useSubmitOnboarding = (cid?: string) => useRpc("onboarding_submit", cid);

// ── Upload de assets públicos (logo/fotos) — bucket `assets-public` (OPS-05) ──
// Path por empresa (<company_id>/…) → a RLS de `assets-public` autoriza o operador
// a escrever só sob o prefixo da sua própria empresa. Leitura é pública (CDN).
const PUBLIC_ASSETS_BUCKET = "assets-public";
export async function uploadPartnerAsset(companyId: string, file: File, prefix: string): Promise<string> {
  const ext = file.name.split(".").pop() ?? "bin";
  const rand = Math.random().toString(36).slice(2, 9);
  const path = `${companyId}/${prefix}-${rand}.${ext}`;
  const { error } = await supabase.storage.from(PUBLIC_ASSETS_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: true,
  });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from(PUBLIC_ASSETS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
