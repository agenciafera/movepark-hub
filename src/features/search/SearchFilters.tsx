import * as React from "react";
import { Filter, X } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useAmenityCatalog } from "./useFilterCatalogs";

export type OperatorOption = { slug: string; name: string; count: number };

type Props = {
  hasDestCoords: boolean;
  operator: string[];
  amenities: string[];
  maxDistanceKm: number | null;
  /** Estacionamentos presentes no resultado atual (faceta da Edge), com contagem. */
  operatorOptions: OperatorOption[];
  /** Resultado/facetas ainda carregando — mostra skeleton no lugar das listas. */
  facetsLoading: boolean;
  /** Códigos de amenidade presentes nos resultados atuais — limita o catálogo exibido. */
  availableAmenities: string[];
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
  operatorOptions,
  facetsLoading,
  availableAmenities,
  onOperatorChange,
  onAmenitiesChange,
  onMaxDistanceChange,
  onClearAll,
  activeCount,
}: Props) {
  const amenitiesQ = useAmenityCatalog();

  // Apenas amenidades presentes nos resultados da busca atual
  const filteredCatalog = React.useMemo(() => {
    if (!availableAmenities.length || !amenitiesQ.data) return [];
    return amenitiesQ.data.filter((a) => availableAmenities.includes(a.code));
  }, [availableAmenities, amenitiesQ.data]);

  const amenitiesByCategory = filteredCatalog.reduce<Record<string, typeof filteredCatalog>>(
    (acc, a) => {
      (acc[a.category] ??= []).push(a);
      return acc;
    },
    {},
  );

  // Estacionamento só faz sentido escolher quando há 2+ no resultado.
  const showOperators = facetsLoading || operatorOptions.length > 1;
  // Amenidades: exibe somente se houver dados reais nos resultados (ou enquanto carrega).
  const showAmenities = facetsLoading || filteredCatalog.length > 0;

  return (
    <div className="flex flex-col gap-7 px-1">
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
                  onClick={() => onMaxDistanceChange(active ? null : opt.value)}
                >
                  {opt.label}
                </Button>
              );
            })}
          </div>
        </section>
      )}

      {showOperators && (
        <>
          {hasDestCoords && <Separator />}
          <section className="space-y-3">
            <Label className="text-title-md text-ink">Estacionamento</Label>
            {facetsLoading && operatorOptions.length === 0 ? (
              <div className="space-y-2.5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-6 w-40" />
                ))}
              </div>
            ) : (
              <ul className="space-y-2.5">
                {operatorOptions.map((c) => (
                  <li key={c.slug} className="flex items-center gap-2.5">
                    <Checkbox
                      id={`op-${c.slug}`}
                      checked={operator.includes(c.slug)}
                      onCheckedChange={() => onOperatorChange(toggleIn(operator, c.slug))}
                    />
                    <label
                      htmlFor={`op-${c.slug}`}
                      className="flex flex-1 cursor-pointer items-center gap-2 text-body-sm text-ink"
                    >
                      <span className="flex-1">{c.name}</span>
                      <span className="text-caption-sm text-muted">{c.count}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {showAmenities && (
        <>
          {(hasDestCoords || showOperators) && <Separator />}
          <Accordion type="single" collapsible defaultValue="amenities">
            <AccordionItem value="amenities" className="border-none">
              <AccordionTrigger className="py-0 text-title-md text-ink hover:no-underline">
                Comodidades
              </AccordionTrigger>
              <AccordionContent className="pr-0 pt-3">
                {facetsLoading || amenitiesQ.isLoading ? (
                  <Skeleton className="h-36 w-full" />
                ) : (
                  <div className="space-y-5">
                    {Object.entries(amenitiesByCategory).map(([cat, items]) => (
                      <div key={cat} className="space-y-2.5">
                        <div className="text-caption text-muted">
                          {categoryLabels[cat] ?? cat}
                        </div>
                        <ul className="space-y-2.5">
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
                    ))}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </>
      )}
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
          <SheetClose asChild>
            <Button>
              <X className="h-4 w-4" />
              Fechar
            </Button>
          </SheetClose>
        </div>
      </SheetContent>
    </Sheet>
  );
}
