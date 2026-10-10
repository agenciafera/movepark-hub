import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/context";
import type { Database } from "@/types/database";
import type { Company } from "@/types/domain";

/**
 * Colunas de `company` que um usuário logado lê pelo PostgREST (migration 20261129090500).
 *
 * `select("*")` não funciona mais: o privilégio é por coluna, e quatro colunas ficam de fora de
 * todo usuário (segredo do WPS, IP do aceite do contrato, tenant do WL e comissão). O hub_admin as
 * recebe por `manager_company_restricted`, juntadas em `withRestricted`. Coluna nova em `company`
 * precisa entrar aqui E no grant da migration, senão a tela não a vê.
 */
export const COMPANY_COLUMNS =
  "id, name, slug, legal_name, tax_id, status, created_at, updated_at, deleted_at, " +
  "onboarding_status, logo_url, wl_domain, wl_sync_enabled, wl_public_domain, hub_relationship, " +
  "wps_webhook_url, wps_webhook_enabled, contract_accepted_at, contract_version, contract_sha256, " +
  "contract_accepted_by, monthly_revenue_goal_cents, gateway_split_enabled, payout_release_days, " +
  "payout_auto_day, payout_auto_enabled";

/** Empresa como o Manager a vê: com os campos restritos e só a PRESENÇA do segredo do WPS. */
export type ManagedCompany = Company & { has_wps_webhook_secret?: boolean };

type RestrictedRow = {
  id: string;
  take_rate_bps: number;
  wl_tenant_key: string | null;
  has_wps_webhook_secret: boolean;
  contract_accepted_ip: string | null;
};

// A RPC não está em `database.ts` (o gen types vem apagando tipos que existem; ver
// src/features/wl-health/api.ts). O cast fica aqui só.
async function fetchRestricted(ids: string[]): Promise<Map<string, RestrictedRow>> {
  if (ids.length === 0) return new Map();
  const call = supabase.rpc.bind(supabase) as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  const { data, error } = await call("manager_company_restricted", { p_company_ids: ids });
  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as RestrictedRow[]).map((r) => [r.id, r]));
}

/** Junta os campos restritos (só hub_admin). O segredo do WPS nunca vem: só se ele existe. */
export async function withRestricted<T extends { id: string }>(rows: T[]): Promise<(T & Partial<RestrictedRow>)[]> {
  const extra = await fetchRestricted(rows.map((r) => r.id));
  return rows.map((r) => {
    const x = extra.get(r.id);
    return x
      ? {
          ...r,
          take_rate_bps: x.take_rate_bps,
          wl_tenant_key: x.wl_tenant_key,
          has_wps_webhook_secret: x.has_wps_webhook_secret,
          contract_accepted_ip: x.contract_accepted_ip,
        }
      : r;
  });
}

type CompanyInsert = Database["public"]["Tables"]["company"]["Insert"];
type CompanyUpdate = Database["public"]["Tables"]["company"]["Update"];

export const companiesKeys = {
  all: ["companies"] as const,
  list: () => [...companiesKeys.all, "list"] as const,
  detail: (id: string) => [...companiesKeys.all, "detail", id] as const,
};

/** `enabled` existe pro seletor da sidebar só buscar a lista quando o menu abre. */
export function useCompanies(enabled = true) {
  const isAdmin = useAuth().session?.role === "hub_admin";
  return useQuery({
    enabled,
    queryKey: [...companiesKeys.list(), isAdmin ? "admin" : "member"] as const,
    queryFn: async (): Promise<ManagedCompany[]> => {
      const { data, error } = await supabase
        .from("company")
        .select(COMPANY_COLUMNS)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      const rows = (data ?? []) as unknown as ManagedCompany[];
      return isAdmin ? ((await withRestricted(rows)) as ManagedCompany[]) : rows;
    },
  });
}

export function useCompany(id: string | undefined) {
  const isAdmin = useAuth().session?.role === "hub_admin";
  return useQuery({
    queryKey: id ? [...companiesKeys.detail(id), isAdmin ? "admin" : "member"] : ["companies", "detail", "none"],
    queryFn: async (): Promise<ManagedCompany | null> => {
      if (!id) return null;
      const { data, error } = await supabase.from("company").select(COMPANY_COLUMNS).eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as unknown as ManagedCompany;
      return isAdmin ? ((await withRestricted([row]))[0] as ManagedCompany) : row;
    },
    enabled: !!id,
  });
}

export function useCreateCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CompanyInsert) => {
      const { data, error } = await supabase.from("company").insert(payload).select(COMPANY_COLUMNS).single();
      if (error) throw error;
      return data as unknown as Company;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: companiesKeys.all }),
  });
}

export function useUpdateCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: CompanyUpdate }) => {
      const { data, error } = await supabase
        .from("company")
        .update(patch)
        .eq("id", id)
        .select(COMPANY_COLUMNS)
        .single();
      if (error) throw error;
      return data as unknown as Company;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: companiesKeys.all }),
  });
}

/**
 * Define a comissão da Movepark (take_rate) de uma empresa — server-authoritative.
 * Via RPC `set_company_take_rate` (gate hub_admin, valida 0..10000 bps). Ver ADR-005.
 */
export function useSetCompanyTakeRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ companyId, takeRateBps }: { companyId: string; takeRateBps: number }) => {
      const { data, error } = await supabase.rpc("set_company_take_rate", {
        p_company_id: companyId,
        p_take_rate_bps: takeRateBps,
      });
      if (error) throw error;
      // Desde 20261129130000 a RPC devolve só o que gravou (antes, a linha inteira com o segredo do WPS).
      return data as unknown as { id: string; take_rate_bps: number };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: companiesKeys.all });
      // O faturamento calcula a comissão com a take_rate real; invalida pra refletir.
      qc.invalidateQueries({ queryKey: ["finance"] });
    },
  });
}

