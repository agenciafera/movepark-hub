import * as React from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { TIME_SLOTS, fmtTime, mergeRange, setTime } from "./DateRangePicker.logic";

type Props = {
  from: Date | null;
  to: Date | null;
  onChange: (from: Date | null, to: Date | null) => void;
  triggerClassName?: string;
};

const startOfToday = () => new Date(new Date().toDateString());

/**
 * Seletor de datas em intervalo (range) da busca. Mantém os dois campos (Check-in / Check-out)
 * mas com UM calendário `mode="range"`: após escolher o check-in, o próximo clique já é o
 * check-out (comportamento nativo do react-day-picker), com o intervalo destacado. Os horários
 * de cada ponta são editáveis abaixo do calendário.
 */
export function DateRangePicker({ from, to, onChange, triggerClassName }: Props) {
  const [open, setOpen] = React.useState(false);
  const range: DateRange | undefined = from ? { from, to: to ?? undefined } : undefined;

  function handleSelect(next: DateRange | undefined) {
    const merged = mergeRange({ from, to }, next);
    onChange(merged.from, merged.to);
  }

  const cellBase =
    "flex h-full w-full flex-col items-start justify-center gap-0.5 rounded-full px-6 text-left transition-colors hover:bg-surface-soft";
  const value = (d: Date | null) =>
    d ? format(d, "dd MMM · HH:mm", { locale: ptBR }) : "Adicionar data";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="flex w-full flex-col tablet:flex-row">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={cn(cellBase, "min-w-0 flex-1", triggerClassName)}
          >
            <span className="text-caption font-medium text-ink">Check-in</span>
            <span className="line-clamp-1 text-body-sm text-muted">{value(from)}</span>
          </button>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={cn(
              cellBase,
              "min-w-0 flex-1 border-t border-hairline tablet:border-l tablet:border-t-0",
              triggerClassName,
            )}
          >
            <span className="text-caption font-medium text-ink">Check-out</span>
            <span className="line-clamp-1 text-body-sm text-muted">{value(to)}</span>
          </button>
        </div>
      </PopoverAnchor>

      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="range"
          selected={range}
          onSelect={handleSelect}
          disabled={{ before: startOfToday() }}
          defaultMonth={from ?? new Date()}
        />
        <div className="flex items-end gap-3 border-t border-hairline p-4">
          <div className="flex-1">
            <Label className="mb-2 block">Check-in</Label>
            <Select
              value={fmtTime(from, "08:00")}
              onValueChange={(t) => from && onChange(setTime(from, t), to)}
              disabled={!from}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {TIME_SLOTS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1">
            <Label className="mb-2 block">Check-out</Label>
            <Select
              value={fmtTime(to, "18:00")}
              onValueChange={(t) => to && onChange(from, setTime(to, t))}
              disabled={!to}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {TIME_SLOTS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end border-t border-hairline p-3">
          <Button type="button" size="sm" onClick={() => setOpen(false)} disabled={!from || !to}>
            Aplicar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
