import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { startOfDay, startOfMonth, subDays, addDays, format } from "date-fns";
import { supabase } from "@/lib/supabase";
import type {
  BookingWithRelations,
  DailyFlow,
  LocationOccupancyRow,
  ManagerOverview,
} from "@/types/domain";
import type { Range } from "@/features/manager-filters/managerFilters.logic";
import {
  summarizeRanges,
  averageLeadTimeDays,
  channelMix,
  aggregateOccupancy,
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
async function fetchManagerStats(locationIds?: string[]): Promise<ManagerStats> {
  const now = new Date();
  const todayStart = isoStartOfDay(now);
  const tomorrowStart = isoStartOfDay(addDays(now, 1));
  const yesterdayStart = isoStartOfDay(subDays(now, 1));
  const scope = <T extends { in: (col: string, v: string[]) => T }>(q: T) =>
    locationIds?.length ? q.in("location_id", locationIds) : q;

  const [
    bookingsToday,
    bookingsYesterday,
    checkInsToday,
    checkOutsToday,
    activeCompanies,
    activeLocations,
  ] = await Promise.all([
    scope(
      supabase
        .from("booking")
        .select("id", { count: "exact", head: true })
        .gte("check_in_at", todayStart)
        .lt("check_in_at", tomorrowStart),
    ),
    scope(
      supabase
        .from("booking")
        .select("id", { count: "exact", head: true })
        .gte("check_in_at", yesterdayStart)
        .lt("check_in_at", todayStart),
    ),
    scope(
      supabase
        .from("booking")
        .select("id", { count: "exact", head: true })
        .gte("checked_in_at", todayStart)
        .lt("checked_in_at", tomorrowStart),
    ),
    scope(
      supabase
        .from("booking")
        .select("id", { count: "exact", head: true })
        .gte("checked_out_at", todayStart)
        .lt("checked_out_at", tomorrowStart),
    ),
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

export function useManagerStats(locationIds?: string[]) {
  return useQuery({
    queryKey: ["dashboard", "manager-stats", locationIds],
    queryFn: () => fetchManagerStats(locationIds),
  });
}

/**
 * Resumo do período no Manager (RPC `manager_dashboard_overview`, só hub_admin).
 * Receita, diárias vendidas, permanência, destino e novos x recorrentes saem
 * agregados do banco: o front não varre reserva pra somar.
 */
export function useManagerOverview(
  range: Range,
  compareRange: Range | null,
  locationIds?: string[],
) {
  const from = range.from.toISOString();
  const to = range.to.toISOString();
  const compareFrom = compareRange?.from.toISOString() ?? null;
  const compareTo = compareRange?.to.toISOString() ?? null;
  return useQuery({
    queryKey: ["dashboard", "manager-overview", from, to, compareFrom, compareTo, locationIds],
    staleTime: 60_000,
    queryFn: async (): Promise<ManagerOverview> => {
      const { data, error } = await supabase.rpc("manager_dashboard_overview", {
        p_from: from,
        p_to: to,
        // Sem comparação escolhida, a RPC cai no período anterior do mesmo tamanho.
        ...(compareFrom && compareTo
          ? { p_compare_from: compareFrom, p_compare_to: compareTo }
          : {}),
        ...(locationIds?.length ? { p_location_ids: locationIds } : {}),
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
export function useManagerDailyFlow(date: string, locationIds?: string[]) {
  return useQuery({
    queryKey: ["dashboard", "manager-daily-flow", date, locationIds],
    staleTime: 60_000,
    queryFn: async (): Promise<DailyFlow> => {
      const { data, error } = await supabase.rpc("manager_daily_flow", {
        p_date: date,
        ...(locationIds?.length ? { p_location_ids: locationIds } : {}),
      });
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
 * Meta de receita da empresa (centavos) e o que ela já vendeu contra isso. Nula
 * quer dizer "sem meta": o card mostra só o realizado em vez de inventar um alvo.
 */
export function useCompanyRevenueGoal(companyId: string | undefined) {
  return useQuery({
    queryKey: ["dashboard", "revenue-goal", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<number | null> => {
      const { data, error } = await supabase
        .from("company")
        .select("monthly_revenue_goal_cents")
        .eq("id", companyId!)
        .maybeSingle();
      if (error) throw error;
      return data?.monthly_revenue_goal_cents ?? null;
    },
  });
}

/** Define a meta (RPC `operator_set_revenue_goal`, exige `finance:write`). */
export function useSetRevenueGoal(companyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (goalCents: number | null) => {
      if (!companyId) throw new Error("Empresa não identificada.");
      const { error } = await supabase.rpc("operator_set_revenue_goal", {
        p_company_id: companyId,
        p_goal_cents: goalCents ?? 0,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dashboard", "revenue-goal"] }),
  });
}

const agendaSelect =
  "*, profile:profiles(id, full_name, tax_id), location:location(id, name, slug, timezone, company:company(id, name, slug)), vehicle:vehicle(id, license_plate, model, color)";

/**
 * Reservas de um dia (chegando ou saindo), pra agenda do painel do parceiro.
 * `dateIso` é a data local (`yyyy-MM-dd`); o recorte é do 00:00 ao 24:00 local.
 */
export function useDayAgenda(dateIso: string, locationIds?: string[]) {
  return useQuery({
    queryKey: ["operator", "day-agenda", dateIso, locationIds],
    queryFn: async (): Promise<BookingWithRelations[]> => {
      const [y, m, d] = dateIso.split("-").map(Number);
      const dayStart = new Date(y, (m ?? 1) - 1, d ?? 1).toISOString();
      const dayEnd = new Date(y, (m ?? 1) - 1, (d ?? 1) + 1).toISOString();
      let q = supabase
        .from("booking")
        .select(agendaSelect)
        .or(
          `and(check_in_at.gte.${dayStart},check_in_at.lt.${dayEnd}),and(check_out_at.gte.${dayStart},check_out_at.lt.${dayEnd})`,
        )
        .order("check_in_at", { ascending: true })
        .limit(80);
      if (locationIds?.length) q = q.in("location_id", locationIds);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as BookingWithRelations[];
    },
    refetchInterval: 60_000,
  });
}

export type OperatorStats = {
  bookingsToday: number;
  checkInsToday: number;
  checkOutsToday: number;
  revenueThisMonth: number;
};

export type PeriodDays = 7 | 30 | 90;

type PaidBookingRow = {
  check_in_at: string;
  check_out_at: string;
  total_amount: number | string | null;
  created_at: string;
  created_via_api_key_id: string | null;
};

/**
 * fare_tier NÃO entra aqui: o mix de tarifa (Básica/Flex/Superflex) revela quanto a
 * Movepark ganha por reserva e é visão de Super Admin, não do dono. O canal (site/API)
 * é operacional e pode aparecer para o dono.
 */
async function fetchPaidBookings(
  from: string,
  to: string,
  locationIds?: string[],
): Promise<PaidBookingRow[]> {
  let q = supabase
    .from("booking")
    .select("check_in_at, check_out_at, total_amount, created_at, created_via_api_key_id")
    .gte("check_in_at", from)
    .lt("check_in_at", to)
    .in("status", ["confirmed", "checked_in", "completed"]);
  if (locationIds?.length) q = q.in("location_id", locationIds);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as PaidBookingRow[];
}

/**
 * Receita, reservas, ticket e diárias vendidas do período, com a janela de
 * comparação que o parceiro escolheu. Cada janela é uma query própria e fechada:
 * comparar com o ano passado buscando tudo de uma vez traria um ano inteiro de
 * reserva pra somar dois números. Conta só reserva que vale receita.
 */
export function useOperatorPeriodSummary(
  range: Range,
  compareRange: Range | null,
  locationIds?: string[],
) {
  const from = range.from.toISOString();
  const to = range.to.toISOString();
  const prevFrom = compareRange?.from.toISOString() ?? null;
  const prevTo = compareRange?.to.toISOString() ?? null;
  return useQuery({
    queryKey: ["dashboard", "operator-period", from, to, prevFrom, prevTo, locationIds],
    queryFn: async () => {
      const [currentRows, previousRows] = await Promise.all([
        fetchPaidBookings(from, to, locationIds),
        prevFrom && prevTo ? fetchPaidBookings(prevFrom, prevTo, locationIds) : null,
      ]);
      return {
        ...summarizeRanges(currentRows, previousRows),
        // Antecedência e canal são do período atual.
        leadTimeDays: averageLeadTimeDays(currentRows),
        channelMix: channelMix(currentRows),
      };
    },
  });
}

/** Reservas confirmadas com check-in nos próximos `periodDays`: o olhar pra frente. */
export function useUpcomingBookingsCount(periodDays: number, locationIds?: string[]) {
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
