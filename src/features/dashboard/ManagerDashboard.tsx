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
import {
  CalendarCheck,
  Wallet,
  Receipt,
  CarFront,
  LogIn,
  LogOut,
  Building2,
  Coins,
  LineChart as LineChartIcon,
  MapPin,
  CalendarRange,
  Users,
  Ban,
  Clock,
  Ticket,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { KpiCard } from "@/components/shared/KpiCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { BookingTable } from "@/features/bookings/BookingTable";
import { BookingModal } from "@/features/bookings/BookingModal";
import { useRecentBookings } from "@/features/bookings/api";
import { useRevenueByRange } from "@/features/reports/api";
import { useManagerFilters } from "@/features/manager-filters/context";
import { ManagerFilterBar } from "@/features/manager-filters/ManagerFilterBar";
import { compareLabel, periodLabel } from "@/features/manager-filters/managerFilters.logic";
import { useManagerStats, useManagerOverview, useManagerDailyFlow, todayIsoDate } from "./api";
import {
  pctDelta,
  formatDelta,
  fillStayBuckets,
  flowTotals,
  hourLabel,
  sharePct,
} from "./dashboardMetrics.logic";
import { FARE_TIER_LABEL } from "@/lib/fares";
import { formatBRL } from "@/lib/format";
import type { BookingWithRelations } from "@/types/domain";

const int = (n: number | null | undefined) => Number(n ?? 0).toLocaleString("pt-BR");
const decimal = (n: number, digits = 1) =>
  Number(n ?? 0).toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

/** Cabeçalho de card com o chip de ícone da marca, o mesmo do painel do parceiro. */
function SectionTitle({
  icon: Icon,
  children,
}: {
  icon: typeof Wallet;
  children: React.ReactNode;
}) {
  return (
    <CardTitle className="flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-mp-pale text-mp-indigo">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      {children}
    </CardTitle>
  );
}

export default function ManagerDashboard() {
  const { period, range, compareRange, scopedLocationIds } = useManagerFilters();
  const [flowDate, setFlowDate] = React.useState(todayIsoDate);
  const [selected, setSelected] = React.useState<BookingWithRelations | null>(null);

  const stats = useManagerStats(scopedLocationIds);
  const overview = useManagerOverview(range, compareRange, scopedLocationIds);
  const revenue = useRevenueByRange(
    range.from.toISOString(),
    range.to.toISOString(),
    scopedLocationIds,
  );
  const flow = useManagerDailyFlow(flowDate, scopedLocationIds);
  const recent = useRecentBookings(20, scopedLocationIds);

  const cur = overview.data?.current;
  const prev = overview.data?.previous;
  const statuses = overview.data?.statuses;
  const customers = overview.data?.customers;
  const label = periodLabel(period, range);
  // Sem comparação escolhida, o card não mostra variação: um "+12%" sem base
  // declarada é pior que nenhum número.
  const vs = compareLabel(period, compareRange);
  const delta = (a: number | undefined, b: number | undefined) =>
    compareRange && a !== undefined && b !== undefined ? formatDelta(pctDelta(a, b)) : undefined;

  const destinations = overview.data?.by_destination ?? [];
  const destinationRevenue = destinations.reduce((acc, d) => acc + Number(d.revenue), 0);
  const stayBuckets = fillStayBuckets(overview.data?.length_of_stay ?? []);
  const stayTotal = stayBuckets.reduce((acc, b) => acc + b.bookings, 0);
  const topLocations = overview.data?.top_locations ?? [];

  const entries = flowTotals(flow.data?.entries ?? []);
  const exits = flowTotals(flow.data?.exits ?? []);
  const flowChart = (flow.data?.entries ?? []).map((e, i) => ({
    hour: hourLabel(e.hour),
    entradas: e.vehicles,
    saidas: flow.data?.exits[i]?.vehicles ?? 0,
  }));

  const fares = overview.data?.by_fare ?? [];
  const fareTotal = fares.reduce((acc, f) => acc + Number(f.revenue), 0);

  const customersTotal = (customers?.new ?? 0) + (customers?.returning ?? 0);
  const cancelBase = (statuses?.total ?? 0) - (statuses?.expired ?? 0) - (statuses?.pending ?? 0);
  const cancelCount = (statuses?.cancelled ?? 0) + (statuses?.no_show ?? 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dashboard"
        description="O movimento de hoje e o resultado do período escolhido."
        actions={<ManagerFilterBar />}
      />

      {/* Hoje: o que a operação precisa saber agora. */}
      <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2 desktop:grid-cols-4">
        <KpiCard
          label="Chegadas de hoje"
          value={int(stats.data?.bookingsToday)}
          hint="vs. ontem"
          trend={
            stats.data
              ? formatDelta(pctDelta(stats.data.bookingsToday, stats.data.bookingsYesterday))
              : undefined
          }
          isLoading={stats.isLoading}
          icon={CalendarCheck}
          highlight
        />
        <KpiCard
          label="Check-ins de hoje"
          value={int(stats.data?.checkInsToday)}
          hint="carros que já entraram"
          isLoading={stats.isLoading}
          icon={LogIn}
          accent="teal"
        />
        <KpiCard
          label="Check-outs de hoje"
          value={int(stats.data?.checkOutsToday)}
          hint="carros que já saíram"
          isLoading={stats.isLoading}
          icon={LogOut}
          accent="sky"
        />
        <KpiCard
          label="Rede ativa"
          value={int(stats.data?.activeLocations)}
          hint={`unidades em ${int(stats.data?.activeCompanies)} empresas`}
          isLoading={stats.isLoading}
          icon={Building2}
          accent="indigo"
        />
      </div>

      {/* Período: dinheiro e volume, com a comparação escolhida no filtro. */}
      <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2 desktop:grid-cols-4">
        <KpiCard
          label={`Receita (${label})`}
          value={formatBRL(cur?.revenue ?? 0)}
          hint={vs ?? undefined}
          trend={delta(cur?.revenue, prev?.revenue)}
          isLoading={overview.isLoading}
          icon={Wallet}
          accent="green"
        />
        <KpiCard
          label={`Diárias vendidas (${label})`}
          value={int(cur?.vehicle_days)}
          hint={`${int(cur?.bookings)} reservas`}
          trend={delta(cur?.vehicle_days, prev?.vehicle_days)}
          isLoading={overview.isLoading}
          icon={CarFront}
          accent="indigo"
        />
        <KpiCard
          label="Ticket médio"
          value={formatBRL(cur?.ticket ?? 0)}
          hint="por reserva paga"
          trend={delta(cur?.ticket, prev?.ticket)}
          isLoading={overview.isLoading}
          icon={Receipt}
          accent="amber"
        />
        <KpiCard
          label="Receita por diária"
          value={formatBRL(cur?.revenue_per_vehicle_day ?? 0)}
          hint={`permanência média de ${decimal(cur?.avg_stay_days ?? 0)} dias`}
          isLoading={overview.isLoading}
          icon={Coins}
          accent="teal"
        />
      </div>

      <Card>
        <CardHeader>
          <SectionTitle icon={LineChartIcon}>Receita por dia de check-in</SectionTitle>
        </CardHeader>
        <CardContent>
          {revenue.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (revenue.data?.length ?? 0) === 0 ? (
            <EmptyState
              title="Sem receita no período"
              description="As reservas pagas aparecem aqui assim que entrarem."
            />
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

      <div className="grid grid-cols-1 gap-4 desktop:grid-cols-2">
        {/* Onde o volume está: o Hub vende em vários aeroportos, e a média esconde isso. */}
        <Card>
          <CardHeader>
            <SectionTitle icon={MapPin}>Por destino ({label})</SectionTitle>
          </CardHeader>
          <CardContent>
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
                  const share = sharePct(Number(d.revenue), destinationRevenue);
                  return (
                    <li key={`${d.code}-${d.name}`} className="flex flex-col gap-1.5">
                      <div className="flex items-baseline justify-between gap-3 text-body-sm">
                        <span className="truncate text-ink">{d.name}</span>
                        <span className="shrink-0 tabular-nums text-ink">
                          {formatBRL(Number(d.revenue))}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-surface-strong">
                        <div className="h-full bg-mp-primary" style={{ width: `${share}%` }} />
                      </div>
                      <div className="flex items-baseline justify-between gap-3 text-caption-sm text-muted-soft">
                        <span>
                          {int(d.bookings)} reservas · {int(d.vehicle_days)} diárias
                        </span>
                        <span className="tabular-nums">{share}%</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Permanência: define capacidade e onde a tabela de preço precisa mudar. */}
        <Card>
          <CardHeader>
            <SectionTitle icon={CalendarRange}>Permanência ({label})</SectionTitle>
          </CardHeader>
          <CardContent>
            {overview.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : stayTotal === 0 ? (
              <EmptyState
                title="Sem reservas no período"
                description="A distribuição por diárias aparece aqui."
              />
            ) : (
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stayBuckets}>
                    <CartesianGrid stroke="hsl(var(--hairline-soft))" strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="hsl(var(--muted))" />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 12 }}
                      stroke="hsl(var(--muted))"
                      width={36}
                    />
                    <Tooltip
                      formatter={(v: number) => [`${int(v)} reservas`, "Reservas"]}
                      labelStyle={{ color: "hsl(var(--ink))" }}
                    />
                    <Bar
                      dataKey="bookings"
                      name="Reservas"
                      fill="hsl(var(--mp-indigo))"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
        {/* Novos x recorrentes: o legado chamava de "primeira compra" e "clientes fiéis". */}
        <Card>
          <CardContent className="flex flex-col gap-3 p-6">
            <span className="flex items-center gap-1.5 text-caption text-muted">
              <Users className="h-3.5 w-3.5 text-mp-indigo" aria-hidden /> Clientes ({label})
            </span>
            {overview.isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : customersTotal === 0 ? (
              <span className="text-title-md text-muted-soft">Sem reservas no período</span>
            ) : (
              <>
                <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-strong">
                  <div
                    className="bg-mp-indigo"
                    style={{ width: `${sharePct(customers?.new ?? 0, customersTotal)}%` }}
                  />
                  <div
                    className="bg-mp-violet"
                    style={{ width: `${sharePct(customers?.returning ?? 0, customersTotal)}%` }}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-body-sm">
                    <span className="flex items-center gap-1.5 text-muted">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-mp-indigo" aria-hidden />
                      Primeira reserva
                    </span>
                    <span className="font-medium tabular-nums text-ink">{int(customers?.new)}</span>
                  </div>
                  <div className="flex items-center justify-between text-body-sm">
                    <span className="flex items-center gap-1.5 text-muted">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-mp-violet" aria-hidden />
                      Já tinham reservado
                    </span>
                    <span className="font-medium tabular-nums text-ink">
                      {int(customers?.returning)}
                    </span>
                  </div>
                </div>
                <span className="text-caption-sm text-muted-soft">
                  {sharePct(customers?.returning ?? 0, customersTotal)}% das reservas vieram de quem
                  já é cliente
                </span>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col p-6">
            <span className="flex items-center gap-1.5 text-caption text-muted">
              <Ban className="h-3.5 w-3.5 text-muted-soft" aria-hidden /> Cancelamento ({label})
            </span>
            {overview.isLoading ? (
              <Skeleton className="mt-2 h-8 w-24" />
            ) : (
              <span className="mt-1.5 text-display-xl tabular-nums text-ink">
                {sharePct(cancelCount, cancelBase)}%
              </span>
            )}
            <span className="mt-1.5 text-caption-sm text-muted-soft">
              {int(statuses?.cancelled)} canceladas e {int(statuses?.no_show)} no-show de{" "}
              {int(cancelBase)} reservas
            </span>
            <span className="mt-0.5 text-caption-sm text-muted-soft">
              {int(statuses?.expired)} expiraram sem pagar
            </span>
          </CardContent>
        </Card>

        {/* O que a Movepark ganha: tarifa por tier, visão de Super Admin. */}
        <Card>
          <CardContent className="flex flex-col gap-3 p-6">
            <span className="flex items-center gap-1.5 text-caption text-muted">
              <Ticket className="h-3.5 w-3.5 text-mp-indigo" aria-hidden /> Receita de tarifas (
              {label})
            </span>
            {overview.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <div className="flex flex-col gap-1.5">
                {fares.map((f) => (
                  <div key={f.tier} className="flex items-center justify-between text-body-sm">
                    <span className="text-muted">
                      {FARE_TIER_LABEL[f.tier as keyof typeof FARE_TIER_LABEL] ?? f.tier}{" "}
                      <span className="text-caption">({int(f.bookings)})</span>
                    </span>
                    <span className="tabular-nums text-ink">{formatBRL(Number(f.revenue))}</span>
                  </div>
                ))}
                <div className="mt-1 flex items-center justify-between border-t border-hairline-soft pt-2 text-body-sm">
                  <span className="text-muted">Total</span>
                  <span className="font-medium tabular-nums text-mp-primary">
                    {formatBRL(fareTotal)}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Fluxo do dia: quantos carros chegam em cada hora define a escala de equipe. */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <SectionTitle icon={Clock}>Fluxo de veículos por hora</SectionTitle>
          <Input
            type="date"
            aria-label="Dia do fluxo de veículos"
            value={flowDate}
            onChange={(e) => setFlowDate(e.target.value)}
            className="h-10 w-[170px]"
          />
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
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
                    <CartesianGrid stroke="hsl(var(--hairline-soft))" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="hour"
                      tick={{ fontSize: 11 }}
                      interval={1}
                      stroke="hsl(var(--muted))"
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 12 }}
                      stroke="hsl(var(--muted))"
                      width={36}
                    />
                    <Tooltip labelStyle={{ color: "hsl(var(--ink))" }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    <Bar
                      dataKey="entradas"
                      name="Entradas"
                      fill="hsl(var(--mp-indigo))"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="saidas"
                      name="Saídas"
                      fill="hsl(var(--mp-violet))"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-hairline-soft pt-4 tablet:grid-cols-4">
                <FlowStat label="Entradas" value={int(entries.vehicles)} />
                <FlowStat label="Saídas" value={int(exits.vehicles)} />
                <FlowStat
                  label="Passageiros"
                  value={int(entries.passengers)}
                  hint="nas entradas do dia"
                />
                <FlowStat
                  label="Pico de chegada"
                  value={entries.peakHour === null ? "-" : hourLabel(entries.peakHour)}
                  hint={
                    entries.peakHour === null
                      ? undefined
                      : `${int(entries.peakVehicles)} carros nessa hora`
                  }
                />
              </dl>
              {entries.pcd + exits.pcd > 0 && (
                <p className="text-caption-sm text-muted-soft">
                  {int(entries.pcd)} reservas com vaga PCD entre as entradas do dia.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <SectionTitle icon={Building2}>Top unidades ({label})</SectionTitle>
        </CardHeader>
        <CardContent>
          {overview.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : topLocations.length === 0 ? (
            <EmptyState
              title="Sem reservas no período"
              description="O ranking de unidades aparece aqui."
            />
          ) : (
            <div className="overflow-hidden rounded-md border border-hairline bg-canvas">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Unidade</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead className="text-right">Reservas</TableHead>
                    <TableHead className="text-right">Diárias</TableHead>
                    <TableHead className="text-right">Receita</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topLocations.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="text-ink">{l.name}</TableCell>
                      <TableCell className="text-muted">{l.company_name}</TableCell>
                      <TableCell className="text-right tabular-nums">{int(l.bookings)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted">
                        {int(l.vehicle_days)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-ink">
                        {formatBRL(Number(l.revenue))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="mt-3 text-caption-sm text-muted-soft">
            A origem de cada reserva (canal e UTM) fica em{" "}
            <Link
              to="/manager/attribution"
              className="text-mp-indigo underline-offset-2 hover:underline"
            >
              Atribuição
            </Link>
            .
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <SectionTitle icon={CalendarCheck}>Reservas recentes</SectionTitle>
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

function FlowStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-caption text-muted">{label}</dt>
      <dd className="mt-0.5 text-title-md tabular-nums text-ink">{value}</dd>
      {hint && <span className="text-caption-sm text-muted-soft">{hint}</span>}
    </div>
  );
}
