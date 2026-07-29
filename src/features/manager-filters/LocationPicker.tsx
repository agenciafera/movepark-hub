import * as React from "react";
import { Building2, Check, ChevronDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useManagerLocations } from "@/features/locations/api";
import {
  groupLocations,
  locationsLabel,
  pruneLocations,
  toggleLocation,
} from "./managerFilters.logic";

type Props = {
  value: string[];
  onChange: (next: string[]) => void;
  className?: string;
};

/**
 * Seletor de unidade do Manager. Nenhuma marcada quer dizer todas, que é como o
 * painel abre: o consolidado da rede. A lista vem agrupada por empresa, com busca,
 * porque a rede cresce e rolar uma lista corrida de unidade fica inviável.
 */
export function LocationPicker({ value, onChange, className }: Props) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const { data, isLoading } = useManagerLocations();
  const options = React.useMemo(() => data ?? [], [data]);
  const groups = React.useMemo(() => groupLocations(options, search), [options, search]);

  // Unidade apagada some da lista; tirar da seleção evita filtrar tudo pra zero
  // sem nada marcado na tela pra explicar.
  React.useEffect(() => {
    if (!options.length) return;
    const pruned = pruneLocations(value, options);
    if (pruned !== value) onChange(pruned);
  }, [options, value, onChange]);

  const selectedCount = value.length;

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
          <Building2 className="h-4 w-4 shrink-0 text-mp-indigo" aria-hidden />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-body-sm font-medium text-ink">
              {locationsLabel(value, options)}
            </span>
            <span className="truncate text-caption-sm text-muted">
              {selectedCount === 0 ? "toda a rede" : "recorte aplicado"}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted" aria-hidden />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        collisionPadding={16}
        className="max-h-[var(--radix-popover-content-available-height)] w-[320px] max-w-[calc(100vw-2rem)] overflow-y-auto p-0"
      >
        <div className="border-b border-hairline p-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar unidade ou empresa"
              aria-label="Buscar unidade ou empresa"
              className="h-10 pl-9"
            />
          </div>
        </div>

        <div className="max-h-[300px] overflow-y-auto p-2">
          <button
            type="button"
            onClick={() => onChange([])}
            aria-pressed={selectedCount === 0}
            className={cn(
              "flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-body-sm transition-colors",
              selectedCount === 0
                ? "bg-mp-pale font-medium text-mp-indigo"
                : "text-body hover:bg-surface-soft",
            )}
          >
            Todas as unidades
            {selectedCount === 0 && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />}
          </button>

          {isLoading ? (
            <div className="space-y-2 p-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : groups.length === 0 ? (
            <p className="px-3 py-6 text-center text-body-sm text-muted">
              Nenhuma unidade com esse nome.
            </p>
          ) : (
            groups.map((g) => (
              <div key={g.companyName} className="mt-1">
                <p className="px-3 py-1.5 text-caption-sm text-muted-soft">{g.companyName}</p>
                {g.locations.map((l) => {
                  const active = value.includes(l.id);
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => onChange(toggleLocation(value, l.id))}
                      aria-pressed={active}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-body-sm transition-colors",
                        active
                          ? "bg-mp-pale font-medium text-mp-indigo"
                          : "text-body hover:bg-surface-soft",
                      )}
                    >
                      <span className="truncate">{l.name}</span>
                      {active && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between border-t border-hairline p-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange([])}
            disabled={selectedCount === 0}
          >
            Limpar
          </Button>
          <Button type="button" size="sm" onClick={() => setOpen(false)}>
            Aplicar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
