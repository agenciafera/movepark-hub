import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { withRestricted } from "@/features/companies/api";

export type CompanyFinance = {
  companyId: string;
  companyName: string;
  reservations: number;
  grossRevenue: number;
  /** Comissão da Movepark da empresa, em basis points (1500 = 15%). */
  takeRateBps: number;
};

/**
 * Receita por empresa no intervalo (`from` inclusivo, `to` exclusivo), com recorte
 * opcional por unidade. O intervalo vem do filtro do Manager, então "faturamento"
 * deixa de ser só mês fechado e aceita qualquer recorte.
 */
export function useCompanyFinance(fromIso: string, toIso: string, locationIds?: string[]) {
  return useQuery({
    queryKey: ["finance", "company", fromIso, toIso, locationIds],
    queryFn: async (): Promise<CompanyFinance[]> => {
      let q = supabase
        .from("booking")
        // `take_rate_bps` não é legível pelo PostgREST (migration 20261129090500): vem da RPC de admin.
        .select("total_amount, location:location(company:company(id, name))")
        .gte("check_in_at", fromIso)
        .lt("check_in_at", toIso)
        .in("status", ["confirmed", "checked_in", "completed"]);
      if (locationIds?.length) q = q.in("location_id", locationIds);
      const { data, error } = await q;
      if (error) throw error;

      const map = new Map<string, CompanyFinance>();
      for (const row of (data ?? []) as unknown as Array<{
        total_amount: number;
        location: {
          company: { id: string; name: string } | null;
        } | null;
      }>) {
        const company = row.location?.company;
        if (!company) continue;
        const existing = map.get(company.id) ?? {
          companyId: company.id,
          companyName: company.name,
          reservations: 0,
          grossRevenue: 0,
          takeRateBps: 0,
        };
        existing.reservations += 1;
        existing.grossRevenue += Number(row.total_amount ?? 0);
        map.set(company.id, existing);
      }
      const rates = await withRestricted(Array.from(map.keys()).map((id) => ({ id })));
      for (const r of rates) {
        const row = map.get(r.id);
        if (row) row.takeRateBps = r.take_rate_bps ?? 0;
      }
      return Array.from(map.values()).sort((a, b) => b.grossRevenue - a.grossRevenue);
    },
  });
}
