import { useQuery } from "@tanstack/react-query";
import { startOfDay, startOfMonth, subDays, addDays, format } from "date-fns";
import { supabase } from "@/lib/supabase";
import type { DailyFlow, LocationOccupancyRow, ManagerOverview } from "@/types/domain";
import {
  summarizePeriod,
  averageLeadTimeDays,
  channelMix,
  aggregateOccupancy,
  fareRevenueMix,
} from "./dashboardMetrics.logic";

function isoStartOfMonth(d = new Date()) {
  return startOfMonth(d).toISOString();
}
function isoStartOfDay(d = new Date()) {
  return startOfDay(d).toISOString();
}

export type ManagerStats = {
  bookingsToday: number;
  bookingsYesterday: number;
  checkInsToday: number;
  checkOutsToday: number;
  activeCompanies: number;
  activeLocations: number;
};

/**
 * O pulso de hoje no Manager: chegadas previstas, quem já entrou e quem já saiu, e o
 * tamanho da rede ativa. Todo recorte de "hoje" é fechado nos dois lados: sem o
 * `lt` do fim do dia, "reservas hoje" virava "todas as reservas de hoje em diante"
 * e a comparação com ontem não queria dizer nada.
 */
async function fetchManagerStats(): Promise<ManagerStats> {
  const now = new Date();
  const todayStart = isoStartOfDay(now);
  const tomorrowStart = isoStartOfDay(addDays(now, 1));
  const yesterdayStart = isoStartOfDay(subDays(now, 1));

  const [
    bookingsToday,
    bookingsYesterday,
    checkInsToday,
    checkOutsToday,
    activeCompanies,
    activeLocations,
  ] = await Promise.all([
    supabase
      .from("booking")
      .select("id", { count: "exact", head: true })
      .gte("check_in_at", todayStart)
      .lt("check_in_at", tomorrowStart),
    supabase
      .from("booking")
      .select("id", { count: "exact", head: true })
      .gte("check_in_at", yesterdayStart)
      .lt("check_in_at", todayStart),
    supabase
      .from("booking")
      .select("id", { count: "exact", head: true })
      .gte("checked_in_at", todayStart)
      .lt("checked_in_at", tomorrowStart),
    supabase
      .from("booking")
      .select("id", { count: "exact", head: true })
      .gte("checked_out_at", todayStart)
      .lt("checked_out_at", tomorrowStart),
    supabase.from("company").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase
      .from("location")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .is("deleted_at", null),
  ]);

  return {
    bookingsToday: bookingsToday.count ?? 0,
    bookingsYesterday: bookingsYesterday.count ?? 0,
    checkInsToday: checkInsToday.count ?? 0,
    checkOutsToday: checkOutsToday.count ?? 0,
    activeCompanies: activeCompanies.count ?? 0,
    activeLocations: activeLocations.count ?? 0,
  };
}

export function useManagerStats() {
  return useQuery({
    queryKey: ["dashboard", "manager-stats"],
    queryFn: fetchManagerStats,
  });
}

/**
 * Resumo do período no Manager (RPC `manager_dashboard_overview`, só hub_admin).
 * Receita, diárias vendidas, permanência, destino e novos x recorrentes saem
 * agregados do banco: o front não varre reserva pra somar.
 */
export function useManagerOverview(days: number) {
  return useQuery({
    queryKey: ["dashboard", "manager-overview", days],
    staleTime: 60_000,
    queryFn: async (): Promise<ManagerOverview> => {
      const now = new Date();
      const { data, error } = await supabase.rpc("manager_dashboard_overview", {
        p_from: subDays(now, days).toISOString(),
        p_to: now.toISOString(),
      });
      if (error) throw error;
      return data as unknown as ManagerOverview;
    },
  });
}

/**
 * Fluxo de veículos hora a hora num dia (RPC `manager_daily_flow`, só hub_admin).
 * `date` é a data local no formato `yyyy-MM-dd`; a hora sai no fuso de cada unidade.
 */
