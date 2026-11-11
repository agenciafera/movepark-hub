import * as React from "react";
import { CaretDown, MagnifyingGlass, SlidersHorizontal, X } from "@phosphor-icons/react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { SOURCE_OPTIONS, type SourceFilter } from "./unifiedBookingRow.logic";

/**
 * Altura compacta dos campos do painel (11/11/2026): o padrão de formulário (56px) fazia três
 * linhas de filtro ocuparem meia tela antes da primeira reserva.
 */
export const COMPACT_FIELD = "h-10 px-3 text-body-sm";

export function FilterSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  // Valor que veio no link e não existe mais nas opções (adicional renomeado) continua no select,
  // para a tela não mentir sobre o filtro aplicado.
  const opts = options.some((o) => o.value === value)
    ? options
    : [...options, { value, label: value }];
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className={COMPACT_FIELD}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {opts.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Bloco de filtros com título, para agrupar o que é do mesmo assunto. */
export function FilterGroup({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className={cn("flex min-w-0 flex-col gap-2", className)}>
      <legend className="mb-2 text-caption-sm font-semibold text-ink">{title}</legend>
      {children}
    </fieldset>
  );
}

/** Hub ou white-label: o recorte que mais muda a lista, por isso fica ao lado da busca. */
function SourceToggle({
  value,
  onChange,
}: {
  value: SourceFilter;
  onChange: (v: SourceFilter) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Origem da reserva"
      className="flex h-12 shrink-0 rounded-sm border border-hairline bg-surface-soft p-1"
    >
      {SOURCE_OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 whitespace-nowrap rounded-[6px] px-4 text-body-sm font-semibold transition-colors",
            o.value === value ? "bg-canvas text-ink shadow-tier" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Painel de filtros da lista de reservas, igual no Manager e no Operator (11/11/2026).
 *
 * Três andares: a busca sozinha no topo (é o que se usa no balcão), com a origem Hub/white-label
 * ao lado; os filtros do dia a dia; e "Mais filtros", fechado, com o que se usa de vez em quando.
 * "Mais filtros" abre sozinho quando o link já traz algum deles, para o filtro aplicado não ficar
 * escondido.
 */
export function BookingFiltersPanel({
  search,
  onSearch,
  searchPlaceholder,
  source,
  onSource,
  primary,
  primaryClassName,
  more,
  moreActive,
  canClear,
  onClear,
}: {
  search: string;
  onSearch: (v: string) => void;
  searchPlaceholder: string;
  /** Sem `source`, a origem não aparece (estacionamento sem white-label). */
  source?: SourceFilter;
  onSource?: (v: SourceFilter) => void;
  primary: React.ReactNode;
  primaryClassName?: string;
  more: React.ReactNode;
  moreActive: number;
  canClear: boolean;
  onClear: () => void;
}) {
  const [open, setOpen] = React.useState(moreActive > 0);
  const moreId = React.useId();

  return (
    <Card>
      <CardContent className="flex flex-col gap-5 p-5">
        <div className="flex flex-col gap-3 tablet:flex-row">
          <div className="relative min-w-0 flex-1">
            <Label htmlFor="search" className="sr-only">
              Busca
            </Label>
            <MagnifyingGlass
              aria-hidden
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
            />
            <Input
              id="search"
              type="search"
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              className="h-12 pl-11"
            />
          </div>
          {source !== undefined && onSource && <SourceToggle value={source} onChange={onSource} />}
        </div>

        <div className={cn("grid grid-cols-2 gap-3", primaryClassName)}>{primary}</div>

        {open && (
          <div id={moreId} className="border-t border-hairline pt-4">
            {more}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="px-2 no-underline"
            aria-expanded={open}
            aria-controls={moreId}
            onClick={() => setOpen((v) => !v)}
          >
            <SlidersHorizontal />
            {open ? "Menos filtros" : "Mais filtros"}
            {moreActive > 0 && (
              <span className="rounded-full bg-mp-primary px-1.5 text-caption-sm font-semibold tabular-nums text-white">
                {moreActive}
              </span>
            )}
            <CaretDown className={cn("transition-transform", open && "rotate-180")} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="px-2 no-underline"
            onClick={onClear}
            disabled={!canClear}
          >
            <X />
            Limpar filtros
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
