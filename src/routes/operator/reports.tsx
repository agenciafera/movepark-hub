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
import { Download } from "@phosphor-icons/react";
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
import { useAuth } from "@/auth/context";
import { formatBRL } from "@/lib/format";
import { subDays } from "date-fns";
import { useHasWl } from "@/features/companies/useHasWl";
import { useWlRevenue } from "@/features/finance/wlRevenue";
import { mergeDailyByOrigin } from "@/features/dashboard/revenueByOrigin.logic";

const statusLabel: Record<string, string> = {
  pending: "Pendente",
  confirmed: "Confirmada",
  checked_in: "Em uso",
  completed: "Concluída",
  cancelled: "Cancelada",
  expired: "Expirada",
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
  const { effectiveCompanyIds, hasScope } = useAuth();
  // Receita é financeiro (ADR-005): a aba Receita e o export de receita exigem finance:read.
  // A aba Reservas (funil) fica para todos (bookings:read). O papel Operação não vê receita aqui.
  const canFinance = hasScope("finance:read", effectiveCompanyIds[0]);
  const revenue = useRevenueByDay(period, scopedLocationIds, true);
  const funnel = useStatusFunnel(period, scopedLocationIds);

  // Site white-label (fase 5): mesmo recorte das diárias (check-in desde N dias, sem teto, como
  // `useRevenueByDay`). Só para quem tem; quem não tem nem chama.
  const { hasWl } = useHasWl();
  const since = React.useMemo(() => subDays(new Date(), period).toISOString(), [period]);
  const wlQ = useWlRevenue(
    { from: since, to: "2100-01-01T00:00:00.000Z", locationIds: scopedLocationIds },
    hasWl && canFinance,
  );
  const wl = hasWl ? wlQ.data?.total : undefined;
  const temSite = !!wl && wl.paid_amount > 0;
  const daily = React.useMemo(
    () =>
      mergeDailyByOrigin(
        (revenue.data ?? []).map((r) => ({ date: r.date, value: r.parking })),
        hasWl ? (wlQ.data?.by_day ?? []) : [],
      ),
    [revenue.data, wlQ.data, hasWl],
  );

  // A conta do estacionamento (08/10/2026): diárias e o que ele recebe, a mesma da tela da reserva.
  // O total cobrado do cliente (com plano) é da Movepark e não entra aqui.
  const totalParking = (revenue.data ?? []).reduce((acc, r) => acc + r.parking, 0);
  const totalNet = (revenue.data ?? []).reduce((acc, r) => acc + r.net, 0);
  const totalCount = (revenue.data ?? []).reduce((acc, r) => acc + r.count, 0);
  const wlPorDia = new Map((wlQ.data?.by_day ?? []).map((d) => [d.day, d]));
  const revenueCsv = (revenue.data ?? []).map((r) => ({
    data: r.date,
    reservas: r.count,
    diarias: r.parking.toFixed(2),
    voce_recebe: r.net.toFixed(2),
    ...(hasWl
      ? {
          white_label_reservas: wlPorDia.get(r.date)?.paid ?? 0,
          white_label_pago: (wlPorDia.get(r.date)?.paid_amount ?? 0).toFixed(2),
        }
      : {}),
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Relatórios"
        description="Análise de desempenho operacional."
        actions={
          <Select
            value={String(period)}
            onValueChange={(v) => setPeriod(Number(v) as ReportPeriod)}
          >
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

      <Tabs defaultValue={canFinance ? "revenue" : "bookings"}>
        <TabsList>
          {canFinance && <TabsTrigger value="revenue">Receita</TabsTrigger>}
          <TabsTrigger value="bookings">Reservas</TabsTrigger>
          <TabsTrigger value="export">Exportar</TabsTrigger>
        </TabsList>

        {canFinance && (
          <TabsContent value="revenue">
            <div
              className={`grid grid-cols-1 gap-4 ${temSite ? "tablet:grid-cols-4" : "tablet:grid-cols-3"}`}
            >
              <Card>
                <CardContent className="p-6">
                  <div className="text-caption text-muted">Diárias no período</div>
                  <div className="text-display-md" data-testid="relatorio-diarias">
                    {formatBRL(totalParking)}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <div className="text-caption text-muted">
                    Você recebe{temSite ? " pela Movepark" : ""}
                  </div>
                  <div className="text-display-md" data-testid="relatorio-liquido">
                    {formatBRL(totalNet)}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <div className="text-caption text-muted">
                    Reservas{temSite ? " pela Movepark" : ""}
                  </div>
                  <div className="text-display-md">{totalCount}</div>
                </CardContent>
              </Card>
              {temSite && (
                <Card>
                  <CardContent className="p-6">
                    <div className="text-caption text-muted">Vendido no white-label</div>
                    <div className="text-display-md" data-testid="relatorio-white-label">
                      {formatBRL(wl!.paid_amount)}
                    </div>
                    <div className="text-caption text-muted">
                      {wl!.paid} {wl!.paid === 1 ? "reserva paga" : "reservas pagas"} no seu site,
                      direto na sua conta
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            <Card className="mt-4">
              <CardHeader>
                <CardTitle>
                  {temSite ? "Diárias e white-label por dia" : "Diárias por dia"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {revenue.isLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={daily}>
                        <defs>
                          <linearGradient id="rep-fill" x1="0" y1="0" x2="0" y2="1">
                            <stop
                              offset="0%"
                              stopColor="hsl(var(--mp-primary))"
                              stopOpacity={0.3}
                            />
                            <stop
                              offset="100%"
                              stopColor="hsl(var(--mp-primary))"
                              stopOpacity={0}
                            />
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
                          dataKey="hub"
                          name={temSite ? "Diárias (Movepark)" : "Diárias"}
                          stackId="origem"
                          stroke="hsl(var(--mp-primary))"
                          strokeWidth={2}
                          fill="url(#rep-fill)"
                        />
                        {temSite && (
                          <Area
                            type="monotone"
                            dataKey="wl"
                            name="White-label"
                            stackId="origem"
                            stroke="hsl(var(--mp-teal))"
                            strokeWidth={2}
                            fill="hsl(var(--mp-teal))"
                            fillOpacity={0.15}
                          />
                        )}
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

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
                {canFinance && (
                  <Button
                    variant="secondary"
                    onClick={() => exportCsv(`receita-${period}d.csv`, revenueCsv)}
                    disabled={revenue.isLoading}
                  >
                    <Download className="h-4 w-4" /> Receita diária
                  </Button>
                )}
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
