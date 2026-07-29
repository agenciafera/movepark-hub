import * as React from "react";
import { subDays } from "date-fns";
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

/** Uma opção da coluna de atalhos. */
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
 * Seletor de período do Manager: atalhos (hoje, semana, mês, ano) numa coluna e o
 * calendário sempre à vista, já marcando o recorte atual. Clicar num dia sai do
 * atalho e vira intervalo escolhido à mão: primeiro clique abre, segundo fecha.
 *
 * A largura é fixa de propósito. Com `w-auto`, a fila de opções de comparação
 * esticava o popover pra mais de 700px e sobrava um vão enorme ao lado dos
 * atalhos.
 */
export function PeriodPicker({ value, onChange, showCompare = true, className }: Props) {
  const [open, setOpen] = React.useState(false);
  // A ponta em aberto mora num ref, e o state existe só pra redesenhar. Dois cliques
  // no mesmo tick (clique duplo numa data) leem o state antigo e abriam dois
  // intervalos em vez de abrir e fechar um.
  const pendingRef = React.useRef<Date | null>(null);
  const [pendingStart, setPendingStart] = React.useState<Date | null>(null);
  const setPending = React.useCallback((d: Date | null) => {
    pendingRef.current = d;
    setPendingStart(d);
  }, []);
  const range = resolvePeriod(value);
  const compare = resolveCompare(value, range);

  // O calendário acompanha o recorte, ancorado no FIM: quase todo atalho termina hoje,
  // então abrir no mês final mostra a parte viva do intervalo. Ancorado no início,
  // "últimos 30 dias" abria no mês passado e o intervalo quase todo ficava fora da vista.
  const anchor = toDayString(subDays(range.to, 1));
  const [month, setMonth] = React.useState(range.from);
  React.useEffect(() => {
    const [y, m, d] = anchor.split("-").map(Number);
    setMonth(new Date(y, m - 1, d));
  }, [anchor]);

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
    setPending(null);
    if (preset === "custom") {
      // Sem datas ainda, "Personalizado" herda o recorte atual em vez de zerar.
      onChange({
        ...value,
        preset,
        customFrom: value.customFrom ?? toDayString(range.from),
        customTo: value.customTo ?? toDayString(subDays(range.to, 1)),
      });
      return;
    }
    onChange({ ...value, preset });
  }

  /** Primeiro clique abre o intervalo, o segundo fecha. Ordem invertida se endireita. */
  function handleDayClick(day: Date) {
    const start = pendingRef.current;
    if (!start) {
      setPending(day);
      onChange({
        ...value,
        preset: "custom",
        customFrom: toDayString(day),
        customTo: toDayString(day),
      });
      return;
    }
    const [from, to] = start <= day ? [start, day] : [day, start];
    setPending(null);
    onChange({
      ...value,
      preset: "custom",
      customFrom: toDayString(from),
      customTo: toDayString(to),
    });
  }

  function pickCompare(next: ComparePreset) {
    onChange({ ...value, compare: next });
  }

  // A ponta final é exclusiva por dentro; no calendário mostramos o dia que a
  // pessoa escolheu. Enquanto o intervalo está aberto, só a ponta inicial fica marcada.
  const shown: DateRange = pendingStart
    ? { from: pendingStart, to: undefined }
    : { from: range.from, to: subDays(range.to, 1) };

  const compareRange: DateRange | undefined = parse(value.compareFrom)
    ? { from: parse(value.compareFrom), to: parse(value.compareTo) }
    : undefined;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) setPending(null);
        setOpen(next);
      }}
    >
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

      {/* `available-height` + rolagem: quando não cabe abaixo do gatilho, a Radix
          vira o popover pra cima, e sem o teto ele saía cortado no topo da tela. */}
      <PopoverContent
        align="end"
        collisionPadding={16}
        className="max-h-[var(--radix-popover-content-available-height)] w-[min(calc(100vw-2rem),34rem)] overflow-y-auto p-0"
      >
        <div className="flex flex-col tablet:flex-row">
          <div className="max-h-[220px] overflow-y-auto border-b border-hairline p-2 tablet:max-h-[336px] tablet:w-48 tablet:shrink-0 tablet:border-b-0 tablet:border-r">
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

          <div className="flex min-w-0 flex-1 justify-center">
            <Calendar
              mode="range"
              selected={shown}
              month={month}
              onMonthChange={setMonth}
              onDayClick={handleDayClick}
            />
          </div>
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
              <div className="flex justify-center">
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
              </div>
            )}
            {compare && (
              <p className="text-caption-sm text-muted-soft">
                {compareLabel(value, compare)}: {formatRangeLabel(compare)}
              </p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-hairline p-3">
          <span className="text-caption-sm text-muted-soft">{formatRangeLabel(range)}</span>
          <Button type="button" size="sm" onClick={() => setOpen(false)}>
            Aplicar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
