import * as React from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  TIME_SLOTS,
  fmtTime,
  isTimeSlotPast,
  nextFutureTime,
  setTime,
} from "./DateRangePicker.logic";

type Mode = "check-in" | "check-out";

type Props = {
  mode: Mode;
  date: Date | null;
  onChange: (date: Date) => void;
  /** Quando definido, bloqueia datas antes desse limite (usado pro check-out). */
  minDate?: Date;
  triggerClassName?: string;
};

export function DateRangeField({ mode, date, onChange, minDate, triggerClassName }: Props) {
  const [open, setOpen] = React.useState(false);
  const label = mode === "check-in" ? "Check-in" : "Check-out";

  function handleDay(day: Date | undefined) {
    if (!day) return;
    const desired = date ? fmtTime(date) : mode === "check-in" ? "08:00" : "18:00";
    // Se o dia é hoje e o horário já passou, avança pro próximo slot futuro (entrada não retroativa).
    onChange(setTime(day, nextFutureTime(day, desired)));
  }

  function handleTime(hhmm: string) {
    const base = date ?? new Date();
    onChange(setTime(base, hhmm));
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-full w-full flex-col items-start justify-center gap-0.5 rounded-full px-6 text-left transition-colors hover:bg-surface-soft",
            triggerClassName,
          )}
        >
          <span className="text-caption font-medium text-ink">{label}</span>
          <span className="line-clamp-1 text-body-sm text-muted">
            {date
              ? format(date, "dd MMM · HH:mm", { locale: ptBR })
              : "Adicionar data"}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <div className="flex flex-col tablet:flex-row">
          <Calendar
            mode="single"
            selected={date ?? undefined}
            onSelect={handleDay}
            disabled={(d) => (minDate ? d < new Date(minDate.toDateString()) : d < new Date(new Date().toDateString()))}
            defaultMonth={date ?? minDate ?? new Date()}
          />
          <div className="border-l border-hairline p-4 tablet:w-44">
            <Label htmlFor="time-select" className="mb-2 block">Horário</Label>
            <Select value={fmtTime(date)} onValueChange={handleTime}>
              <SelectTrigger id="time-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {TIME_SLOTS.map((t) => (
                  <SelectItem key={t} value={t} disabled={!!date && isTimeSlotPast(date, t)}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