export function useManagerDailyFlow(date: string) {
  return useQuery({
    queryKey: ["dashboard", "manager-daily-flow", date],
    staleTime: 60_000,
    queryFn: async (): Promise<DailyFlow> => {
      const { data, error } = await supabase.rpc("manager_daily_flow", { p_date: date });
      if (error) throw error;
      return data as unknown as DailyFlow;
    },
  });
}

/** Hoje no formato que a RPC de fluxo espera. */
export function todayIsoDate() {
  return format(new Date(), "yyyy-MM-dd");
}

/**
 * Mix de tarifa com a receita da tarifa (o que a Movepark ganha por tipo), hub-wide.
 * Visão de Super Admin (a RLS de hub_admin vê todas as reservas). Não expor no /operator.
 */
export function useFareRevenueMix(days = 30) {
  return useQuery({
    queryKey: ["dashboard", "fare-revenue-mix", days],
    queryFn: async () => {
      const since = subDays(new Date(), days).toISOString();
      const { data, error } = await supabase
        .from("booking")
        .select("fare_tier, fare_price_cents")
        .gte("check_in_at", since)
        .in("status", ["confirmed", "checked_in", "completed"]);
      if (error) throw error;
      return fareRevenueMix(
        (data ?? []) as { fare_tier: string | null; fare_price_cents: number | null }[],
      );
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

/**
 * Ocupação agregada das unidades no escopo, num intervalo de datas. Chama a RPC
 * `operator_location_occupancy` (já segura, por unidade) e soma no cliente. Serve pra
 * ocupação do dashboard e pra base do RevPAR (capacidade-dia).
 */
export function useOccupancyAgg(locationIds: string[] | undefined, from: string, to: string) {
  return useQuery({
    queryKey: ["dashboard", "occupancy-agg", locationIds, from, to],
    enabled: !!locationIds?.length,
    staleTime: 30_000,
    queryFn: async (): Promise<{ capacityDays: number; bookedDays: number }> => {
      const results = await Promise.all(
        (locationIds ?? []).map((id) =>
          supabase.rpc("operator_location_occupancy", {
            p_location_id: id,
            p_from: from,
            p_to: to,
          }),
        ),
      );
      const rows: LocationOccupancyRow[] = [];
      for (const res of results) {
        if (res.error) throw res.error;
        rows.push(...((res.data ?? []) as LocationOccupancyRow[]));
      }
      return aggregateOccupancy(rows);
    },
  });
}

export function useOperatorStats(locationIds?: string[]) {
  return useQuery({
    queryKey: ["dashboard", "operator-stats", locationIds],
    queryFn: async (): Promise<OperatorStats> => {
      const now = new Date();
      const todayStart = isoStartOfDay(now);
      const tomorrowStart = isoStartOfDay(addDays(now, 1));
      const monthStart = isoStartOfMonth(now);

      // "Hoje" fecha nos dois lados: só `gte` faria o card contar todo o futuro.
      const baseToday = supabase
        .from("booking")
        .select("id", { count: "exact", head: true })
        .gte("check_in_at", todayStart)
        .lt("check_in_at", tomorrowStart);
      const baseCheckIn = supabase
        .from("booking")
        .select("id", { count: "exact", head: true })
        .gte("checked_in_at", todayStart)
        .lt("checked_in_at", tomorrowStart);
      const baseCheckOut = supabase
        .from("booking")
        .select("id", { count: "exact", head: true })
        .gte("checked_out_at", todayStart)
        .lt("checked_out_at", tomorrowStart);
      const baseRevenue = supabase
        .from("booking")
        .select("total_amount")
        .gte("check_in_at", monthStart)
        .in("status", ["confirmed", "checked_in", "completed"]);

      const today = locationIds?.length ? baseToday.in("location_id", locationIds) : baseToday;
      const checkIn = locationIds?.length
        ? baseCheckIn.in("location_id", locationIds)
        : baseCheckIn;
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
