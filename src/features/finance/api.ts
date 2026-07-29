import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

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
        .select("total_amount, location:location(company:company(id, name, take_rate_bps))")
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
          company: { id: string; name: string; take_rate_bps: number } | null;
        } | null;
      }>) {
        const company = row.location?.company;
        if (!company) continue;
        const existing = map.get(company.id) ?? {
          companyId: company.id,
          companyName: company.name,
          reservations: 0,
          grossRevenue: 0,
          takeRateBps: company.take_rate_bps ?? 0,
        };
        existing.reservations += 1;
        existing.grossRevenue += Number(row.total_amount ?? 0);
        map.set(company.id, existing);
      }
      return Array.from(map.values()).sort((a, b) => b.grossRevenue - a.grossRevenue);
    },
  });
}
