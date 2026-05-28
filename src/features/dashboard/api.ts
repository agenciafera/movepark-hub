import { useQuery } from "@tanstack/react-query";
import { startOfDay, startOfMonth, subDays, subMonths } from "date-fns";
import { supabase } from "@/lib/supabase";

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
