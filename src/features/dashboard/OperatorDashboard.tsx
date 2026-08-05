import * as React from "react";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { Flame, Pencil } from "@phosphor-icons/react";
import { format, addDays, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BOOKING_STATUS_LABELS } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { RecipientKycBanner } from "@/features/payouts/RecipientKycBanner";
import { bookingCustomerName } from "@/features/bookings/bookings.logic";
import { useRevenueByRange, useStatusFunnelRange } from "@/features/reports/api";
import { PeriodPicker } from "@/features/manager-filters/PeriodPicker";
import {
  DEFAULT_PERIOD,
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
import { useAuth } from "@/auth/context";
import { useScopedLocationIds } from "@/auth/useScopedLocationIds";
import { cn } from "@/lib/utils";
import { formatBRL, formatTime } from "@/lib/format";
import type { BookingStatus, BookingWithRelations } from "@/types/domain";
import {
  useOperatorPeriodSummary,
  useUpcomingBookingsCount,
  useHighDemandToday,
  useOccupancyAgg,
  useCompanyRevenueGoal,
  useSetRevenueGoal,
  useDayAgenda,
  todayIsoDate,
} from "./api";
import {
  cancellationRate,
  cancellationBenchmark,
  averageRating,
  pendingReviews,
  occupancyRate,
  revpar,
} from "./dashboardMetrics.logic";
import {
  agendaHours,
  agendaStrip,
  bestRevenueDay,
  conversion,
  goalProgress,
  greeting,
  periodInsight,
  situations,
} from "./operatorInsights.logic";

const int = (n: number | null | undefined) => Number(n ?? 0).toLocaleString("pt-BR");
const oneDecimal = (n: number) =>
  Number(n ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** Sobe a inicial: o rótulo do benchmark é fragmento e abre uma frase aqui. */
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Card do painel: cantos de 20px, superfície branca, sem borda. */
function Panel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <Card className={cn("rounded-lg border-transparent p-7", className)} {...props} />;
}

function PanelTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 text-title-md text-ink">{children}</div>
      {aside && <div className="shrink-0 text-caption font-medium text-muted">{aside}</div>}
    </div>
  );
}

/** Número grande com rótulo, no formato dos cards pequenos do design. */
function StatPanel({
  label,
  value,
  hint,
  tone,
  isLoading,
}: {
  label: string;
  value: React.ReactNode;
  hint: string;
  tone?: "alert";
  isLoading?: boolean;
}) {
  return (
    <Panel className="p-6">
      <div className="text-body-sm font-medium text-ink">{label}</div>
      {isLoading ? (
        <Skeleton className="mt-3.5 h-8 w-24" />
      ) : (
        <div
          className={cn(
            "mt-3.5 whitespace-nowrap text-display-xl tabular-nums",
            tone === "alert" ? "text-error" : "text-ink",
          )}
        >
          {value}
        </div>
      )}
      <div className="mt-1.5 text-caption text-muted">{hint}</div>
    </Panel>
  );
}

/**
 * Medidor de ocupação: arco de 180° com a ponta arredondada. O comprimento do
 * semicírculo de raio 90 é π·90 ≈ 282.74, e é sobre ele que a fatia é calculada.
 */
const ARC_LENGTH = 282.74;

function OccupancyGauge({ rate, caption }: { rate: number; caption: string }) {
  const filled = (Math.max(0, Math.min(100, rate)) / 100) * ARC_LENGTH;
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
          {/* Ocupação zero não desenha nada: a ponta arredondada pinta um ponto
              mesmo com traço de comprimento zero, e o ponto lia como "tem algo". */}
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
          <div className="text-display-xl tabular-nums leading-none text-ink">
            {rate.toFixed(0)}%
          </div>
        </div>
      </div>
      {/* A legenda fica FORA da caixa do arco: dentro, um texto mais longo que
          "3 de 8 vagas" montava em cima do traço. */}
      <p className="mt-2 text-center text-caption text-muted">{caption}</p>
    </div>
  );
}

