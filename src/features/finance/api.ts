import { useQuery } from "@tanstack/react-query";
import { endOfMonth, startOfMonth } from "date-fns";
import { supabase } from "@/lib/supabase";

export type CompanyFinance = {
  companyId: string;
  companyName: string;
  reservations: number;
  grossRevenue: number;
  /** Comissão da Movepark da empresa, em basis points (1500 = 15%). */
  takeRateBps: number;
};

export function useCompanyFinance(month: Date) {
  return useQuery({
    queryKey: ["finance", "company", month.toISOString().slice(0, 7)],
    queryFn: async (): Promise<CompanyFinance[]> => {
      const from = startOfMonth(month).toISOString();
      const to = endOfMonth(month).toISOString();
      const { data, error } = await supabase
        .from("booking")
        .select("total_amount, location:location(company:company(id, name, take_rate_bps))")
        .gte("check_in_at", from)
        .lte("check_in_at", to)
        .in("status", ["confirmed", "checked_in", "completed"]);
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
