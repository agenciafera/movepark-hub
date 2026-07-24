import { useQuery } from "@tanstack/react-query";
import { startOfDay, startOfMonth, subDays, subMonths } from "date-fns";
import { supabase } from "@/lib/supabase";
import { summarizePeriod, averageLeadTimeDays, channelMix } from "./dashboardMetrics.logic";

function isoStartOfMonth(d = new Date()) {
  return startOfMonth(d).toISOString();
}
function isoStartOfDay(d = new Date()) {
  return startOfDay(d).toISOString();
}

export type ManagerStats = {
  bookingsToday: number;
  bookingsYesterday: number;
  revenueThisMonth: number;
  revenueLastMonth: number;
  averageTicketThisMonth: number;
  activeCompanies: number;
};

async function fetchManagerStats(): Promise<ManagerStats> {
  const now = new Date();
  const todayStart = isoStartOfDay(now);
  const yesterdayStart = isoStartOfDay(subDays(now, 1));
  const monthStart = isoStartOfMonth(now);
  const lastMonthStart = isoStartOfMonth(subMonths(now, 1));

  const [
    bookingsToday,
    bookingsYesterday,
    revenueThisMonth,
    revenueLastMonth,
    activeCompanies,
  ] = await Promise.all([
    supabase
      .from("booking")
      .select("id", { count: "exact", head: true })
      .gte("check_in_at", todayStart),
    supabase
      .from("booking")
      .select("id", { count: "exact", head: true })
      .gte("check_in_at", yesterdayStart)
      .lt("check_in_at", todayStart),
    supabase
      .from("booking")
      .select("total_amount")
      .gte("check_in_at", monthStart)
      .in("status", ["confirmed", "checked_in", "completed"]),
    supabase
      .from("booking")
      .select("total_amount")
      .gte("check_in_at", lastMonthStart)
      .lt("check_in_at", monthStart)
      .in("status", ["confirmed", "checked_in", "completed"]),
    supabase.from("company").select("id", { count: "exact", head: true }).eq("status", "active"),
  ]);

  const sum = (rows: { total_amount: number }[] | null) =>
    (rows ?? []).reduce((acc, r) => acc + Number(r.total_amount ?? 0), 0);
  const revenue = sum(revenueThisMonth.data ?? []);
  const monthBookingsCount = revenueThisMonth.data?.length ?? 0;

  return {
    bookingsToday: bookingsToday.count ?? 0,
    bookingsYesterday: bookingsYesterday.count ?? 0,
    revenueThisMonth: revenue,
    revenueLastMonth: sum(revenueLastMonth.data ?? []),
    averageTicketThisMonth: monthBookingsCount ? revenue / monthBookingsCount : 0,
    activeCompanies: activeCompanies.count ?? 0,
  };
}

export function useManagerStats() {
  return useQuery({
    queryKey: ["dashboard", "manager-stats"],
    queryFn: fetchManagerStats,
  });
}

export type DailyRevenue = { date: string; total: number };

export function useRevenueLastDays(days = 30) {
  return useQuery({
    queryKey: ["dashboard", "revenue", days],
    queryFn: async (): Promise<DailyRevenue[]> => {
      const since = subDays(new Date(), days).toISOString();
      const { data, error } = await supabase
        .from("booking")
        .select("check_in_at, total_amount")
        .gte("check_in_at", since)
        .in("status", ["confirmed", "checked_in", "completed"]);
      if (error) throw error;
      const map = new Map<string, number>();
      for (const row of data ?? []) {
        const key = (row.check_in_at as string).slice(0, 10);
        map.set(key, (map.get(key) ?? 0) + Number(row.total_amount ?? 0));
      }
      return Array.from(map.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, total]) => ({ date, total }));
    },
  });
}

export type OperatorStats = {
  bookingsToday: number;
  checkInsToday: number;
  checkOutsToday: number;
  revenueThisMonth: number;
};

export type PeriodDays = 7 | 30 | 90;

/**
 * Receita, reservas e ticket médio do período, com o período ANTERIOR do mesmo
 * tamanho para comparar. Uma query só: busca 2× o período e o `summarizePeriod`
 * separa. Conta só reservas que valem receita (confirmed/checked_in/completed).
 */
