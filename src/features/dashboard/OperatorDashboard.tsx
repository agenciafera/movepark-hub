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
  CalendarDays,
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
  LogIn,
  LogOut,
  Ban,
  CarFront,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { bookingCustomerName } from "@/features/bookings/bookings.logic";
import { startOfDay, endOfDay, format, addDays, subDays } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useRevenueByRange, useStatusFunnelRange } from "@/features/reports/api";
import { PeriodPicker } from "@/features/manager-filters/PeriodPicker";
import {
  DEFAULT_PERIOD,
  compareLabel,
  formatRangeLabel,
  periodDays,
  periodLabel,
  resolveCompare,
  resolvePeriod,
  type PeriodState,
} from "@/features/manager-filters/managerFilters.logic";
import { usePayoutBalance } from "@/features/payouts/api";
import { useOperatorReviews } from "@/features/reviews/operatorApi";
import { useOperatorLocations } from "@/features/locations/api";
import { RecipientKycBanner } from "@/features/payouts/RecipientKycBanner";
import { useAuth } from "@/auth/context";
import { useScopedLocationIds } from "@/auth/useScopedLocationIds";
import { supabase } from "@/lib/supabase";
import { formatBRL, formatDate, formatTime } from "@/lib/format";
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

/** Mini-stat do card "Hoje": mesmo formato do herói, mas sobre superfície clara. */
function TodayStat({
  label,
  value,
  icon: Icon,
  isLoading,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  isLoading?: boolean;
}) {
  return (
    <div className="rounded-xl bg-surface-soft px-4 py-3.5">
      <div className="flex items-center gap-1.5 text-caption-sm text-muted">
        <Icon className="h-3.5 w-3.5 shrink-0 text-mp-indigo" aria-hidden />
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1.5 text-display-xl tabular-nums leading-none text-ink">
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
      {/* Só o número: o título do card já diz "Ocupação", então repetir "ocupação"
          aqui dentro só engorda o miolo. O anel já comunica que é um medidor. */}
      <span className="absolute text-display-sm tabular-nums text-ink">{pct.toFixed(0)}%</span>
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
  const [period, setPeriod] = React.useState<PeriodState>(DEFAULT_PERIOD);
  const range = resolvePeriod(period);
  const compareRange = resolveCompare(period, range);
  const days = periodDays(range);
  // O dashboard espelha o escopo (ADR-005), do mesmo jeito que a sidebar: quem não tem o escopo
  // não vê o card. reviews:read → Avaliações; finance:read → receita/ticket/RevPAR/gráfico;
  // payouts:read → saldo. O papel Operação, por exemplo, não vê dinheiro; o Financeiro não vê
  // avaliações.
  const canReviews = hasScope("reviews:read", companyId);
  const canFinance = hasScope("finance:read", companyId);
  const canPayouts = hasScope("payouts:read", companyId);
  const canMoney = canFinance || canPayouts;

  const stats = useOperatorStats(scopedLocationIds);
  const summary = useOperatorPeriodSummary(range, compareRange, scopedLocationIds);
  const rangeFrom = range.from.toISOString();
  const rangeTo = range.to.toISOString();
  const revenue = useRevenueByRange(rangeFrom, rangeTo, scopedLocationIds);
  const funnel = useStatusFunnelRange(rangeFrom, rangeTo, scopedLocationIds);
  const balance = usePayoutBalance(companyId);
  const reviews = useOperatorReviews(companyId);
  const timeline = useTodayTimeline(scopedLocationIds);
  const upcoming = useUpcomingBookingsCount(days, scopedLocationIds);
  const highDemand = useHighDemandToday(scopedLocationIds);
  // Ocupação é por unidade (RPC por location_id), então precisa dos ids reais da empresa:
  // scopedLocationIds vem undefined para o operador real (a RLS resolve o resto).
  const locations = useOperatorLocations(effectiveCompanyIds);
  const occLocationIds = locations.data?.map((l) => l.id);
  // Janela futura de 7 dias (indicador de demanda) e a do período (base do RevPAR).
  const today = format(new Date(), "yyyy-MM-dd");
  const in7 = format(addDays(new Date(), 7), "yyyy-MM-dd");
  const occ7 = useOccupancyAgg(occLocationIds, today, in7);
  const occPeriod = useOccupancyAgg(
    occLocationIds,
    format(range.from, "yyyy-MM-dd"),
    format(subDays(range.to, 1), "yyyy-MM-dd"),
  );

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

  const label = periodLabel(period, range);
  // Sem comparação escolhida o card não mostra variação: um "+12%" sem base
  // declarada é pior que nenhum número.
  const vs = compareLabel(period, compareRange);
  const delta = (a: number | undefined, b: number | undefined) =>
    compareRange && a !== undefined && b !== undefined ? formatDelta(pctDelta(a, b)) : undefined;
  const firstName = session?.firstName ?? "";
  const heroSubline = session?.companyIds.length
    ? "Aqui está a operação de hoje e o resumo do período."
    : "Você ainda não está vinculado a uma empresa.";

  return (
    <div className="flex flex-col gap-6">
      {/* Saudação e o pulso de hoje: dois cards, lado a lado. Juntos, a saudação
          roubava a atenção dos números e os números sujavam a saudação. */}
      <div className="grid gap-4 desktop:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <section className="bg-dashboard-hero relative overflow-hidden rounded-2xl px-6 py-7 text-white shadow-tier desktop:px-8">
          <p className="text-caption font-bold uppercase tracking-[0.4px] text-white/60">
            Painel do parceiro
          </p>
          <h1 className="mt-1 text-display-lg text-white">
            Olá{firstName ? `, ${firstName}` : ""} 👋
          </h1>
          <p className="mt-1 max-w-md text-body-md text-white/75">{heroSubline}</p>
          {isHighDemand && (
            <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-caption font-medium text-white">
              <Flame className="h-3.5 w-3.5" aria-hidden /> Em alta demanda hoje
            </span>
          )}
        </section>

        <Card>
          <CardContent className="flex h-full flex-col justify-center gap-4 p-6">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-title-md text-ink">Hoje</span>
              <span className="text-caption-sm text-muted-soft">{formatDate(new Date())}</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <TodayStat
                label="Reservas"
                value={stats.data?.bookingsToday ?? 0}
                icon={CalendarDays}
                isLoading={stats.isLoading}
              />
              <TodayStat
                label="Check-ins"
                value={stats.data?.checkInsToday ?? 0}
                icon={LogIn}
                isLoading={stats.isLoading}
              />
              <TodayStat
                label="Check-outs"
                value={stats.data?.checkOutsToday ?? 0}
                icon={LogOut}
                isLoading={stats.isLoading}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <RecipientKycBanner companyId={companyId} />

      {/* Daqui pra baixo, tudo respeita o período escolhido. */}
      <div className="flex flex-wrap items-end justify-between gap-3 pt-2">
        <div>
          <h2 className="text-display-sm text-ink">Resumo do período</h2>
          <p className="mt-0.5 text-body-sm text-muted">{formatRangeLabel(range)}</p>
        </div>
        <PeriodPicker value={period} onChange={setPeriod} className="w-full tablet:w-[230px]" />
      </div>

      {/* Os três do legado: dinheiro, entradas e ocupação. Destaque de cor só neles. */}
      <div
        className={cn(
          "grid grid-cols-1 gap-4 tablet:grid-cols-2",
          canFinance ? "desktop:grid-cols-3" : "desktop:grid-cols-2",
        )}
      >
        {canFinance && (
          <KpiCard
            label={`Receita (${label})`}
            value={formatBRL(cur?.revenue ?? 0)}
            hint={vs ?? undefined}
            trend={delta(cur?.revenue, prev?.revenue)}
            isLoading={summary.isLoading}
            icon={Wallet}
            highlight
          />
        )}
        <KpiCard
          label={`Reservas pagas (${label})`}
          value={cur?.count ?? 0}
          hint="confirmadas, em uso ou concluídas"
          trend={delta(cur?.count, prev?.count)}
          isLoading={summary.isLoading}
          icon={CalendarCheck}
          highlight
        />
        <KpiCard
          label={`Diárias vendidas (${label})`}
          value={cur?.vehicleDays ?? 0}
          hint="vagas ocupadas por dia"
          trend={delta(cur?.vehicleDays, prev?.vehicleDays)}
          isLoading={summary.isLoading}
          icon={CarFront}
          highlight
        />
      </div>

      {/* Operacional (bookings/occupancy:read, todos os papéis) */}
      <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
        <KpiCard
          label={`Reservas futuras (${label})`}
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
        {canFinance && (
          <KpiCard
            label="Ticket médio"
            value={formatBRL(cur?.ticket ?? 0)}
            hint="por reserva paga"
            trend={delta(cur?.ticket, prev?.ticket)}
            isLoading={summary.isLoading}
            icon={Receipt}
            accent="indigo"
          />
        )}
      </div>

      {/* Dinheiro que não é manchete (finance:read / payouts:read). */}
      {canMoney && (
        <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
          {canFinance && (
            <KpiCard
              label={`RevPAR (${label})`}
              value={occPeriod.data?.capacityDays ? formatBRL(revparValue) : "-"}
              hint="receita por vaga-dia disponível"
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
              Reservas por situação ({label})
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
          <CardContent className="flex flex-col p-6">
            <span className="flex items-center gap-1.5 text-caption text-muted">
              <Ban className="h-3.5 w-3.5 text-muted-soft" aria-hidden /> Cancelamento ({label})
            </span>
            {funnel.isLoading ? (
              <Skeleton className="mt-2 h-8 w-24" />
            ) : (
              <span className="mt-1.5 text-display-xl tabular-nums text-ink">
                {cancel.rate.toFixed(0).replace(".", ",")}%
              </span>
            )}
            <span className={cn("mt-1.5 text-caption-sm font-medium", toneClass[benchmark.tone])}>
              {benchmark.label}
            </span>
            <span className="mt-0.5 text-caption-sm text-muted-soft">
              {cancel.cancelled} canceladas e {cancel.noShow} no-show de {cancel.total} reservas
            </span>
          </CardContent>
        </Card>

        {canReviews && (
          <Card>
            <CardContent className="flex flex-col p-6">
              <span className="flex items-center gap-1.5 text-caption text-muted">
                <Star className="h-3.5 w-3.5 text-amber-500" aria-hidden /> Avaliações
              </span>
              {reviews.isLoading ? (
                <Skeleton className="mt-2 h-8 w-24" />
              ) : rating.count === 0 ? (
                <span className="mt-1.5 text-title-md text-muted-soft">Ainda sem avaliação</span>
              ) : (
                <span className="mt-1.5 flex items-baseline gap-1.5 text-display-xl tabular-nums text-ink">
                  {formatRating(rating.avg)}
                  <span className="text-caption-sm font-normal text-muted-soft">
                    de 5 · {rating.count}
                  </span>
                </span>
              )}
              <span className="mt-1.5 text-caption-sm text-muted-soft">
                {pending === 0 ? "Nenhuma aguardando resposta" : `${pending} aguardando resposta`}
              </span>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="flex flex-col gap-3 p-6">
            <span className="flex items-center gap-1.5 text-caption text-muted">
              <Radio className="h-3.5 w-3.5 text-mp-indigo" aria-hidden /> Origem ({label})
            </span>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-strong">
              <div
                className="bg-mp-indigo"
                style={{
                  width: `${channel.site + channel.api ? (channel.site / (channel.site + channel.api)) * 100 : 0}%`,
                }}
              />
              <div
                className="bg-mp-violet"
                style={{
                  width: `${channel.site + channel.api ? (channel.api / (channel.site + channel.api)) * 100 : 0}%`,
                }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-body-sm">
                <span className="flex items-center gap-1.5 text-muted">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-mp-indigo" aria-hidden />
                  Pelo site
                </span>
                <span className="font-medium tabular-nums text-ink">{channel.site}</span>
              </div>
              <div className="flex items-center justify-between text-body-sm">
                <span className="flex items-center gap-1.5 text-muted">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-mp-violet" aria-hidden />
                  Pela API
                </span>
                <span className="font-medium tabular-nums text-ink">{channel.api}</span>
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
