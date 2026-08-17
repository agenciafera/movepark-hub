import * as React from "react";
import { Link } from "react-router-dom";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Panel, PanelTitle } from "@/components/shared/Panel";
import { BookingTable } from "@/features/bookings/BookingTable";
import { BookingModal } from "@/features/bookings/BookingModal";
import { useRecentBookings } from "@/features/bookings/api";
import { useRevenueByRange } from "@/features/reports/api";
import { useManagerFilters } from "@/features/manager-filters/context";
import { ManagerFilterBar } from "@/features/manager-filters/ManagerFilterBar";
import { formatRangeLabel, periodLabel } from "@/features/manager-filters/managerFilters.logic";
import { FARE_TIER_LABEL } from "@/lib/fares";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BookingWithRelations } from "@/types/domain";
import { useManagerOverview, useManagerDailyFlow, todayIsoDate } from "./api";
import { bestRevenueDay } from "./operatorInsights.logic";
import { flowTotals, hourLabel } from "./dashboardMetrics.logic";
import {
  concentration,
  dominantStay,
  networkInsight,
  rankDetail,
  rankLocations,
  share,
  shortStayShare,
  stayBars,
} from "./managerInsights.logic";

const int = (n: number | null | undefined) => Number(n ?? 0).toLocaleString("pt-BR");
const oneDecimal = (n: number) =>
  Number(n ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Meia-lua da rede: quantas unidades geraram receita, do total ativo. */
const ARC_LENGTH = 282.74;

function NetworkGauge({ earning, total }: { earning: number; total: number }) {
  const filled = total > 0 ? (earning / total) * ARC_LENGTH : 0;
  return (
    <div className="mx-auto w-full max-w-[212px]">
      <div className="relative aspect-[212/112]">
        <svg
          viewBox="0 0 212 112"
          preserveAspectRatio="xMidYMax meet"
          className="block h-full w-full"
        >
          <path
            d="M16 100 A90 90 0 0 1 196 100"
            fill="none"
            stroke="hsl(var(--surface-strong))"
            strokeWidth="18"
            strokeLinecap="round"
          />
          {/* Zero não desenha: a ponta arredondada pinta um ponto mesmo com
              traço de comprimento zero, e o ponto lia como "tem algo". */}
          {filled > 0 && (
            <path
              d="M16 100 A90 90 0 0 1 196 100"
              fill="none"
              stroke="hsl(var(--mp-primary))"
              strokeWidth="18"
              strokeLinecap="round"
              strokeDasharray={`${filled.toFixed(1)} ${ARC_LENGTH}`}
            />
          )}
        </svg>
        <div className="absolute inset-x-0 bottom-0 text-center">
          <div className="text-display-xl tabular-nums leading-none text-ink">{int(earning)}</div>
        </div>
      </div>
      <p className="mt-2 text-center text-caption text-muted">
        de {int(total)} {total === 1 ? "unidade" : "unidades"}
      </p>
    </div>
  );
}

export default function ManagerDashboard() {
  const { period, range, compareRange, scopedLocationIds } = useManagerFilters();
  const [flowDate, setFlowDate] = React.useState(todayIsoDate);
  const [selected, setSelected] = React.useState<BookingWithRelations | null>(null);

  const overview = useManagerOverview(range, compareRange, scopedLocationIds);
  const revenue = useRevenueByRange(
    range.from.toISOString(),
    range.to.toISOString(),
    scopedLocationIds,
  );
  const flow = useManagerDailyFlow(flowDate, scopedLocationIds);
  const recent = useRecentBookings(20, scopedLocationIds);

  const cur = overview.data?.current;
  const network = overview.data?.network ?? { locations_total: 0, locations_with_revenue: 0 };
  const money = overview.data?.money ?? { commission: 0, payout: 0 };
  const label = periodLabel(period, range);

  const daily = React.useMemo(
    () => (revenue.data ?? []).map((d) => ({ date: d.date, total: d.total })),
    [revenue.data],
  );
  const best = bestRevenueDay(daily);

  const ranking = rankLocations(overview.data?.top_locations ?? [], cur?.revenue ?? 0);
  const conc = concentration(overview.data?.top_locations ?? [], cur?.revenue ?? 0);
  const bars = stayBars(overview.data?.length_of_stay ?? []);
  const dominant = dominantStay(overview.data?.length_of_stay ?? []);
  const shortStay = shortStayShare(overview.data?.length_of_stay ?? []);
  const fares = overview.data?.by_fare ?? [];
  const fareTotal = fares.reduce((acc, f) => acc + Number(f.revenue), 0);
  const customers = overview.data?.customers ?? { new: 0, returning: 0 };
  const customersTotal = customers.new + customers.returning;
  const destinations = overview.data?.by_destination ?? [];
  const destinationRevenue = destinations.reduce((acc, d) => acc + Number(d.revenue), 0);

  const insight = networkInsight({
    revenue: cur?.revenue ?? 0,
    network,
    concentration: conc,
    customers,
  });

  const idle = network.locations_total - network.locations_with_revenue;
  const entries = flowTotals(flow.data?.entries ?? []);
  const exits = flowTotals(flow.data?.exits ?? []);
  const flowChart = (flow.data?.entries ?? []).map((e, i) => ({
    hour: hourLabel(e.hour),
    entradas: e.vehicles,
    saidas: flow.data?.exits[i]?.vehicles ?? 0,
  }));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Visão da rede"
        // A leitura mora só no card. Repetir a mesma frase aqui e lá em cima
        // gastava duas linhas pra dizer uma coisa.
        description={`O resultado da rede em ${formatRangeLabel(range)}.`}
        actions={<ManagerFilterBar />}
      />

      {/* ===== Linha 1: leitura, receita e rede ===== */}
      <div className="grid grid-cols-1 gap-5 tablet:grid-cols-2 desktop:grid-cols-3">
        <section className="bg-dashboard-hero flex flex-col overflow-hidden rounded-lg p-7 text-white">
          <span className="self-start rounded-full bg-white/20 px-3 py-1.5 text-caption font-bold">
            Leitura do período
          </span>
          {insight ? (
            <div className="mt-auto pt-6">
              <p className="text-display-md leading-tight text-white">{insight.title}</p>
              <p className="mt-2.5 text-body-sm leading-relaxed text-white/80">{insight.detail}</p>
            </div>
          ) : (
            <p className="mt-6 text-body-md text-white/80">
              Sem unidade ativa no recorte escolhido. A leitura aparece assim que entrar movimento.
            </p>
          )}
        </section>

        <section className="flex flex-col overflow-hidden rounded-lg bg-mp-primary p-7 text-white">
          <div>
            <div className="text-body-sm font-medium text-white/90">Receita da rede</div>
            <div className="mt-1 text-caption text-white/70">realizado no período</div>
          </div>
          {overview.isLoading ? (
            <Skeleton className="mt-5 h-10 w-44 bg-white/20" />
          ) : (
            <div className="mt-5 whitespace-nowrap text-display-2xl tabular-nums leading-none text-white">
              {formatBRL(cur?.revenue ?? 0)}
            </div>
          )}
          <div className="mt-2 text-caption text-white/80">
            {int(cur?.bookings)} {cur?.bookings === 1 ? "reserva paga" : "reservas pagas"} ·{" "}
            {int(cur?.vehicle_days)} {cur?.vehicle_days === 1 ? "diária" : "diárias"}
          </div>

          <div className="mt-auto space-y-2 pt-6">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-caption text-white/75">A repassar aos parceiros</span>
              <span className="text-body-sm font-bold tabular-nums text-white">
                {formatBRL(money.payout)}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-caption text-white/75">Comissão retida</span>
              <span className="text-body-sm font-bold tabular-nums text-white">
                {formatBRL(money.commission)}
              </span>
            </div>
          </div>
        </section>

        <Panel className="flex flex-col">
          <PanelTitle aside={label.toLowerCase()}>Rede com receita</PanelTitle>
          <div className="my-5">
            {overview.isLoading ? (
              <Skeleton className="mx-auto h-28 w-full max-w-[212px]" />
            ) : (
              <NetworkGauge
                earning={network.locations_with_revenue}
                total={network.locations_total}
              />
            )}
          </div>
          <div className="mt-auto flex flex-wrap gap-1">
            {Array.from({ length: Math.min(network.locations_total, 40) }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-4 w-4 rounded-xs",
                  i < network.locations_with_revenue ? "bg-mp-primary" : "bg-surface-strong",
                )}
              />
            ))}
          </div>
          <p
            className={cn(
              "mt-3 text-caption leading-relaxed",
              idle > 0 ? "font-medium text-error" : "text-muted",
            )}
          >
            {network.locations_total === 0
              ? "Nenhuma unidade ativa no recorte escolhido."
              : idle > 0
                ? `${int(idle)} ${idle === 1 ? "unidade sem nenhuma reserva paga" : "unidades sem nenhuma reserva paga"}.`
                : "Toda a rede gerou receita no período."}
          </p>
        </Panel>
      </div>

      {/* ===== Linha 2: receita por dia e concentração ===== */}
      <div className="grid grid-cols-1 gap-5 desktop:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel className="flex flex-col">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-title-md text-ink">
                Receita por dia de check-in,{" "}
                <span className="text-mp-primary">{formatRangeLabel(range)}</span>
              </div>
              <p className="mt-1.5 text-body-sm text-muted">
                Total do período {formatBRL(cur?.revenue ?? 0)}
              </p>
            </div>
            {best && (
              <div className="shrink-0 text-right">
                <div className="text-caption text-muted">Melhor dia</div>
                <div className="text-display-sm tabular-nums text-mp-primary">
                  {formatBRL(best.total)}
                </div>
                <div className="text-caption-sm text-muted-soft">
                  {format(new Date(`${best.date}T12:00:00`), "d 'de' MMM", { locale: ptBR })}
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 h-[220px] flex-1">
            {revenue.isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : daily.length === 0 ? (
              <EmptyState
                title="Sem receita no período"
                description="As reservas pagas aparecem aqui assim que entrarem."
              />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="mgr-rev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--mp-primary))" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="hsl(var(--mp-primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    stroke="hsl(var(--hairline-soft))"
                    strokeDasharray="4 4"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d: string) =>
                      format(new Date(`${d}T12:00:00`), "dd MMM", { locale: ptBR })
                    }
                    tick={{ fontSize: 11 }}
                    stroke="hsl(var(--muted-soft))"
                    minTickGap={32}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tickFormatter={(v: number) => formatBRL(v)}
                    tick={{ fontSize: 11 }}
                    stroke="hsl(var(--muted-soft))"
                    width={86}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    formatter={(v: number) => [formatBRL(v), "Receita"]}
                    labelFormatter={(d: string) =>
                      format(new Date(`${d}T12:00:00`), "d 'de' MMMM", { locale: ptBR })
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="hsl(var(--mp-primary))"
                    strokeWidth={2.5}
                    fill="url(#mgr-rev)"
                    dot={{ r: 3, fill: "hsl(var(--canvas))", strokeWidth: 2 }}
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Panel>

        <Panel className="flex flex-col">
          <div className="min-w-0">
            <div className="text-title-md text-ink">Concentração</div>
            <div className="mt-1 text-body-sm text-muted">participação na receita</div>
          </div>

          <div className="mt-5 flex flex-wrap items-baseline gap-2.5">
            <span className="text-display-2xl tabular-nums leading-none text-ink">
              {conc.topShare}%
            </span>
            {conc.leader && (
              <span className="whitespace-nowrap rounded-full bg-mp-pale px-3 py-1.5 text-caption font-bold text-mp-indigo">
                só a {conc.leader.name}
              </span>
            )}
          </div>

          <div className="mt-5 flex h-2.5 gap-1">
            {ranking
              .filter((r) => r.revenue > 0)
              .slice(0, 4)
              .map((r, i) => (
                <div
                  key={r.id}
                  className={cn("rounded-full", i === 0 ? "bg-mp-primary" : "bg-mp-indigo")}
                  style={{ width: `${r.share}%` }}
                />
              ))}
            {conc.withRevenue === 0 && <div className="w-full rounded-full bg-surface-strong" />}
          </div>

          <div className="mt-5 flex flex-col gap-0.5">
            {ranking.slice(0, 3).map((r, i) => (
              <div key={r.id} className="flex items-center gap-2.5 rounded-md px-2 py-2.5">
                <span
                  className={cn(
                    "h-2.5 w-2.5 shrink-0 rounded-full",
                    r.revenue === 0
                      ? "bg-surface-strong"
                      : i === 0
                        ? "bg-mp-primary"
                        : "bg-mp-indigo",
                  )}
                  aria-hidden
                />
                <span className="min-w-0 truncate text-body-sm text-body">{r.name}</span>
                <span
                  className={cn(
                    "ml-auto text-body-sm font-bold tabular-nums",
                    r.revenue === 0 ? "text-muted-soft" : "text-ink",
                  )}
                >
                  {r.share}%
                </span>
              </div>
            ))}
            {ranking.length === 0 && (
              <p className="py-4 text-body-sm text-muted">Nenhuma unidade ativa no recorte.</p>
            )}
          </div>

          <p className="mt-auto pt-5 text-body-sm leading-relaxed text-body">
            {conc.withRevenue === 0
              ? "Nenhuma unidade da rede registrou receita no período."
              : conc.headCount === 1
                ? "Uma única unidade responde por 80% da receita do período."
                : `${conc.headCount} unidades respondem por 80% da receita do período.`}
          </p>
        </Panel>
      </div>

      {/* ===== Linha 3: tarifas, ticket e ranking ===== */}
      <div className="grid grid-cols-1 items-start gap-5 desktop:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <div className="flex flex-col gap-5">
          <Panel>
            <PanelTitle aside={label.toLowerCase()}>Receita de tarifas</PanelTitle>
            <div className="mt-4 whitespace-nowrap text-display-xl tabular-nums text-ink">
              {formatBRL(fareTotal)}
            </div>
            <div className="mt-1.5 text-body-sm text-muted">
              {share(fareTotal, cur?.revenue ?? 0)}% da receita total da rede
            </div>
            <div className="mt-5 flex flex-col gap-0.5">
              {fares.map((f) => (
                <div key={f.tier} className="flex items-center gap-3 py-2.5">
                  <span
                    className={cn(
                      "h-2.5 w-2.5 shrink-0 rounded-full",
                      Number(f.revenue) > 0 ? "bg-mp-primary" : "bg-surface-strong",
                    )}
                    aria-hidden
                  />
                  <span className="text-body-sm text-body">
                    {FARE_TIER_LABEL[f.tier as keyof typeof FARE_TIER_LABEL] ?? f.tier}
                  </span>
                  <span className="text-caption text-muted-soft">
                    {int(f.bookings)} {f.bookings === 1 ? "reserva" : "reservas"}
                  </span>
                  <span
                    className={cn(
                      "ml-auto text-body-sm font-bold tabular-nums",
                      Number(f.revenue) > 0 ? "text-ink" : "text-muted-soft",
                    )}
                  >
                    {formatBRL(Number(f.revenue))}
                  </span>
                </div>
              ))}
              {fares.length === 0 && (
                <p className="py-4 text-body-sm text-muted">Sem reserva com tarifa no período.</p>
              )}
            </div>
          </Panel>

          <Panel>
            <div className="text-title-md text-ink">Ticket médio</div>
            <div className="mt-4 whitespace-nowrap text-display-xl tabular-nums text-ink">
              {formatBRL(cur?.ticket ?? 0)}
            </div>
            <div className="mt-1.5 text-body-sm text-muted">
              {formatBRL(cur?.revenue_per_vehicle_day ?? 0)} por diária vendida
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-5">
              <span className="min-w-0 text-body-sm text-muted">Permanência média</span>
              <span className="shrink-0 text-body-sm font-bold tabular-nums text-ink">
                {oneDecimal(cur?.avg_stay_days ?? 0)} dias
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <span className="min-w-0 text-body-sm text-muted">Passageiros transportados</span>
              <span className="shrink-0 text-body-sm font-bold tabular-nums text-ink">
                {int(cur?.passengers)}
              </span>
            </div>
          </Panel>
        </div>

        <Panel>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-title-md text-ink">Ranking do período</div>
              <p className="mt-1.5 text-body-sm text-muted">
                {int(ranking.length)} de {int(network.locations_total)}{" "}
                {network.locations_total === 1 ? "unidade" : "unidades"}
              </p>
            </div>
            <Link
              to="/manager/locations"
              className="shrink-0 text-body-sm font-medium text-mp-indigo underline-offset-2 hover:underline"
            >
              Ver todas
            </Link>
          </div>

          <div className="mt-5 max-h-[392px] overflow-y-auto pr-1">
            {overview.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : ranking.length === 0 ? (
              <EmptyState
                title="Nenhuma unidade ativa"
                description="O ranking aparece quando houver unidade no recorte."
              />
            ) : (
              <ol className="flex flex-col gap-0.5">
                {ranking.map((r) => (
                  <li key={r.id} className="flex items-center gap-4 rounded-md px-2.5 py-3.5">
                    <span
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-caption font-bold tabular-nums",
                        r.position === 1 && r.revenue > 0
                          ? "bg-mp-primary text-white"
                          : r.revenue > 0
                            ? "bg-mp-pale text-mp-indigo"
                            : "bg-surface-soft text-muted-soft",
                      )}
                    >
                      {r.position}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-body-sm font-medium text-ink">{r.name}</div>
                      <div className="mt-0.5 truncate text-caption text-muted">{rankDetail(r)}</div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-strong">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            r.position === 1 ? "bg-mp-primary" : "bg-mp-indigo",
                          )}
                          style={{ width: r.width }}
                        />
                      </div>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 text-body-sm font-bold tabular-nums",
                        r.revenue > 0 ? "text-ink" : "text-muted-soft",
                      )}
                    >
                      {formatBRL(r.revenue)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {idle > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4">
              <span className="min-w-0 text-body-sm text-muted">
                {int(idle)} {idle === 1 ? "unidade sem receita" : "unidades sem receita"} no período
              </span>
              <Link
                to="/manager/locations"
                className="shrink-0 text-body-sm font-medium text-mp-indigo underline-offset-2 hover:underline"
              >
                Revisar unidades
              </Link>
            </div>
          )}
        </Panel>
      </div>

      {/* ===== Linha 4: permanência e clientes ===== */}
      <div className="grid grid-cols-1 gap-5 desktop:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Panel className="flex flex-col">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-title-md text-ink">Permanência das reservas</div>
              <p className="mt-1.5 text-body-sm text-muted">
                {int(cur?.bookings)} {cur?.bookings === 1 ? "reserva paga" : "reservas pagas"} no
                período
              </p>
            </div>
            {dominant && (
              <div className="shrink-0 text-right">
                <div className="text-caption text-muted">Faixa dominante</div>
                <div className="text-display-sm text-mp-primary">{dominant.label}</div>
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-col gap-3.5">
            {bars.map((b) => (
              <div key={b.sort} className="flex items-center gap-3.5">
                <span className="w-[78px] shrink-0 text-body-sm text-body">{b.label}</span>
                <span className="block h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-strong">
                  <span
                    className={cn(
                      "block h-full rounded-full",
                      b.top ? "bg-mp-primary" : "bg-mp-indigo",
                    )}
                    style={{ width: b.width }}
                  />
                </span>
                <span
                  className={cn(
                    "w-9 shrink-0 text-right text-body-sm font-bold tabular-nums",
                    b.bookings > 0 ? "text-ink" : "text-muted-soft",
                  )}
                >
                  {int(b.bookings)}
                </span>
              </div>
            ))}
          </div>

          <p className="mt-auto pt-5 text-body-sm leading-relaxed text-body">
            {(cur?.bookings ?? 0) === 0
              ? "Sem reserva paga no período para medir a permanência."
              : `${shortStay}% das reservas ficam até 3 diárias.`}
          </p>
        </Panel>

        <Panel className="flex flex-col">
          <div className="min-w-0">
            <div className="text-title-md text-ink">Clientes</div>
            <div className="mt-1 text-body-sm text-muted">novos e recorrentes</div>
          </div>

          <div className="mt-5 flex flex-wrap items-baseline gap-2.5">
            <span className="text-display-2xl tabular-nums leading-none text-ink">
              {share(customers.returning, customersTotal)}%
            </span>
            {customersTotal > 0 && (
              <span className="whitespace-nowrap rounded-full bg-mp-pale px-3 py-1.5 text-caption font-bold text-mp-indigo">
                já eram clientes
              </span>
            )}
          </div>

          <div className="mt-5 flex h-2.5 gap-1">
            <div
              className="rounded-full bg-mp-primary"
              style={{ width: `${share(customers.returning, customersTotal)}%` }}
            />
            <div
              className="rounded-full bg-mp-indigo"
              style={{ width: `${share(customers.new, customersTotal)}%` }}
            />
            {customersTotal === 0 && <div className="w-full rounded-full bg-surface-strong" />}
          </div>

          <div className="mt-5 flex flex-col gap-0.5">
            <div className="flex items-center gap-2.5 py-2.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-mp-primary" aria-hidden />
              <span className="min-w-0 flex-1 text-body-sm text-body">Já tinham reservado</span>
              <span className="shrink-0 text-body-sm font-bold tabular-nums text-ink">
                {int(customers.returning)}
              </span>
            </div>
            <div className="flex items-center gap-2.5 py-2.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-mp-indigo" aria-hidden />
              <span className="min-w-0 flex-1 text-body-sm text-body">Primeira reserva</span>
              <span className="shrink-0 text-body-sm font-bold tabular-nums text-ink">
                {int(customers.new)}
              </span>
            </div>
          </div>

          <p className="mt-auto pt-5 text-body-sm leading-relaxed text-body">
            {customersTotal === 0
              ? "Sem reserva paga no período para separar novos de recorrentes."
              : `${int(customers.new)} ${customers.new === 1 ? "cliente novo" : "clientes novos"} no período.`}
          </p>
        </Panel>
      </div>

      {/* ===== Blocos que ficam fora do design v2, mas o Manager pediu ===== */}
      <div className="grid grid-cols-1 gap-5 desktop:grid-cols-2">
        <Panel>
          <PanelTitle aside={label.toLowerCase()}>Por destino</PanelTitle>
          <div className="mt-5">
            {overview.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : destinations.length === 0 ? (
              <EmptyState
                title="Sem reservas no período"
                description="A quebra por aeroporto aparece aqui."
              />
            ) : (
              <ul className="flex flex-col gap-3.5">
                {destinations.map((d) => {
                  const pct = share(Number(d.revenue), destinationRevenue);
                  return (
                    <li key={`${d.code}-${d.name}`} className="flex flex-col gap-1.5">
                      <div className="flex items-baseline justify-between gap-3 text-body-sm">
                        <span className="truncate text-ink">{d.name}</span>
                        <span className="shrink-0 tabular-nums text-ink">
                          {formatBRL(Number(d.revenue))}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-surface-strong">
                        <div className="h-full bg-mp-primary" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex items-baseline justify-between gap-3 text-caption-sm text-muted-soft">
                        <span>
                          {int(d.bookings)} reservas · {int(d.vehicle_days)} diárias
                        </span>
                        <span className="tabular-nums">{pct}%</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Panel>

        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-title-md text-ink">Fluxo de veículos por hora</div>
            <Input
              type="date"
              aria-label="Dia do fluxo de veículos"
              value={flowDate}
              onChange={(e) => setFlowDate(e.target.value)}
              className="h-10 w-[170px]"
            />
          </div>
          <div className="mt-5">
            {flow.isLoading ? (
              <Skeleton className="h-56 w-full" />
            ) : entries.vehicles === 0 && exits.vehicles === 0 ? (
              <EmptyState
                title="Nenhum movimento nesse dia"
                description="Escolha outra data para ver as entradas e saídas hora a hora."
              />
            ) : (
              <>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={flowChart}>
                      <CartesianGrid
                        stroke="hsl(var(--hairline-soft))"
                        strokeDasharray="4 4"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="hour"
                        tick={{ fontSize: 11 }}
                        interval={1}
                        stroke="hsl(var(--muted-soft))"
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 11 }}
                        stroke="hsl(var(--muted-soft))"
                        width={32}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                      <Bar
                        dataKey="entradas"
                        name="Entradas"
                        fill="hsl(var(--mp-primary))"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="saidas"
                        name="Saídas"
                        fill="hsl(var(--mp-indigo))"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-4 text-caption text-muted">
                  {int(entries.vehicles)} entradas, {int(exits.vehicles)} saídas e{" "}
                  {int(entries.passengers)} passageiros.
                  {entries.peakHour !== null
                    ? ` Pico de chegada às ${hourLabel(entries.peakHour)}.`
                    : ""}
                </p>
              </>
            )}
          </div>
        </Panel>
      </div>

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-title-md text-ink">Reservas recentes</div>
          <Link
            to="/manager/attribution"
            className="text-body-sm font-medium text-mp-indigo underline-offset-2 hover:underline"
          >
            Ver a origem das reservas
          </Link>
        </div>
        <div className="mt-5">
          <BookingTable
            bookings={recent.data}
            isLoading={recent.isLoading}
            onRowClick={(b) => setSelected(b)}
          />
        </div>
      </Panel>

      <BookingModal
        booking={selected}
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </div>
  );
}
