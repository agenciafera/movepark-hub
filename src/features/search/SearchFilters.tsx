import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useAmenityCatalog, useCompanyOptions } from "./useFilterCatalogs";

type Props = {
  hasDestCoords: boolean;
  operator: string[];
  amenities: string[];
  maxDistanceKm: number | null;
  onOperatorChange: (next: string[]) => void;
  onAmenitiesChange: (next: string[]) => void;
  onMaxDistanceChange: (km: number | null) => void;
  onClearAll: () => void;
  activeCount: number;
};

const distanceOptions = [
  { value: 2, label: "Até 2 km" },
  { value: 5, label: "Até 5 km" },
  { value: 10, label: "Até 10 km" },
  { value: 20, label: "Até 20 km" },
];

const categoryLabels: Record<string, string> = {
  security: "Segurança",
  service: "Serviço",
  access: "Acesso",
  extras: "Extras",
};

function toggleIn(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function FilterContent({
  hasDestCoords,
  operator,
  amenities,
  maxDistanceKm,
  onOperatorChange,
  onAmenitiesChange,
  onMaxDistanceChange,
  onClearAll,
  activeCount,
}: Props) {
  const operatorsQ = useCompanyOptions();
  const amenitiesQ = useAmenityCatalog();

  const amenitiesByCategory = (amenitiesQ.data ?? []).reduce<
    Record<string, typeof amenitiesQ.data extends infer T ? (T extends Array<infer U> ? U[] : never) : never>
  >((acc, a) => {
    (acc[a.category] ??= [] as never).push(a as never);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-6 px-1">
      {activeCount > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-md bg-mp-pale px-3 py-2">
          <span className="text-caption text-mp-indigo">
            {activeCount} {activeCount === 1 ? "filtro ativo" : "filtros ativos"}
          </span>
          <Button size="sm" variant="ghost" onClick={onClearAll}>
            Limpar
          </Button>
        </div>
      )}

      {hasDestCoords && (
        <section className="space-y-3">
          <Label className="text-title-md text-ink">Distância do destino</Label>
          <div className="flex flex-wrap gap-2">
            {distanceOptions.map((opt) => {
              const active = maxDistanceKm === opt.value;
              return (
                <Button
                  key={opt.value}
                  type="button"
                  size="sm"
                  variant={active ? "primary" : "secondary"}
                  onClick={() =>
                    onMaxDistanceChange(active ? null : opt.value)
                  }
                >
                  {opt.label}
                </Button>
              );
            })}
          </div>
        </section>
      )}

      <Separator />

      <section className="space-y-3">
        <Label className="text-title-md text-ink">Operadora</Label>
        {operatorsQ.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-40" />
            ))}
          </div>
        ) : (
          <ul className="space-y-2">
            {operatorsQ.data?.map((c) => (
              <li key={c.slug} className="flex items-center gap-2.5">
                <Checkbox
                  id={`op-${c.slug}`}
                  checked={operator.includes(c.slug)}
                  onCheckedChange={() => onOperatorChange(toggleIn(operator, c.slug))}
                />
                <label
                  htmlFor={`op-${c.slug}`}
                  className="cursor-pointer text-body-sm text-ink"
                >
                  {c.name}
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Separator />

      <section className="space-y-3">
        <Label className="text-title-md text-ink">Comodidades</Label>
        {amenitiesQ.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          Object.entries(amenitiesByCategory).map(([cat, items]) => (
            <div key={cat} className="space-y-2">
              <div className="text-caption text-muted">
                {categoryLabels[cat] ?? cat}
              </div>
              <ul className="space-y-2">
                {items.map((a) => (
                  <li key={a.code} className="flex items-center gap-2.5">
                    <Checkbox
                      id={`am-${a.code}`}
                      checked={amenities.includes(a.code)}
                      onCheckedChange={() =>
                        onAmenitiesChange(toggleIn(amenities, a.code))
                      }
                    />
                    <label
                      htmlFor={`am-${a.code}`}
                      className="cursor-pointer text-body-sm text-ink"
                    >
                      {a.name}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

/** Sidebar desktop com scroll. Em mobile/tablet usa SearchFiltersSheet abaixo. */
export function SearchFiltersSidebar(props: Props) {
  return (
    <aside className="hidden desktop:block">
      <div className="sticky top-24 max-h-[calc(100vh-6rem)] w-72 overflow-y-auto pr-2">
        <FilterContent {...props} />
      </div>
    </aside>
  );
}

/** Botão "Filtros" + bottom sheet — usado em mobile/tablet. */
export function SearchFiltersSheet(props: Props) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="secondary" size="sm" className="desktop:hidden">
          <Filter className="h-4 w-4" />
          Filtros{props.activeCount > 0 ? ` (${props.activeCount})` : ""}
        </Button>
      </SheetTrigger>
      <SheetContent className="desktop:!w-[480px]">
        <SheetHeader>
          <SheetTitle>Filtros</SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
          <FilterContent {...props} />
        </div>
        <div className="flex shrink-0 justify-end border-t border-hairline bg-canvas px-6 py-3">
          <Button asChild>
            <span>
              <X className="h-4 w-4" />
              Fechar
            </span>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
