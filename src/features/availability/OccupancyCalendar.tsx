import { cn } from "@/lib/utils";
import { monthGrid, monthsInRange } from "./occupancy.logic";

export type CalendarDay = {
  count: number;
  capacity: number;
  pct: number;
  booked: number;
  external: number;
  blocked: boolean;
};

const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];
const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];

/** Cor de calor: violeta da marca, opacidade cresce com a ocupação. */
function heatStyle(pct: number): React.CSSProperties {
  const alpha = 0.08 + Math.min(Math.max(pct, 0), 1) * 0.84;
  return { backgroundColor: `rgba(93, 95, 239, ${alpha.toFixed(2)})` };
}

export function OccupancyCalendar({
  from,
  to,
  data,
  onToggle,
  disabled,
}: {
  from: string;
  to: string;
  data: Record<string, CalendarDay>;
  onToggle: (date: string, blocked: boolean) => void;
  disabled?: boolean;
}) {
  const months = monthsInRange(from, to);

  return (
    <div className="grid gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
      {months.map(({ year, month }) => (
        <div key={`${year}-${month}`} className="rounded-md border border-hairline p-3">
          <div className="mb-2 text-body-sm font-medium text-ink">
            {MONTHS[month - 1]} <span className="text-muted">{year}</span>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map((w, i) => (
              <div key={i} className="pb-1 text-center text-caption text-muted">
                {w}
              </div>
            ))}
            {monthGrid(year, month)
              .flat()
              .map((date, i) => {
                if (!date) return <div key={i} />;
                const d = data[date];
                const day = Number(date.slice(8, 10));
                if (!d) {
                  // dia fora do intervalo consultado / sem dados
                  return (
                    <div
                      key={i}
                      className="flex aspect-square items-center justify-center rounded-sm text-caption text-muted/40"
                    >
                      {day}
                    </div>
                  );
                }
                const over = d.count > d.capacity;
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={disabled}
                    onClick={() => onToggle(date, d.blocked)}
                    style={d.blocked ? undefined : heatStyle(d.pct)}
                    className={cn(
                      "flex aspect-square flex-col items-center justify-center rounded-sm leading-none transition hover:ring-2 hover:ring-mp-primary/50 disabled:opacity-60",
                      d.blocked
                        ? "bg-badge-cancelled-bg text-badge-cancelled-fg line-through"
                        : d.pct > 0.5
                          ? "text-white"
                          : "text-ink",
                      over && "ring-2 ring-error",
                    )}
                    title={
                      d.blocked
                        ? `${date} — bloqueada (clique para liberar)`
                        : `${date} — hub ${d.booked}${d.external ? ` + WL ${d.external}` : ""} = ${d.count}/${d.capacity} (${Math.round(d.pct * 100)}%) — clique para bloquear`
                    }
                  >
                    <span className="text-caption font-medium tabular-nums">{day}</span>
                    {!d.blocked && (
                      <span className="text-[10px] tabular-nums opacity-80">{d.count}</span>
                    )}
                  </button>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Legenda do mapa de calor (menos → mais ocupação). */
export function OccupancyLegend() {
  return (
    <div className="flex items-center gap-2 text-caption text-muted">
      <span>Menos</span>
      <div className="flex gap-0.5">
        {[0.1, 0.3, 0.5, 0.7, 0.92].map((p) => (
          <div key={p} className="h-3 w-5 rounded-sm" style={heatStyle(p)} />
        ))}
      </div>
      <span>Mais ocupação</span>
    </div>
  );
}
