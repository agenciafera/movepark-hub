import * as React from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRevenueByDay, useStatusFunnel, type ReportPeriod } from "@/features/reports/api";
import { useScopedLocationIds } from "@/auth/useScopedLocationIds";
import { formatBRL } from "@/lib/format";

const statusLabel: Record<string, string> = {
  pending: "Pendente",
  confirmed: "Confirmada",
  checked_in: "Em uso",
  completed: "Concluída",
  cancelled: "Cancelada",
  no_show: "No-show",
};

function exportCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) {
    toast.error("Sem dados para exportar");
    return;
  }
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => JSON.stringify(row[h] ?? "")).join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function OperatorReports() {
  const [period, setPeriod] = React.useState<ReportPeriod>(30);
  const { ids: scopedLocationIds } = useScopedLocationIds();
  const revenue = useRevenueByDay(period, scopedLocationIds);
  const funnel = useStatusFunnel(period, scopedLocationIds);

  const totalRevenue = (revenue.data ?? []).reduce((acc, r) => acc + r.total, 0);
  const totalCount = (revenue.data ?? []).reduce((acc, r) => acc + r.count, 0);
  const avgDaily = revenue.data?.length ? totalRevenue / revenue.data.length : 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Relatórios"
        description="Análise de desempenho operacional."
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

      <Tabs defaultValue="revenue">
        <TabsList>
          <TabsTrigger value="revenue">Receita</TabsTrigger>
          <TabsTrigger value="bookings">Reservas</TabsTrigger>
          <TabsTrigger value="export">Exportar</TabsTrigger>
        </TabsList>

        <TabsContent value="revenue">
          <div className="grid grid-cols-1 gap-4 tablet:grid-cols-3">
            <Card>
              <CardContent className="p-6">
                <div className="text-caption text-muted">Total no período</div>
                <div className="text-display-md">{formatBRL(totalRevenue)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="text-caption text-muted">Média diária</div>
                <div className="text-display-md">{formatBRL(avgDaily)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="text-caption text-muted">Reservas</div>
                <div className="text-display-md">{totalCount}</div>
              </CardContent>
            </Card>
          </div>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Receita diária</CardTitle>
            </CardHeader>
            <CardContent>
              {revenue.isLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={revenue.data}>
                      <defs>
                        <linearGradient id="rep-fill" x1="0" y1="0" x2="0" y2="1">
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
                      <YAxis
                        tickFormatter={(v: number) => formatBRL(v)}
                        tick={{ fontSize: 12 }}
                        width={90}
                      />
                      <Tooltip formatter={(v: number) => formatBRL(v)} />
                      <Area
                        type="monotone"
                        dataKey="total"
                        stroke="hsl(var(--mp-primary))"
                        strokeWidth={2}
                        fill="url(#rep-fill)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bookings">
          <Card>
            <CardHeader>
              <CardTitle>Funil por status</CardTitle>
            </CardHeader>
            <CardContent>
              {funnel.isLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={funnel.data?.map((r) => ({ ...r, name: statusLabel[r.status] }))}
                    >
                      <CartesianGrid stroke="hsl(var(--hairline-soft))" strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Bar dataKey="count" fill="hsl(var(--mp-primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="export">
          <Card>
            <CardContent className="flex flex-col gap-4 p-6">
              <p className="text-body-sm text-muted">
                Baixe os dados consolidados do período selecionado em CSV.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="secondary"
                  onClick={() =>
                    exportCsv(`receita-${period}d.csv`, revenue.data ?? [])
                  }
                  disabled={revenue.isLoading}
                >
                  <Download className="h-4 w-4" /> Receita diária
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => exportCsv(`status-${period}d.csv`, funnel.data ?? [])}
                  disabled={funnel.isLoading}
                >
                  <Download className="h-4 w-4" /> Funil de status
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
