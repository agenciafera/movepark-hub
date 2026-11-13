import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
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

const SERIE_NOME: Record<string, string> = {
  hub: "Hub",
  wl: "White-label",
  capacity: "Capacidade",
};

/**
 * Ocupação por dia (13/11/2026): os carros no pátio em cada dia do recorte, empilhados por origem,
 * contra a capacidade. Serve ao dashboard do parceiro e ao do Manager. A série vem pronta de
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
            Capacidade
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
            <ComposedChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
                allowDecimals={false}
                tickFormatter={(v: number) => int(v)}
                tick={{ fontSize: 11 }}
                stroke="hsl(var(--muted-soft))"
                width={48}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                formatter={(v: number, name: string) => [
                  name === "capacity" ? `${int(v)} vagas` : `${int(v)} carros`,
                  SERIE_NOME[name] ?? name,
                ]}
                labelFormatter={(d: string) => {
                  const p = points.find((x) => x.date === d);
                  const data = format(dia(d), "d 'de' MMMM", { locale: ptBR });
                  return p?.rate != null ? `${data}, ${pct(p.rate)} ocupado` : data;
                }}
              />
              <Bar
                dataKey="hub"
                stackId="origem"
                fill="hsl(var(--mp-primary))"
                radius={stacked ? undefined : [3, 3, 0, 0]}
                maxBarSize={28}
              />
              {stacked && (
                <Bar
                  dataKey="wl"
                  stackId="origem"
                  fill="hsl(var(--mp-teal))"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={28}
                />
              )}
              {s.hasCapacity && (
                <Line
                  type="stepAfter"
                  dataKey="capacity"
                  stroke="hsl(var(--muted-soft))"
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                  dot={false}
                  activeDot={false}
                />
              )}
            </ComposedChart>
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
