import * as React from "react";
import type { DateRange } from "react-day-picker";
import { CalendarDays, Check, ChevronDown } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { PeriodState, PeriodPreset, ComparePreset } from "./managerFilters.logic";
import {
  COMPARE_OPTIONS,
  PERIOD_OPTIONS,
  compareLabel,
  formatRangeLabel,
  periodLabel,
  resolveCompare,
  resolvePeriod,
  toDayString,
} from "./managerFilters.logic";

type Props = {
  value: PeriodState;
  onChange: (next: PeriodState) => void;
  /** Esconde o bloco de comparação em telas que não comparam (listas, moderação). */
  showCompare?: boolean;
  className?: string;
};

const parse = (iso: string | null): Date | undefined => {
  if (!iso) return undefined;
  const [y, m, d] = iso.split("-").map(Number);
  return y && m && d ? new Date(y, m - 1, d) : undefined;
};

/** Uma opção da coluna de presets. */
function PresetRow({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-body-sm transition-colors",
        active ? "bg-mp-pale font-medium text-mp-indigo" : "text-body hover:bg-surface-soft",
      )}
    >
      {label}
      {active && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />}
    </button>
  );
}

/**
 * Seletor de período do Manager: atalhos (hoje, semana, mês, ano), intervalo
 * escolhido no calendário e com o que comparar. O botão mostra o recorte atual e
 * as datas exatas embaixo, pra ninguém ler um número sem saber de quando ele é.
 */
export function PeriodPicker({ value, onChange, showCompare = true, className }: Props) {
  const [open, setOpen] = React.useState(false);
  const range = resolvePeriod(value);
  const compare = resolveCompare(value, range);

  const groups = React.useMemo(() => {
    const map = new Map<string, typeof PERIOD_OPTIONS>();
    for (const o of PERIOD_OPTIONS) {
      const list = map.get(o.group) ?? [];
      list.push(o);
      map.set(o.group, list);
    }
    return Array.from(map.entries());
  }, []);

  function pickPreset(preset: PeriodPreset) {
    if (preset === "custom") {
      // Abre o calendário já apontando pro recorte atual, em vez de um mês vazio.
      onChange({
        ...value,
        preset,
        customFrom: value.customFrom ?? toDayString(range.from),
        customTo: value.customTo ?? toDayString(new Date(range.to.getTime() - 86400000)),
      });
      return;
    }
    onChange({ ...value, preset });
    setOpen(false);
  }

  function pickCompare(next: ComparePreset) {
    onChange({ ...value, compare: next });
  }

  const customRange: DateRange | undefined = parse(value.customFrom)
    ? { from: parse(value.customFrom), to: parse(value.customTo) }
    : undefined;
  const compareRange: DateRange | undefined = parse(value.compareFrom)
    ? { from: parse(value.compareFrom), to: parse(value.compareTo) }
    : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-11 items-center gap-2.5 rounded-md border border-hairline bg-canvas px-3.5 text-left transition-colors hover:bg-surface-soft",
            className,
          )}
        >
          <CalendarDays className="h-4 w-4 shrink-0 text-mp-indigo" aria-hidden />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-body-sm font-medium text-ink">
              {periodLabel(value, range)}
            </span>
            <span className="truncate text-caption-sm text-muted">{formatRangeLabel(range)}</span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted" aria-hidden />
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-auto max-w-[calc(100vw-2rem)] p-0">
        <div className="flex flex-col tablet:flex-row">
          <div className="max-h-[340px] w-full overflow-y-auto border-b border-hairline p-2 tablet:w-52 tablet:border-b-0 tablet:border-r">
            {groups.map(([group, options]) => (
              <div key={group} className="mb-1">
                <p className="px-3 py-1.5 text-caption-sm text-muted-soft">{group}</p>
                {options.map((o) => (
                  <PresetRow
                    key={o.value}
                    label={o.label}
                    active={value.preset === o.value}
                    onClick={() => pickPreset(o.value)}
                  />
                ))}
              </div>
            ))}
          </div>

          {value.preset === "custom" && (
            <div className="border-b border-hairline tablet:border-b-0">
              <Calendar
                mode="range"
                selected={customRange}
                defaultMonth={customRange?.from ?? range.from}
                onSelect={(r) =>
                  onChange({
                    ...value,
                    preset: "custom",
                    customFrom: r?.from ? toDayString(r.from) : null,
                    customTo: r?.to ? toDayString(r.to) : r?.from ? toDayString(r.from) : null,
                  })
                }
              />
            </div>
          )}
        </div>

        {showCompare && (
          <div className="flex flex-col gap-2 border-t border-hairline p-3">
            <p className="text-caption text-muted">Comparar com</p>
            <div className="flex flex-wrap gap-1.5">
              {COMPARE_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => pickCompare(o.value)}
                  aria-pressed={value.compare === o.value}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-caption transition-colors",
                    value.compare === o.value
                      ? "border-transparent bg-mp-pale font-medium text-mp-indigo"
                      : "border-hairline text-muted hover:bg-surface-soft",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {value.compare === "custom" && (
              <Calendar
                mode="range"
                selected={compareRange}
                defaultMonth={compareRange?.from ?? range.from}
                onSelect={(r) =>
                  onChange({
                    ...value,
                    compareFrom: r?.from ? toDayString(r.from) : null,
                    compareTo: r?.to ? toDayString(r.to) : r?.from ? toDayString(r.from) : null,
                  })
                }
              />
            )}
            {compare && (
              <p className="text-caption-sm text-muted-soft">
                {compareLabel(value, compare)}: {formatRangeLabel(compare)}
              </p>
            )}
          </div>
        )}

        <div className="flex justify-end border-t border-hairline p-3">
          <Button type="button" size="sm" onClick={() => setOpen(false)}>
            Aplicar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