const SITUATION_COLOR: Record<string, string> = {
  completed: "hsl(var(--mp-indigo))",
  checked_in: "hsl(var(--mp-primary))",
  confirmed: "hsl(var(--mp-indigo))",
  pending: "hsl(var(--warning))",
  expired: "hsl(var(--muted-steel))",
  cancelled: "hsl(var(--error))",
  no_show: "hsl(var(--mp-red-deep))",
};

/** Diálogo da meta de receita. Só abre para quem tem `finance:write`. */
function GoalDialog({
  open,
  onOpenChange,
  current,
  companyId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: number | null;
  companyId: string | undefined;
}) {
  const [value, setValue] = React.useState<number | null>(current);
  const save = useSetRevenueGoal(companyId);

  React.useEffect(() => {
    if (open) setValue(current);
  }, [open, current]);

  async function submit() {
    try {
      await save.mutateAsync(value ? Math.round(value * 100) : null);
      toast.success(value ? "Meta atualizada" : "Meta removida");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar a meta");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Meta de receita</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="meta-receita">Quanto a empresa quer faturar no período</Label>
          <CurrencyInput id="meta-receita" value={value} onChange={setValue} />
          <p className="text-caption text-muted">Deixe em branco para tirar a meta do painel.</p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button size="sm" onClick={submit} disabled={save.isPending}>
            {save.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function OperatorDashboard() {
  const { session, effectiveCompanyIds, hasScope } = useAuth();
  const { ids: scopedLocationIds } = useScopedLocationIds();
  const companyId = effectiveCompanyIds[0];

  const [period, setPeriod] = React.useState<PeriodState>(DEFAULT_PERIOD);
  const [agendaDate, setAgendaDate] = React.useState(todayIsoDate);
  const [goalOpen, setGoalOpen] = React.useState(false);

  const range = resolvePeriod(period);
  const compareRange = resolveCompare(period, range);
  const days = periodDays(range);
  const rangeFrom = range.from.toISOString();
  const rangeTo = range.to.toISOString();

  // O painel espelha o escopo (ADR-005), do mesmo jeito que a sidebar: quem não tem o
  // escopo não vê o card. O papel Operação não vê dinheiro; o Financeiro não vê avaliações.
  const canReviews = hasScope("reviews:read", companyId);
  const canFinance = hasScope("finance:read", companyId);
  const canPayouts = hasScope("payouts:read", companyId);
  const canEditGoal = hasScope("finance:write", companyId);

  const summary = useOperatorPeriodSummary(range, compareRange, scopedLocationIds);
  const revenue = useRevenueByRange(rangeFrom, rangeTo, scopedLocationIds);
  const funnel = useStatusFunnelRange(rangeFrom, rangeTo, scopedLocationIds);
  const upcoming = useUpcomingBookingsCount(days, scopedLocationIds);
  const highDemand = useHighDemandToday(scopedLocationIds);
  const balance = usePayoutBalance(companyId);
  const reviews = useOperatorReviews(companyId);
  const goal = useCompanyRevenueGoal(canFinance ? companyId : undefined);
  const agenda = useDayAgenda(agendaDate, scopedLocationIds);

  // Ocupação é por unidade (RPC por location_id), então precisa dos ids reais da empresa:
  // scopedLocationIds vem undefined para o operador real (a RLS resolve o resto).
  const locations = useOperatorLocations(effectiveCompanyIds);
  const occLocationIds = locations.data?.map((l) => l.id);
  const today = format(new Date(), "yyyy-MM-dd");
  const in7 = format(addDays(new Date(), 7), "yyyy-MM-dd");
  const occ7 = useOccupancyAgg(occLocationIds, today, in7);
  const occPeriod = useOccupancyAgg(
    occLocationIds,
    format(range.from, "yyyy-MM-dd"),
    format(subDays(range.to, 1), "yyyy-MM-dd"),
  );

  const cur = summary.data?.current;
  const daily = React.useMemo(
    () => (revenue.data ?? []).map((d) => ({ date: d.date, total: d.total })),
    [revenue.data],
  );
  const conv = conversion(funnel.data ?? []);
  const rows = situations(funnel.data ?? []);
  const best = bestRevenueDay(daily);
  const insight = periodInsight({
    revenue: cur?.revenue ?? 0,
    daily,
    conversion: conv,
    periodDays: days,
  });
  const progress = goalProgress(cur?.revenue ?? 0, goal.data);
  const cancel = cancellationRate(funnel.data ?? []);
  const benchmark = cancellationBenchmark(cancel.rate);
  const rating = averageRating(reviews.data ?? []);
  const pending = pendingReviews(reviews.data ?? []);
  const channel = summary.data?.channelMix ?? { site: 0, api: 0 };
  const channelTotal = channel.site + channel.api;
  const occ7Rate = occupancyRate(occ7.data?.bookedDays ?? 0, occ7.data?.capacityDays ?? 0);
  const revparValue = revpar(cur?.revenue ?? 0, occPeriod.data?.capacityDays ?? 0);
  const label = periodLabel(period, range);

  const firstName = session?.firstName ?? "";
  const strip = agendaStrip(agendaDate);
  const events = agenda.data ?? [];
  const hours = agendaHours(events.map((b) => new Date(b.check_in_at).getHours()));
  const arrivals = events.filter((b) => b.check_in_at.slice(0, 10) === agendaDate).length;
  const departures = events.filter((b) => b.check_out_at.slice(0, 10) === agendaDate).length;

  return (
    <div className="flex flex-col gap-5">
      {/* Saudação e o recorte do período. */}
      <div className="flex flex-wrap items-end justify-between gap-4 px-1">
        <div className="min-w-0">
          <h1 className="text-display-2xl text-ink">
            {greeting(new Date().getHours())}
            {firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="mt-2 text-body-md text-body">
            {session?.companyIds.length
              ? `${label}, de ${formatRangeLabel(range)}.`
              : "Você ainda não está vinculado a uma empresa."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {highDemand.data ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-mp-pale px-3 py-1.5 text-caption font-medium text-mp-indigo">
              <Flame className="h-3.5 w-3.5" aria-hidden /> Em alta demanda hoje
            </span>
          ) : null}
          <PeriodPicker value={period} onChange={setPeriod} className="w-full tablet:w-[230px]" />
        </div>
      </div>

      <RecipientKycBanner companyId={companyId} />

      {/* ===== Linha 1: leitura, receita e ocupação ===== */}
      <div className="grid grid-cols-1 gap-5 tablet:grid-cols-2 desktop:grid-cols-3">
        {insight ? (
          <section className="bg-dashboard-hero flex flex-col overflow-hidden rounded-lg p-7 text-white">
            <span className="self-start rounded-full bg-white/20 px-3 py-1.5 text-caption font-bold">
              Leitura do período
            </span>
            <div className="mt-auto pt-6">
              <p className="text-display-md leading-tight text-white">{insight.title}</p>
              <p className="mt-2.5 text-body-sm leading-relaxed text-white/80">{insight.detail}</p>
            </div>
          </section>
        ) : (
          <section className="bg-dashboard-hero flex flex-col justify-center overflow-hidden rounded-lg p-7 text-white">
            <span className="self-start rounded-full bg-white/20 px-3 py-1.5 text-caption font-bold">
              Leitura do período
            </span>
            <p className="mt-6 text-body-md text-white/80">
              Sem reserva no período escolhido. A leitura aparece assim que entrar movimento.
            </p>
          </section>
        )}

        {canFinance && (
          <section className="flex flex-col overflow-hidden rounded-lg bg-mp-primary p-7 text-white">
            <div>
              <div className="text-body-sm font-medium text-white/90">Receita do período</div>
              <div className="mt-1 text-caption text-white/70">realizado no período</div>
            </div>
            {summary.isLoading ? (
              <Skeleton className="mt-5 h-10 w-40 bg-white/20" />
            ) : (
              <div className="mt-5 text-display-2xl tabular-nums leading-none text-white">
                {formatBRL(cur?.revenue ?? 0)}
              </div>
            )}

            {progress.target !== null ? (
              <>
                <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/25">
                  <div className="h-full rounded-full bg-white" style={{ width: progress.width }} />
                </div>
                <div className="mt-2.5 flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-caption font-bold text-white">{progress.pct}% da meta</span>
                  <span className="text-caption text-white/75">
                    meta de {formatBRL(progress.target)}
                  </span>
                </div>
              </>
            ) : (
              <p className="mt-5 text-caption text-white/75">
                Sem meta definida para comparar o realizado.
              </p>
            )}

            <div className="mt-auto pt-5 text-caption leading-relaxed text-white/75">
              {canEditGoal ? (
                <button
                  type="button"
                  onClick={() => setGoalOpen(true)}
                  className="inline-flex items-center gap-1.5 font-bold text-white underline underline-offset-2"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                  {progress.target !== null ? "Editar meta" : "Definir meta"}
                </button>
              ) : (
                "A meta é definida por quem cuida do financeiro da empresa."
              )}
            </div>
          </section>
        )}

        <Panel className="flex flex-col">
          <PanelTitle aside="próx. 7 dias">Ocupação</PanelTitle>
          <div className="my-5">
            {occ7.isLoading ? (
              <Skeleton className="mx-auto h-28 w-full max-w-[212px]" />
            ) : (
              <OccupancyGauge
                rate={occ7Rate}
                caption={
                  occ7.data?.capacityDays
                    ? `${int(occ7.data.bookedDays)} de ${int(occ7.data.capacityDays)} vaga-dia`
                    : "sem capacidade cadastrada"
                }
              />
            )}
          </div>
          <div className="mt-auto flex gap-1">
            {Array.from({ length: 16 }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-1.5 flex-1 rounded-full",
                  i < Math.round((occ7Rate / 100) * 16) ? "bg-mp-primary" : "bg-surface-strong",
                )}
              />
            ))}
          </div>
          <p className="mt-3 text-caption leading-relaxed text-muted">
            {occ7.data?.capacityDays
              ? `Sobram ${int((occ7.data.capacityDays ?? 0) - (occ7.data.bookedDays ?? 0))} vaga-dia na próxima semana.`
              : "Cadastre a capacidade das unidades para acompanhar a ocupação."}
          </p>
        </Panel>
      </div>

      {/* ===== Linha 2: receita diária e conversão ===== */}
      <div className="grid grid-cols-1 gap-5 desktop:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {canFinance && (
          <Panel className="flex flex-col">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-title-md text-ink">
                  Receita diária, <span className="text-mp-primary">{formatRangeLabel(range)}</span>
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
                      <linearGradient id="op-rev" x1="0" y1="0" x2="0" y2="1">
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
                      width={78}
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
                      fill="url(#op-rev)"
                      dot={{ r: 3, fill: "hsl(var(--canvas))", strokeWidth: 2 }}
                      activeDot={{ r: 5 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </Panel>
        )}

        <Panel className="flex flex-col">
          <div className="min-w-0">
            <div className="text-title-md text-ink">Reservas pagas</div>
            <div className="mt-1 text-body-sm text-muted">
              de {int(conv.created)} criadas no período
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-baseline gap-2.5">
            <span className="text-display-2xl tabular-nums leading-none text-ink">
              {int(conv.paid)}
            </span>
            {conv.created > 0 && (
              <span className="whitespace-nowrap rounded-full bg-mp-pale px-3 py-1.5 text-caption font-bold text-mp-indigo">
                {conv.rate}% converteram
              </span>
            )}
          </div>

          <div className="mt-5 h-2 overflow-hidden rounded-full bg-surface-strong">
            <div className="h-full rounded-full bg-mp-primary" style={{ width: `${conv.rate}%` }} />
          </div>

          <div className="mt-5 flex flex-col gap-0.5">
            {rows.map((r) => (
              <div key={r.status} className="flex items-center gap-2.5 rounded-md px-2 py-2.5">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: SITUATION_COLOR[r.status] ?? "hsl(var(--muted))" }}
                  aria-hidden
                />
                <span className="text-body-sm text-body">
                  {BOOKING_STATUS_LABELS[r.status as BookingStatus] ?? r.status}
                </span>
                <span className="ml-auto text-body-sm font-bold tabular-nums text-ink">
                  {int(r.count)}
                </span>
                <span className="w-9 shrink-0 text-right text-caption tabular-nums text-muted-soft">
                  {r.pct}%
                </span>
              </div>
            ))}
            {rows.length === 0 && (
              <p className="py-4 text-body-sm text-muted">Nenhuma reserva criada no período.</p>
            )}
          </div>
        </Panel>
      </div>

      {/* ===== Linha 3: qualidade, indicadores e agenda ===== */}
      <div className="grid grid-cols-1 items-start gap-5 desktop:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <div className="flex flex-col gap-5">
          <Panel>
            <PanelTitle aside={label.toLowerCase()}>Qualidade da operação</PanelTitle>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <QualityTile
                label="Antecedência"
                value={`${oneDecimal(summary.data?.leadTimeDays ?? 0)}d`}
              />
              <QualityTile
                label="Permanência"
                value={`${oneDecimal(cur?.count ? (cur.vehicleDays ?? 0) / cur.count : 0)}d`}
              />
              <QualityTile label="No-show" value={int(conv.noShow)} />
              <QualityTile label="Cancelamento" value={`${cancel.rate.toFixed(0)}%`} />
            </div>
            <p className="mt-4 text-body-sm leading-relaxed text-body">
              {cancel.total > 0
                ? `${sentence(benchmark.label)}. ${int(cancel.cancelled)} ${cancel.cancelled === 1 ? "cancelada" : "canceladas"} de ${int(cancel.total)} com desfecho.`
                : "Sem reserva com desfecho no período para medir a qualidade."}
            </p>
          </Panel>

          <div className="grid grid-cols-1 gap-5 tablet:grid-cols-2">
            {canFinance && (
              <StatPanel
                label="RevPAR"
                value={occPeriod.data?.capacityDays ? formatBRL(revparValue) : "-"}
                hint="receita por vaga-dia disponível"
                isLoading={occPeriod.isLoading}
              />
            )}
            <StatPanel
              label="Reservas futuras"
              value={int(upcoming.data)}
              hint="com check-in daqui pra frente"
              tone={(upcoming.data ?? 0) === 0 ? "alert" : undefined}
              isLoading={upcoming.isLoading}
            />
            {canPayouts && (
              <StatPanel
                label="Saldo a repassar"
                value={formatBRL((balance.data?.balance_cents ?? 0) / 100)}
                hint="líquido menos saques"
                isLoading={balance.isLoading}
              />
            )}
            {canReviews && (
              <StatPanel
                label="Avaliações"
                value={rating.count === 0 ? "-" : oneDecimal(rating.avg)}
                hint={
                  rating.count === 0
                    ? "ainda sem avaliação"
                    : pending === 0
                      ? `${int(rating.count)} avaliações, nenhuma aguardando resposta`
                      : `${int(pending)} aguardando resposta`
                }
                isLoading={reviews.isLoading}
              />
            )}
          </div>

          <Panel>
            <div className="text-title-md text-ink">Origem das reservas</div>
            <div className="mt-5 flex h-2.5 gap-1 overflow-hidden rounded-full">
              <div
                className="rounded-full bg-mp-primary"
                style={{ width: channelTotal ? `${(channel.site / channelTotal) * 100}%` : "100%" }}
              />
              <div
                className="rounded-full bg-surface-strong"
                style={{ width: channelTotal ? `${(channel.api / channelTotal) * 100}%` : "0%" }}
              />
            </div>
            <div className="mt-5 flex items-center justify-between gap-3">
              <span className="inline-flex min-w-0 items-center gap-2.5 text-body-sm text-body">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-mp-primary" aria-hidden />
                Pelo site
              </span>
              <span className="shrink-0 text-body-sm font-bold tabular-nums text-ink">
                {int(channel.site)}
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="inline-flex min-w-0 items-center gap-2.5 text-body-sm text-muted">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-surface-strong" aria-hidden />
                Pela API
              </span>
              <span className="shrink-0 text-body-sm font-bold tabular-nums text-muted-soft">
                {int(channel.api)}
              </span>
            </div>
          </Panel>
        </div>

        {/* Agenda do dia */}
        <Panel>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-title-md text-ink">Agenda do dia</div>
              <p className="mt-1.5 text-body-sm capitalize text-muted">
                {format(new Date(`${agendaDate}T12:00:00`), "EEEE, d 'de' MMMM", { locale: ptBR })}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <span className="whitespace-nowrap rounded-full bg-mp-pale px-3 py-1.5 text-caption font-bold text-mp-indigo">
                {int(arrivals)} {arrivals === 1 ? "chegada" : "chegadas"}
              </span>
              <span className="whitespace-nowrap rounded-full bg-surface-soft px-3 py-1.5 text-caption font-bold text-muted">
                {int(departures)} {departures === 1 ? "saída" : "saídas"}
              </span>
            </div>
          </div>

          <div className="mt-5 flex gap-1.5">
            {strip.map((iso) => {
              const day = new Date(`${iso}T12:00:00`);
              const active = iso === agendaDate;
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => setAgendaDate(iso)}
                  aria-pressed={active}
                  className={cn(
                    "min-w-0 flex-1 rounded-md py-2.5 transition-colors",
                    active
                      ? "bg-mp-primary text-white"
                      : "bg-surface-soft text-ink hover:bg-surface-strong",
                  )}
                >
                  <span className="block text-caption-sm font-medium opacity-70">
                    {format(day, "EEEEEE", { locale: ptBR })}
                  </span>
                  <span className="mt-0.5 block text-body-sm font-bold tabular-nums">
                    {format(day, "dd")}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-5 max-h-[326px] overflow-y-auto pr-1">
            {agenda.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : events.length === 0 ? (
              <EmptyState
                title="Nenhuma reserva nesse dia"
                description="Escolha outro dia acima."
              />
            ) : (
              <ol>
                {hours.map((hour) => {
                  const atHour = events.filter((b) => new Date(b.check_in_at).getHours() === hour);
                  return (
                    <li key={hour} className="flex min-h-[56px] gap-3.5">
                      <div className="w-11 shrink-0 pt-2.5 text-caption-sm font-bold text-muted-soft">
                        {String(hour).padStart(2, "0")}:00
                      </div>
                      <div className="min-w-0 flex-1 border-t border-dashed border-hairline py-2">
                        {atHour.map((b) => (
                          <AgendaEvent key={b.id} booking={b} />
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </Panel>
      </div>

      <GoalDialog
        open={goalOpen}
        onOpenChange={setGoalOpen}
        current={goal.data ? goal.data / 100 : null}
        companyId={companyId}
      />
    </div>
  );
}

function QualityTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface-soft p-3.5">
      <div className="text-caption text-muted">{label}</div>
      <div className="mt-1.5 text-display-sm tabular-nums text-ink">{value}</div>
    </div>
  );
}

function AgendaEvent({ booking }: { booking: BookingWithRelations }) {
  return (
    <div className="rounded-md bg-canvas p-3.5 ring-1 ring-inset ring-hairline">
      <div className="flex items-center gap-2.5">
        <span className="h-2 w-2 shrink-0 rounded-full bg-mp-primary" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-body-sm font-medium text-ink">
          {bookingCustomerName(booking) ?? "Sem nome"}
        </span>
        <span className="shrink-0 rounded-full bg-surface-soft px-2.5 py-1 text-caption-sm font-bold text-muted">
          {BOOKING_STATUS_LABELS[booking.status] ?? booking.status}
        </span>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
        <span className="shrink-0 rounded-sm bg-surface-soft px-2 py-1 font-mono text-caption-sm font-medium text-body">
          {booking.code}
        </span>
        <span className="min-w-0 text-body-sm text-muted">
          Chegada {formatTime(booking.check_in_at)} · {booking.location?.name}
        </span>
      </div>
    </div>
  );
}
