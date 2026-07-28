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
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  CalendarCheck,
  CalendarClock,
  Clock,
  Wallet,
  Receipt,
  TrendingUp,
  Banknote,
  Flame,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  Gauge,
  Star,
  Radio,
} from "lucide-react";
import { bookingCustomerName } from "@/features/bookings/bookings.logic";
import { startOfDay, endOfDay, format, addDays, subDays } from "date-fns";
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
import { StatusBadge, BOOKING_STATUS_LABELS } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";
import {
  useOperatorStats,
  useOperatorPeriodSummary,
  useUpcomingBookingsCount,
  useHighDemandToday,
  useOccupancyAgg,
} from "./api";
import {
  pctDelta,
  formatDelta,
  cancellationRate,
  cancellationBenchmark,
  averageRating,
  pendingReviews,
  occupancyRate,
  revpar,
} from "./dashboardMetrics.logic";
import { useRevenueByDay, useStatusFunnel, type ReportPeriod } from "@/features/reports/api";
import { usePayoutBalance } from "@/features/payouts/api";
import { useOperatorReviews } from "@/features/reviews/operatorApi";
import { useOperatorLocations } from "@/features/locations/api";
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

/** Mini-stat do hero: número grande sobre a faixa navy, num tile translúcido. */
function HeroStat({ label, value, isLoading }: { label: string; value: number; isLoading?: boolean }) {
  return (
    <div className="rounded-xl bg-white/10 px-4 py-3">
      <div className="text-caption text-white/60">{label}</div>
      <div className="mt-0.5 text-display-md tabular-nums text-white">
        {isLoading ? "…" : value}
      </div>
    </div>
  );
}

/**
 * Gauge de ocupação: arco de 270° (aberto embaixo) com traço grosso e gradiente da
 * marca (indigo→violeta). O grupo é girado 135° pra o vão do arco cair embaixo; o
 * texto fica fora do SVG, sem girar.
 */
function OccupancyRing({ rate }: { rate: number }) {
  const r = 40;
  const circ = 2 * Math.PI * r;
  const arc = 0.75; // 270°
  const pct = Math.max(0, Math.min(100, rate));
  const track = arc * circ;
  const value = (pct / 100) * arc * circ;
  return (
    <div className="relative flex h-28 w-28 shrink-0 items-center justify-center">
      <svg viewBox="0 0 100 100" className="h-28 w-28">
        <defs>
          <linearGradient id="occ-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="hsl(var(--mp-indigo))" />
            <stop offset="100%" stopColor="hsl(var(--mp-violet))" />
          </linearGradient>
        </defs>
        <g transform="rotate(135 50 50)">
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke="hsl(var(--surface-strong))"
            strokeWidth="11"
            strokeLinecap="round"
            strokeDasharray={`${track} ${circ}`}
          />
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke="url(#occ-grad)"
            strokeWidth="11"
            strokeLinecap="round"
            strokeDasharray={`${value} ${circ}`}
          />
        </g>
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-display-sm tabular-nums text-ink">{pct.toFixed(0)}%</span>
        <span className="text-caption text-muted">ocupação</span>
      </div>
    </div>
  );
}

// Cor por situação da reserva: tints de marca/semânticos (nada de violeta chapado
// decorativo além do "em uso", que é o mp-primary como acento de dado).
const STATUS_COLOR: Record<string, string> = {
  pending: "hsl(var(--warning))",
  confirmed: "hsl(var(--mp-indigo))",
  checked_in: "hsl(var(--mp-primary))",
  completed: "hsl(var(--success))",
  cancelled: "hsl(var(--error))",
  expired: "hsl(var(--muted))",
  no_show: "hsl(var(--mp-red-deep))",
};

