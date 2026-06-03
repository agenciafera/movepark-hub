import * as React from "react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiCard } from "@/components/shared/KpiCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { BookingTable } from "@/features/bookings/BookingTable";
import { BookingModal } from "@/features/bookings/BookingModal";
import { useRecentBookings } from "@/features/bookings/api";
import { useManagerStats, useRevenueLastDays } from "./api";
import { formatBRL } from "@/lib/format";
import type { BookingWithRelations } from "@/types/domain";

function trendOf(current: number, previous: number) {
  if (previous === 0) return { value: current > 0 ? "+100%" : "0%", positive: current >= 0 };
  const diff = ((current - previous) / previous) * 100;
  const sign = diff >= 0 ? "+" : "";
  return { value: `${sign}${diff.toFixed(1)}%`, positive: diff >= 0 };
}

export default function ManagerDashboard() {
  const stats = useManagerStats();
  const revenue = useRevenueLastDays(30);
  const recent = useRecentBookings(20);
  const [selected, setSelected] = React.useState<BookingWithRelations | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dashboard"
        description="Visão geral da plataforma Movepark."
      />

      <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2 desktop:grid-cols-4">
        <KpiCard
          label="Reservas Hoje"
          value={stats.data?.bookingsToday ?? 0}
          hint="vs. ontem"
          trend={
            stats.data
              ? trendOf(stats.data.bookingsToday, stats.data.bookingsYesterday)
              : undefined
          }
          isLoading={stats.isLoading}
        />
        <KpiCard
          label="Receita do Mês"
          value={formatBRL(stats.data?.revenueThisMonth ?? 0)}
          hint="vs. mês anterior"
          trend={
            stats.data
              ? trendOf(stats.data.revenueThisMonth, stats.data.revenueLastMonth)
              : undefined
          }
          isLoading={stats.isLoading}
        />
        <KpiCard
          label="Ticket Médio"
          value={formatBRL(stats.data?.averageTicketThisMonth ?? 0)}
          hint="mês atual"
          isLoading={stats.isLoading}
        />
        <KpiCard
          label="Empresas Ativas"
          value={stats.data?.activeCompanies ?? 0}
          isLoading={stats.isLoading}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Receita — últimos 30 dias</CardTitle>
        </CardHeader>
        <CardContent>
          {revenue.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (revenue.data?.length ?? 0) === 0 ? (
            <div className="flex h-64 items-center justify-center text-muted">
              Sem dados de receita no período.
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenue.data}>
                  <defs>
                    <linearGradient id="mp-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--mp-primary))" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="hsl(var(--mp-primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="hsl(var(--hairline-soft))" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    stroke="hsl(var(--muted))"
                    tickFormatter={(d: string) => d.slice(5)}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis
                    stroke="hsl(var(--muted))"
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v: number) => formatBRL(v)}
                    width={90}
                  />
                  <Tooltip
                    formatter={(v: number) => formatBRL(v)}
                    labelStyle={{ color: "hsl(var(--ink))" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="hsl(var(--mp-primary))"
                    strokeWidth={2}
                    fill="url(#mp-fill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reservas recentes</CardTitle>
        </CardHeader>
        <CardContent>
          <BookingTable
            bookings={recent.data}
            isLoading={recent.isLoading}
            onRowClick={(b) => setSelected(b)}
          />
        </CardContent>
      </Card>

      <BookingModal
        booking={selected}
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </div>
  );
}