export function useOperatorPeriodSummary(periodDays: PeriodDays, locationIds?: string[]) {
  return useQuery({
    queryKey: ["dashboard", "operator-period", periodDays, locationIds],
    queryFn: async () => {
      const now = new Date();
      const periodStart = subDays(now, periodDays).toISOString();
      const windowStart = subDays(now, periodDays * 2).toISOString();
      // fare_tier NÃO entra aqui: o mix de tarifa (Básica/Flex/Superflex) revela quanto a
      // Movepark ganha por reserva e é visão de Super Admin, não do dono. O canal (site/API)
      // é operacional e pode aparecer para o dono.
      let q = supabase
        .from("booking")
        .select("check_in_at, total_amount, created_at, created_via_api_key_id")
        .gte("check_in_at", windowStart)
        .in("status", ["confirmed", "checked_in", "completed"]);
      if (locationIds?.length) q = q.in("location_id", locationIds);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as {
        check_in_at: string;
        total_amount: number | string | null;
        created_at: string;
        created_via_api_key_id: string | null;
      }[];
      const split = summarizePeriod(rows, periodStart);
      // Lead time e canal são do período atual (as reservas com check-in dentro dele).
      const currentRows = rows.filter((r) => r.check_in_at >= periodStart);
      return {
        ...split,
        leadTimeDays: averageLeadTimeDays(currentRows),
        channelMix: channelMix(currentRows),
      };
    },
  });
}

/** Reservas confirmadas com check-in nos próximos `periodDays`: o olhar pra frente. */
export function useUpcomingBookingsCount(periodDays: PeriodDays, locationIds?: string[]) {
  return useQuery({
    queryKey: ["dashboard", "operator-upcoming", periodDays, locationIds],
    queryFn: async (): Promise<number> => {
      const now = new Date();
      const until = new Date(now.getTime() + periodDays * 24 * 60 * 60 * 1000).toISOString();
      let q = supabase
        .from("booking")
        .select("id", { count: "exact", head: true })
        .gte("check_in_at", now.toISOString())
        .lte("check_in_at", until)
        .in("status", ["confirmed", "checked_in"]);
      if (locationIds?.length) q = q.in("location_id", locationIds);
      const { count, error } = await q;
      if (error) throw error;
      return count ?? 0;
    },
  });
}

/** Unidades da empresa em alta demanda hoje (RPC `locations_high_demand_today`). */
export function useHighDemandToday(locationIds?: string[]) {
  return useQuery({
    queryKey: ["dashboard", "high-demand-today", locationIds],
    enabled: !!locationIds?.length,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc("locations_high_demand_today", {
        p_location_ids: locationIds!,
      });
      if (error) throw error;
      return (data ?? []).length;
    },
  });
}

export function useOperatorStats(locationIds?: string[]) {
  return useQuery({
    queryKey: ["dashboard", "operator-stats", locationIds],
    queryFn: async (): Promise<OperatorStats> => {
      const now = new Date();
      const todayStart = isoStartOfDay(now);
      const monthStart = isoStartOfMonth(now);

      const baseToday = supabase
        .from("booking")
        .select("id", { count: "exact", head: true })
        .gte("check_in_at", todayStart);
      const baseCheckIn = supabase
        .from("booking")
        .select("id", { count: "exact", head: true })
        .gte("checked_in_at", todayStart);
      const baseCheckOut = supabase
        .from("booking")
        .select("id", { count: "exact", head: true })
        .gte("checked_out_at", todayStart);
      const baseRevenue = supabase
        .from("booking")
        .select("total_amount")
        .gte("check_in_at", monthStart)
        .in("status", ["confirmed", "checked_in", "completed"]);

      const today = locationIds?.length ? baseToday.in("location_id", locationIds) : baseToday;
      const checkIn = locationIds?.length ? baseCheckIn.in("location_id", locationIds) : baseCheckIn;
      const checkOut = locationIds?.length
        ? baseCheckOut.in("location_id", locationIds)
        : baseCheckOut;
      const revenue = locationIds?.length
        ? baseRevenue.in("location_id", locationIds)
        : baseRevenue;

      const [t, ci, co, rev] = await Promise.all([today, checkIn, checkOut, revenue]);

      const revenueTotal = (rev.data ?? []).reduce(
        (acc, r) => acc + Number(r.total_amount ?? 0),
        0,
      );

      return {
        bookingsToday: t.count ?? 0,
        checkInsToday: ci.count ?? 0,
        checkOutsToday: co.count ?? 0,
        revenueThisMonth: revenueTotal,
      };
    },
  });
}