/** Donut "Reservas por situação": rosca colorida + legenda com a contagem. */
function StatusDonut({ rows }: { rows: { status: string; count: number }[] }) {
  const data = rows.filter((r) => r.count > 0);
  const total = data.reduce((acc, r) => acc + r.count, 0);
  if (total === 0) {
    return (
      <EmptyState
        title="Sem reservas no período"
        description="A distribuição por situação aparece aqui."
      />
    );
  }
  return (
    <div className="flex flex-col items-center gap-6 tablet:flex-row">
      <div className="relative h-40 w-40 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="count"
              nameKey="status"
              innerRadius="70%"
              outerRadius="100%"
              paddingAngle={3}
              cornerRadius={5}
              stroke="none"
            >
              {data.map((d) => (
                <Cell key={d.status} fill={STATUS_COLOR[d.status] ?? "hsl(var(--muted))"} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-display-md tabular-nums text-ink">{total}</span>
          <span className="text-caption text-muted">reservas</span>
        </div>
      </div>
      <ul className="flex w-full flex-col gap-1.5">
        {data.map((d) => (
          <li key={d.status} className="flex items-center gap-2 text-body-sm">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: STATUS_COLOR[d.status] ?? "hsl(var(--muted))" }}
              aria-hidden
            />
            <span className="text-muted">
              {BOOKING_STATUS_LABELS[d.status as keyof typeof BOOKING_STATUS_LABELS] ?? d.status}
            </span>
            <span className="ml-auto tabular-nums text-ink">{d.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function OperatorDashboard() {
  const { session, effectiveCompanyIds, hasScope } = useAuth();
  const { ids: scopedLocationIds } = useScopedLocationIds();
  const companyId = effectiveCompanyIds[0];
  const [period, setPeriod] = React.useState<ReportPeriod>(30);
  // O dashboard espelha o escopo (ADR-005), do mesmo jeito que a sidebar: quem não tem o escopo
  // não vê o card. reviews:read → Avaliações; finance:read → receita/ticket/RevPAR/gráfico;
  // payouts:read → saldo. O papel Operação, por exemplo, não vê dinheiro; o Financeiro não vê
  // avaliações.
  const canReviews = hasScope("reviews:read", companyId);
  const canFinance = hasScope("finance:read", companyId);
  const canPayouts = hasScope("payouts:read", companyId);
  const canMoney = canFinance || canPayouts;

  const stats = useOperatorStats(scopedLocationIds);
  const summary = useOperatorPeriodSummary(period, scopedLocationIds);
  const revenue = useRevenueByDay(period, scopedLocationIds);
  const funnel = useStatusFunnel(period, scopedLocationIds);
  const balance = usePayoutBalance(companyId);
  const reviews = useOperatorReviews(companyId);
  const timeline = useTodayTimeline(scopedLocationIds);
  const upcoming = useUpcomingBookingsCount(period, scopedLocationIds);
  const highDemand = useHighDemandToday(scopedLocationIds);
  // Ocupação é por unidade (RPC por location_id), então precisa dos ids reais da empresa:
  // scopedLocationIds vem undefined para o operador real (a RLS resolve o resto).
  const locations = useOperatorLocations(effectiveCompanyIds);
  const occLocationIds = locations.data?.map((l) => l.id);
  // Janela futura de 7 dias (indicador de demanda) e a do período (base do RevPAR).
  const today = format(new Date(), "yyyy-MM-dd");
  const in7 = format(addDays(new Date(), 7), "yyyy-MM-dd");
  const periodAgo = format(subDays(new Date(), period), "yyyy-MM-dd");
  const occ7 = useOccupancyAgg(occLocationIds, today, in7);
  const occPeriod = useOccupancyAgg(occLocationIds, periodAgo, today);

  const cur = summary.data?.current;
  const prev = summary.data?.previous;
  const cancel = cancellationRate(funnel.data ?? []);
  const benchmark = cancellationBenchmark(cancel.rate);
  const rating = averageRating(reviews.data ?? []);
  const pending = pendingReviews(reviews.data ?? []);
  const leadTime = summary.data?.leadTimeDays ?? 0;
  const channel = summary.data?.channelMix ?? { site: 0, api: 0 };
  const isHighDemand = (highDemand.data ?? 0) > 0;
  const occ7Rate = occupancyRate(occ7.data?.bookedDays ?? 0, occ7.data?.capacityDays ?? 0);
  const revparValue = revpar(cur?.revenue ?? 0, occPeriod.data?.capacityDays ?? 0);

  const periodLabel = `${period} dias`;
  const firstName = session?.firstName ?? "";
  const heroSubline = session?.companyIds.length
    ? "Aqui está a operação de hoje e o resumo do período."
    : "Você ainda não está vinculado a uma empresa.";

  return (
    <div className="flex flex-col gap-6">
      {/* Faixa de boas-vindas: gradiente da marca, o pulso de hoje e o seletor de período. */}
      <section className="relative overflow-hidden rounded-2xl bg-dashboard-hero px-6 py-7 text-white shadow-tier desktop:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-caption font-bold uppercase tracking-[0.4px] text-white/60">
              Painel do parceiro
            </p>
            <h1 className="mt-1 text-display-lg text-white">
              Olá{firstName ? `, ${firstName}` : ""} 👋
            </h1>
            <p className="mt-1 max-w-md text-body-md text-white/75">{heroSubline}</p>
          </div>
          <div className="flex items-center gap-2">
            {isHighDemand && (
              <span className="hidden items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-caption font-medium text-white tablet:inline-flex">
                <Flame className="h-3.5 w-3.5" aria-hidden /> Em alta demanda hoje
              </span>
            )}
            <Select value={String(period)} onValueChange={(v) => setPeriod(Number(v) as ReportPeriod)}>
              <SelectTrigger className="w-40 border-white/25 bg-white/10 text-white [&_svg]:text-white/70 hover:bg-white/15">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="90">Últimos 90 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-3">
          <HeroStat label="Reservas hoje" value={stats.data?.bookingsToday ?? 0} isLoading={stats.isLoading} />
          <HeroStat label="Check-ins" value={stats.data?.checkInsToday ?? 0} isLoading={stats.isLoading} />
          <HeroStat label="Check-outs" value={stats.data?.checkOutsToday ?? 0} isLoading={stats.isLoading} />
        </div>
      </section>

      <RecipientKycBanner companyId={companyId} />

      {/* Operacional do período (bookings/occupancy:read, todos os papéis) */}
      <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
        <KpiCard
          label={`Reservas pagas (${periodLabel})`}
          value={cur?.count ?? 0}
          hint="confirmadas, em uso ou concluídas"
          trend={cur && prev ? formatDelta(pctDelta(cur.count, prev.count)) : undefined}
          isLoading={summary.isLoading}
          icon={CalendarCheck}
          highlight
        />
        <KpiCard
          label={`Reservas futuras (${periodLabel})`}
          value={upcoming.data ?? 0}
          hint="com check-in daqui pra frente"
          isLoading={upcoming.isLoading}
          icon={CalendarClock}
          accent="sky"
        />
        <KpiCard
          label="Antecedência média"
          value={cur?.count ? `${leadTime.toFixed(1).replace(".", ",")} dias` : "-"}
          hint="da reserva ao check-in"
          isLoading={summary.isLoading}
          icon={Clock}
          accent="teal"
        />
      </div>

      {/* Dinheiro (finance:read / payouts:read). O papel Operação não vê. */}
      {canMoney && (
        <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2 desktop:grid-cols-4">
          {canFinance && (
            <KpiCard
              label={`Receita (${periodLabel})`}
              value={formatBRL(cur?.revenue ?? 0)}
              trend={cur && prev ? formatDelta(pctDelta(cur.revenue, prev.revenue)) : undefined}
              isLoading={summary.isLoading}
              icon={Wallet}
              accent="green"
            />
          )}
          {canFinance && (
            <KpiCard
              label="Ticket médio"
              value={formatBRL(cur?.ticket ?? 0)}
              hint="por reserva paga"
              isLoading={summary.isLoading}
              icon={Receipt}
              accent="indigo"
            />
          )}
          {canFinance && (
            <KpiCard
              label={`RevPAR (${periodLabel})`}
              value={occPeriod.data?.capacityDays ? formatBRL(revparValue) : "-"}
              hint="receita por vaga-dia"
              isLoading={occPeriod.isLoading}
              icon={TrendingUp}
              accent="teal"
            />
          )}
          {canPayouts && (
            <KpiCard
              label="Saldo a repassar"
              value={formatBRL((balance.data?.balance_cents ?? 0) / 100)}
              hint="líquido menos saques"
              isLoading={balance.isLoading}
              icon={Banknote}
              accent="green"
            />
          )}
        </div>
      )}

      {/* Receita diária (finance:read) */}
      {canFinance && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-mp-pale text-mp-indigo">
                <LineChartIcon className="h-4 w-4" aria-hidden />
              </span>
              Receita diária
            </CardTitle>
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
      )}

      {/* Visualizações: distribuição por situação (donut) + ocupação (anel). */}
      <div className="grid grid-cols-1 gap-4 desktop:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-mp-pale text-mp-indigo">
                <PieChartIcon className="h-4 w-4" aria-hidden />
              </span>
              Reservas por situação ({periodLabel})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {funnel.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <StatusDonut rows={funnel.data ?? []} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-mp-pale text-mp-indigo">
                <Gauge className="h-4 w-4" aria-hidden />
              </span>
              Ocupação (próx. 7 dias)
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-6">
            <OccupancyRing rate={occ7Rate} />
            <span className="text-body-sm text-body">
              {occ7.data?.capacityDays ? "das vagas dedicadas" : "sem capacidade cadastrada"}
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Saúde da operação: cancelamento, avaliações e origem. */}
      <div
        className={cn(
          "grid grid-cols-1 gap-4 tablet:grid-cols-2",
          canReviews ? "desktop:grid-cols-3" : "desktop:grid-cols-2",
        )}
      >
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

        {canReviews && (
          <Card>
            <CardContent className="flex flex-col gap-2 p-6">
              <span className="flex items-center gap-1.5 text-caption text-muted">
                <Star className="h-3.5 w-3.5 text-amber-500" aria-hidden /> Avaliações
              </span>
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
        )}

        <Card>
          <CardContent className="flex flex-col gap-3 p-6">
            <span className="flex items-center gap-1.5 text-caption text-muted">
              <Radio className="h-3.5 w-3.5 text-mp-indigo" aria-hidden /> Origem ({periodLabel})
            </span>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-strong">
              <div
                className="bg-mp-indigo"
                style={{ width: `${channel.site + channel.api ? (channel.site / (channel.site + channel.api)) * 100 : 0}%` }}
              />
              <div
                className="bg-mp-violet"
                style={{ width: `${channel.site + channel.api ? (channel.api / (channel.site + channel.api)) * 100 : 0}%` }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-body-sm">
                <span className="flex items-center gap-1.5 text-muted">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-mp-indigo" aria-hidden />
                  Pelo site
                </span>
                <span className="tabular-nums text-ink">{channel.site}</span>
              </div>
              <div className="flex items-center justify-between text-body-sm">
                <span className="flex items-center gap-1.5 text-muted">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-mp-violet" aria-hidden />
                  Pela API
                </span>
                <span className="tabular-nums text-ink">{channel.api}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Chegadas e saídas de hoje */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-mp-pale text-mp-indigo">
              <Clock className="h-4 w-4" aria-hidden />
            </span>
            Chegadas e saídas de hoje
          </CardTitle>
        </CardHeader>
        <CardContent>
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
