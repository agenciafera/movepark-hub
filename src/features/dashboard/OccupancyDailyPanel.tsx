import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Panel } from "@/components/shared/Panel";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { occupancySummary, type OccupancyDayPoint } from "./dashboardMetrics.logic";

const int = (n: number) => n.toLocaleString("pt-BR");
const pct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;
const dia = (d: string) => new Date(`${d}T12:00:00`);

const SERIE: Record<string, { nome: string; carros: "hub" | "wl" }> = {
  hubPct: { nome: "Hub", carros: "hub" },
  wlPct: { nome: "White-label", carros: "wl" },
};

/**
 * Ocupação por dia (13/11/2026): no mesmo formato do gráfico de receita por dia, uma área por dia
 * com a taxa de ocupação, Hub e site empilhados nas cores da receita, e a linha tracejada dos 100%
 * marcando a capacidade. Serve ao dashboard do parceiro e ao do Manager. A série vem pronta de
 * `occupancyDaySeries`; `stacked` diz se a tela mostra as duas origens (com legenda) ou uma só.
 */
export function OccupancyDailyPanel({
  points,
  isLoading,
  rangeLabel,
  stacked,
}: {
  points: OccupancyDayPoint[];
  isLoading: boolean;
  rangeLabel: string;
  stacked: boolean;
}) {
  const s = occupancySummary(points);

  return (
    <Panel className="flex flex-col" data-testid="ocupacao-por-dia">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-title-md text-ink">
            Ocupação por dia, <span className="text-mp-primary">{rangeLabel}</span>
          </div>
          {!isLoading && s.hasCapacity && (
            <p className="mt-1.5 text-body-sm text-muted" data-testid="ocupacao-media">
              {pct(s.rate)} de ocupação média, {int(s.perDay.occupied)} de{" "}
              {int(s.perDay.capacity)} vagas por dia
            </p>
          )}
        </div>
        {!isLoading && s.peak && (
          <div className="shrink-0 text-right" data-testid="ocupacao-pico">
            <div className="text-caption text-muted">Dia mais cheio</div>
            <div className="text-display-sm tabular-nums text-mp-primary">{pct(s.peak.rate)}</div>
            <div className="text-caption-sm text-muted-soft">
              {format(dia(s.peak.date), "d 'de' MMM", { locale: ptBR })}
            </div>
          </div>
        )}
      </div>

      {stacked && !isLoading && s.hasCars && (
        <div className="mt-4 flex flex-wrap gap-4 text-caption text-muted" aria-hidden>
          <Legenda cor="hsl(var(--mp-primary))">Hub</Legenda>
          <Legenda cor="hsl(var(--mp-teal))">White-label</Legenda>
          <Legenda cor="hsl(var(--muted-soft))" tracejado>
            Capacidade (100%)
          </Legenda>
        </div>
      )}

      {/* Sem flex-1: o painel ocupa a linha sozinho, e numa coluna flex sem altura o flex-1 zera a
          base e ignora o h-[240px] (o gráfico sumia em produção, 13/11/2026). */}
      <div className="mt-5 h-[240px] shrink-0">
        {isLoading ? (
          <Skeleton className="h-full w-full" />
        ) : !s.hasCapacity && !s.hasCars ? (
          <EmptyState
            title="Sem capacidade cadastrada"
            description="Cadastre as vagas da unidade para ver a ocupação dia a dia."
          />
        ) : !s.hasCars ? (
          <EmptyState
            title="Nenhum carro no pátio no período"
            description="Os dias aparecem aqui assim que entrar reserva paga."
          />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="ocupacao-hub" x1="0" y1="0" x2="0" y2="1">
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
                tickFormatter={(d: string) => format(dia(d), "dd MMM", { locale: ptBR })}
                tick={{ fontSize: 11 }}
                stroke="hsl(var(--muted-soft))"
                minTickGap={32}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                domain={[0, (max: number) => Math.max(100, Math.ceil(max / 10) * 10)]}
                tickFormatter={(v: number) => pct(v)}
                tick={{ fontSize: 11 }}
                stroke="hsl(var(--muted-soft))"
                width={48}
                tickLine={false}
                axisLine={false}
              />
              <ReferenceLine
                y={100}
                stroke="hsl(var(--muted-soft))"
                strokeDasharray="5 4"
                strokeWidth={1.5}
              />
              <Tooltip
                formatter={(v: number, key: string, item: { payload?: OccupancyDayPoint }) => {
                  const serie = SERIE[key];
                  const carros = item.payload && serie ? item.payload[serie.carros] : 0;
                  return [`${int(carros)} carros (${pct(v)})`, serie?.nome ?? key];
                }}
                labelFormatter={(d: string) => {
                  const p = points.find((x) => x.date === d);
                  const data = format(dia(d), "d 'de' MMMM", { locale: ptBR });
                  return p?.rate != null
                    ? `${data}: ${pct(p.rate)} ocupado, ${int(p.total)} de ${int(p.capacity)} vagas`
                    : data;
                }}
              />
              <Area
                type="monotone"
                dataKey="hubPct"
                stackId="origem"
                stroke="hsl(var(--mp-primary))"
                strokeWidth={2.5}
                fill="url(#ocupacao-hub)"
                dot={{ r: 3, fill: "hsl(var(--canvas))", strokeWidth: 2 }}
                activeDot={{ r: 5 }}
                connectNulls
              />
              {stacked && (
                <Area
                  type="monotone"
                  dataKey="wlPct"
                  stackId="origem"
                  stroke="hsl(var(--mp-navy))"
                  strokeWidth={2}
                  fill="hsl(var(--mp-teal))"
                  fillOpacity={0.45}
                  dot={false}
                  activeDot={{ r: 4 }}
                  connectNulls
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Panel>
  );
}

function Legenda({
  cor,
  tracejado,
  children,
}: {
  cor: string;
  tracejado?: boolean;
  children: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {tracejado ? (
        <span className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: cor }} />
      ) : (
        <span className="h-2.5 w-2.5 rounded-xs" style={{ background: cor }} />
      )}
      {children}
    </span>
  );
}
