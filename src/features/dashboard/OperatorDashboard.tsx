import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { bookingCustomerName } from "@/features/bookings/bookings.logic";
import { startOfDay, endOfDay } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiCard } from "@/components/shared/KpiCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";
import { useOperatorStats, useOperatorPeriodSummary } from "./api";
import {
  pctDelta,
  formatDelta,
  cancellationRate,
  cancellationBenchmark,
  averageRating,
  pendingReviews,
} from "./dashboardMetrics.logic";
import { useRevenueByDay, useStatusFunnel, type ReportPeriod } from "@/features/reports/api";
import { usePayoutBalance } from "@/features/payouts/api";
import { useOperatorReviews } from "@/features/reviews/operatorApi";
import { RecipientKycBanner } from "@/features/payouts/RecipientKycBanner";
import { useAuth } from "@/auth/context";
import { useScopedLocationIds } from "@/auth/useScopedLocationIds";
import { supabase } from "@/lib/supabase";
import { formatBRL, formatTime } from "@/lib/format";
import type { BookingWithRelations } from "@/types/domain";

const baseSelect =
  "*, profile:profiles(id, full_name, tax_id), location:location(id, name, slug, timezone, company:company(id, name, slug)), vehicle:vehicle(id, license_plate, model, color)";

function useTodayTimeline(locationIds: string[] | undefined) {
  return useQuery({
    queryKey: ["operator", "today-timeline", locationIds],
    queryFn: async (): Promise<BookingWithRelations[]> => {
      const dayStart = startOfDay(new Date()).toISOString();
      const dayEnd = endOfDay(new Date()).toISOString();
      let q = supabase
        .from("booking")
        .select(baseSelect)
        .or(
          `and(check_in_at.gte.${dayStart},check_in_at.lte.${dayEnd}),and(check_out_at.gte.${dayStart},check_out_at.lte.${dayEnd})`,
        )
        .order("check_in_at", { ascending: true })
        .limit(50);
      if (locationIds && locationIds.length > 0) {
        q = q.in("location_id", locationIds);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as BookingWithRelations[];
    },
    refetchInterval: 30_000,
  });
}

const toneClass: Record<"good" | "warn" | "bad", string> = {
  good: "text-success",
  warn: "text-warning",
  bad: "text-error",
};

function formatRating(avg: number): string {
  return avg.toFixed(1).replace(".", ",");
}

export default function OperatorDashboard() {
  const { session, effectiveCompanyIds } = useAuth();
  const { ids: scopedLocationIds } = useScopedLocationIds();
  const companyId = effectiveCompanyIds[0];
  const [period, setPeriod] = React.useState<ReportPeriod>(30);

  const stats = useOperatorStats(scopedLocationIds);
  const summary = useOperatorPeriodSummary(period, scopedLocationIds);
  const revenue = useRevenueByDay(period, scopedLocationIds);
  const funnel = useStatusFunnel(period, scopedLocationIds);
  const balance = usePayoutBalance(companyId);
  const reviews = useOperatorReviews(companyId);
  const timeline = useTodayTimeline(scopedLocationIds);

  const cur = summary.data?.current;
  const prev = summary.data?.previous;
  const cancel = cancellationRate(funnel.data ?? []);
  const benchmark = cancellationBenchmark(cancel.rate);
  const rating = averageRating(reviews.data ?? []);
  const pending = pendingReviews(reviews.data ?? []);

  const periodLabel = `${period} dias`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dashboard"
        description={
          session?.companyIds.length
            ? "Receita e reservas do período, mais a operação de hoje."
            : "Você ainda não está vinculado a uma empresa."
        }
        actions={
          <Select value={String(period)} onValueChange={(v) => setPeriod(Number(v) as ReportPeriod)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      <RecipientKycBanner companyId={companyId} />

      {/* Dinheiro e demanda do período */}
      <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2 desktop:grid-cols-4">
        <KpiCard
          label={`Receita (${periodLabel})`}
          value={formatBRL(cur?.revenue ?? 0)}
          trend={cur && prev ? formatDelta(pctDelta(cur.revenue, prev.revenue)) : undefined}
          isLoading={summary.isLoading}
        />
        <KpiCard
          label={`Reservas (${periodLabel})`}
          value={cur?.count ?? 0}
          trend={cur && prev ? formatDelta(pctDelta(cur.count, prev.count)) : undefined}
          isLoading={summary.isLoading}
        />
        <KpiCard
          label="Ticket médio"
          value={formatBRL(cur?.ticket ?? 0)}
          hint="por reserva paga"
          isLoading={summary.isLoading}
        />
        <KpiCard
          label="Saldo a repassar"
          value={formatBRL((balance.data?.balance_cents ?? 0) / 100)}
          hint="líquido menos saques"
          isLoading={balance.isLoading}
        />
      </div>

      {/* Receita diária + saúde */}
      <div className="grid grid-cols-1 gap-4 desktop:grid-cols-3">
        <Card className="desktop:col-span-2">
          <CardHeader>
            <CardTitle>Receita diária</CardTitle>
          </CardHeader>
          <CardContent>
            {revenue.isLoading ? (
              <Skeleton className="h-56 w-full" />
            ) : (revenue.data?.length ?? 0) === 0 ? (
              <EmptyState
                title="Sem receita no período"
                description="As reservas pagas aparecem aqui assim que entrarem."
              />
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenue.data}>
                    <defs>
                      <linearGradient id="dash-rev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--mp-primary))" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="hsl(var(--mp-primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="hsl(var(--hairline-soft))" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(d: string) => d.slice(5)}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis tickFormatter={(v: number) => formatBRL(v)} tick={{ fontSize: 12 }} width={90} />
                    <Tooltip formatter={(v: number) => formatBRL(v)} />
                    <Area
                      type="monotone"
                      dataKey="total"
                      stroke="hsl(var(--mp-primary))"
                      strokeWidth={2}
                      fill="url(#dash-rev)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col gap-2 p-6">
              <span className="text-caption text-muted">Cancelamento ({periodLabel})</span>
              {funnel.isLoading ? (
                <Skeleton className="h-9 w-24" />
              ) : (
                <span className="text-display-md text-ink">
                  {cancel.rate.toFixed(0).replace(".", ",")}%
                </span>
              )}
              <span className={cn("text-caption", toneClass[benchmark.tone])}>{benchmark.label}</span>
              <span className="text-caption text-muted">
                {cancel.cancelled} canceladas e {cancel.noShow} no-show de {cancel.total} reservas
              </span>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-2 p-6">
              <span className="text-caption text-muted">Avaliações</span>
              {reviews.isLoading ? (
                <Skeleton className="h-9 w-24" />
              ) : rating.count === 0 ? (
                <span className="text-body-md text-muted">Ainda sem avaliação</span>
              ) : (
                <span className="text-display-md text-ink">
                  {formatRating(rating.avg)}
                  <span className="text-body-sm text-muted"> de 5 · {rating.count}</span>
                </span>
              )}
              <span className="text-caption text-muted">
                {pending === 0 ? "Nenhuma aguardando resposta" : `${pending} aguardando resposta`}
              </span>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Operação de hoje */}
      <Card>
        <CardHeader>
          <CardTitle>Hoje</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-caption text-muted">Reservas</span>
              <span className="text-display-md text-ink">{stats.data?.bookingsToday ?? 0}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-caption text-muted">Check-ins</span>
              <span className="text-display-md text-ink">{stats.data?.checkInsToday ?? 0}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-caption text-muted">Check-outs</span>
              <span className="text-display-md text-ink">{stats.data?.checkOutsToday ?? 0}</span>
            </div>
          </div>

          {timeline.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : (timeline.data?.length ?? 0) === 0 ? (
            <EmptyState
              title="Nenhuma reserva para hoje"
              description="Aproveite para organizar a operação."
            />
          ) : (
            <ol className="divide-y divide-hairline-soft">
              {timeline.data?.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-caption text-muted">
                      {formatTime(b.check_in_at)}
                    </span>
                    <div className="flex flex-col">
                      <span className="text-ink">{bookingCustomerName(b) ?? "-"}</span>
                      <span className="text-caption text-muted">
                        {b.location?.name} · {b.vehicle?.license_plate ?? "Sem placa"}
                      </span>
                    </div>
                  </div>
                  <StatusBadge status={b.status} />
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
