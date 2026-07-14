import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  buildDayAriaLabel,
  formatDayLong,
  monthGrid,
  monthsInRange,
  OCCUPANCY_SCALE,
  occupancyStyle,
  pickTextColor,
} from "./occupancy.logic";

function brDate(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

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
  // Bloquear uma data para de vender naquele dia: pede confirmação. Liberar é direto.
  const [confirmDate, setConfirmDate] = React.useState<string | null>(null);
  const confirmDay = confirmDate ? data[confirmDate] : undefined;

  function handleClick(date: string, d: CalendarDay) {
    if (d.blocked) {
      onToggle(date, true);
      return;
    }
    setConfirmDate(date);
  }

  return (
    <TooltipProvider delayDuration={120}>
      <div className="grid gap-4 tablet:grid-cols-2">
        {months.map(({ year, month }) => (
          <div key={`${year}-${month}`} className="rounded-md border border-hairline p-2">
            <div className="mb-2 px-1 text-body-sm font-medium text-ink">
              {MONTHS[month - 1]} <span className="text-muted">{year}</span>
            </div>
            <div className="grid grid-cols-7 gap-0.5">
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
                        className="flex aspect-square min-h-11 min-w-11 items-center justify-center rounded-sm text-caption text-muted/40"
                      >
                        {day}
                      </div>
                    );
                  }
                  const over = d.count > d.capacity;
                  return (
                    <Tooltip key={i}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          disabled={disabled}
                          aria-pressed={d.blocked}
                          aria-label={buildDayAriaLabel({
                            date,
                            count: d.count,
                            capacity: d.capacity,
                            blocked: d.blocked,
                          })}
                          onClick={() => handleClick(date, d)}
                          style={d.blocked ? undefined : occupancyStyle(d.pct)}
                          className={cn(
                            "flex aspect-square min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-sm leading-none transition hover:ring-2 hover:ring-ink/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-1 disabled:opacity-60",
                            d.blocked &&
                              "bg-badge-cancelled-bg text-badge-cancelled-fg line-through",
                            over && "ring-2 ring-error",
                          )}
                        >
                          <span aria-hidden className="text-caption font-medium tabular-nums">
                            {day}
                          </span>
                          {!d.blocked && (
                            <span aria-hidden className="text-[11px] font-medium tabular-nums">
                              {d.count}
                            </span>
                          )}
                        </button>
                      </TooltipTrigger>
                      {/* Radix abre o tooltip no hover E no foco por teclado. */}
                      <TooltipContent>
                        <div className="flex flex-col gap-1">
                          <span className="font-medium">{brDate(date)}</span>
                          {d.blocked ? (
                            <span className="text-badge-cancelled-fg">Data bloqueada</span>
                          ) : (
                            <div className="flex flex-col gap-0.5 tabular-nums">
                              <span>
                                Hub: <strong>{d.booked}</strong>
                              </span>
                              <span>
                                White-label: <strong>{d.external}</strong>
                              </span>
                              <span className="border-t border-hairline pt-0.5">
                                Total: <strong>{d.count}</strong>/{d.capacity} (
                                {d.capacity > 0 ? Math.round((d.count / d.capacity) * 100) : 0}
                                %){over && <span className="text-error"> · overbooking</span>}
                              </span>
                            </div>
                          )}
                          <span className="text-muted">
                            Clique para {d.blocked ? "liberar" : "bloquear"} as vendas
                          </span>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={confirmDate !== null} onOpenChange={(open) => !open && setConfirmDate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Bloquear vendas em {confirmDate ? formatDayLong(confirmDate) : ""}?
            </DialogTitle>
            <DialogDescription>
              A unidade para de receber reservas nessa data até você liberar de novo. As reservas
              já confirmadas continuam valendo.
              {confirmDay && confirmDay.count > 0 ? (
                <>
                  {" "}
                  Hoje essa data tem {confirmDay.count} de {confirmDay.capacity} vagas ocupadas.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setConfirmDate(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                if (confirmDate) onToggle(confirmDate, false);
                setConfirmDate(null);
              }}
            >
              Bloquear vendas
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}

/** Legenda do calendário: escala de ocupação, overbooking e data bloqueada. */
export function OccupancyLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-caption text-muted">
      <div className="flex items-center gap-2">
        <span>Vazio</span>
        <div className="flex gap-0.5">
          {OCCUPANCY_SCALE.map((step) => (
            <div
              key={step.bg}
              title={step.label}
              className="h-3 w-5 rounded-sm"
              style={{ backgroundColor: step.bg }}
            />
          ))}
        </div>
        <span>Lotado</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="h-4 w-4 rounded-sm ring-2 ring-error"
          style={{
            backgroundColor: OCCUPANCY_SCALE[4].bg,
            color: pickTextColor(OCCUPANCY_SCALE[4].bg),
          }}
        />
        <span>Overbooking</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="flex h-4 w-4 items-center justify-center rounded-sm bg-badge-cancelled-bg text-[9px] leading-none text-badge-cancelled-fg line-through"
        >
          7
        </span>
        <span>Data bloqueada</span>
      </div>
    </div>
  );
}
