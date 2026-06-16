import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Inbox } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { CategoryPills } from "@/features/search/CategoryPills";
import { ResultCard } from "@/features/search/ResultCard";
import { ResultsHeader } from "@/features/search/ResultsHeader";
import { SearchBarPill } from "@/features/search/SearchBarPill";
import {
  SearchFiltersSheet,
  SearchFiltersSidebar,
} from "@/features/search/SearchFilters";
import {
  useSearchResults,
  type SearchFilters,
  type SearchSort,
  type SearchVehicle,
} from "@/features/search/useSearchResults";
import { computeResultBadges } from "@/features/search/searchBadges";
import { resolveSearchDates } from "@/features/search/dates";
import { useSavedListings } from "@/features/search/useSavedListings";

function parseCsv(value: string | null): string[] {
  if (!value) return [];
  return value.split(",").filter(Boolean);
}

function toCsv(arr: string[]): string | null {
  return arr.length ? arr.join(",") : null;
}

export default function SearchResultsPage() {
  const [params, setParams] = useSearchParams();
  const saved = useSavedListings();

  const dest = params.get("dest") ?? undefined;

  const searchTitle = dest
    ? `Estacionamentos em ${dest} | Movepark`
    : "Busca de Estacionamentos | Movepark";
  const searchDesc = dest
    ? `Veja e reserve estacionamentos próximos a ${dest}. Coberto, descoberto, valet e mais.`
    : "Busque e compare estacionamentos nos melhores destinos do Brasil.";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const vehicle = (params.get("vehicle") as SearchVehicle | null) ?? "car";
  const sort = (params.get("sort") as SearchSort | null) ?? "price_asc";
  const category = parseCsv(params.get("category"));
  const operator = parseCsv(params.get("operator"));
  const amenities = parseCsv(params.get("amenities"));
  const maxDistanceRaw = params.get("max_distance_km");
  const maxDistanceKm = maxDistanceRaw ? Number(maxDistanceRaw) : null;

  // Datas: usa as da URL; sem elas (link de destino/categoria) cai num período
  // padrão (estimativa) pra já listar as vagas em vez de bloquear a tela.
  const [now] = React.useState(() => new Date());
  const dates = React.useMemo(() => resolveSearchDates(from, to, now), [from, to, now]);
  const fromDate = new Date(dates.from);
  const toDate = new Date(dates.to);

  const filters: SearchFilters = React.useMemo(() => {
    return {
      dest,
      from: dates.from,
      to: dates.to,
      vehicle,
      sort,
      category: category.length ? category : undefined,
      operator: operator.length ? operator : undefined,
      amenities: amenities.length ? amenities : undefined,
      max_distance_km: maxDistanceKm ?? undefined,
      limit: 50,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dest,
    dates.from,
    dates.to,
    vehicle,
    sort,
    category.join(","),
    operator.join(","),
    amenities.join(","),
    maxDistanceKm,
  ]);

  const { data, isLoading, error } = useSearchResults(filters);

  function patch(updates: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(updates)) {
      if (v == null) next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: false });
  }

  // Destino é o ESCOPO da busca (combobox no topo), não um filtro de barra lateral. A sidebar só
  // refina dentro do destino escolhido: operadora, distância, comodidades, categoria.
  const activeCount =
    operator.length +
    amenities.length +
    (maxDistanceKm ? 1 : 0) +
    category.length;

  const hasDestCoords = !!data?.destination;
  const operatorOptions = data?.facets?.operators ?? [];

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-6 desktop:px-8">
      <Helmet>
        <title>{searchTitle}</title>
        <meta name="description" content={searchDesc} />
      </Helmet>

      {/* Mesma barra de busca da home, reaproveitada e semeada com a busca atual. Editar
          destino/datas/veículo acontece aqui (re-busca), sem voltar pra home. O `key` força
          re-seed quando o escopo da URL muda. */}
      <SearchBarPill
        variant="compact"
        className="mb-6 max-w-none"
        key={`${dest ?? ""}|${from}|${to}|${vehicle}`}
        initialDest={dest ?? null}
        initialFrom={fromDate}
        initialTo={toDate}
        initialVehicle={vehicle}
        preserveParams
      />

      <ResultsHeader
        data={data}
        isLoading={isLoading}
        from={fromDate}
        to={toDate}
        datesAreEstimate={dates.isEstimate}
        sort={sort}
        onSortChange={(s) => patch({ sort: s })}
      />

      <div className="mt-6 flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <CategoryPills
            selected={category}
            onToggle={(code) => {
              const next = category.includes(code)
                ? category.filter((c) => c !== code)
                : [...category, code];
              patch({ category: toCsv(next) });
            }}
          />
        </div>
        <SearchFiltersSheet
          hasDestCoords={hasDestCoords}
          operator={operator}
          amenities={amenities}
          maxDistanceKm={maxDistanceKm}
          operatorOptions={operatorOptions}
          facetsLoading={isLoading}
          onOperatorChange={(next) => patch({ operator: toCsv(next) })}
          onAmenitiesChange={(next) => patch({ amenities: toCsv(next) })}
          onMaxDistanceChange={(km) =>
            patch({ max_distance_km: km == null ? null : String(km) })
          }
          onClearAll={() =>
            patch({
              operator: null,
              amenities: null,
              max_distance_km: null,
              category: null,
            })
          }
          activeCount={activeCount}
        />
      </div>

      <div className="mt-6 flex gap-8">
        <SearchFiltersSidebar
          hasDestCoords={hasDestCoords}
          operator={operator}
          amenities={amenities}
          maxDistanceKm={maxDistanceKm}
          operatorOptions={operatorOptions}
          facetsLoading={isLoading}
          onOperatorChange={(next) => patch({ operator: toCsv(next) })}
          onAmenitiesChange={(next) => patch({ amenities: toCsv(next) })}
          onMaxDistanceChange={(km) =>
            patch({ max_distance_km: km == null ? null : String(km) })
          }
          onClearAll={() =>
            patch({
              operator: null,
              amenities: null,
              max_distance_km: null,
              category: null,
            })
          }
          activeCount={activeCount}
        />

        <section className="min-w-0 flex-1">
          {error && (
            <div className="rounded-md border border-error bg-badge-cancelled-bg p-4 text-body-sm text-error">
              Não conseguimos buscar agora. {(error as Error).message}
            </div>
          )}

          {isLoading && (
            <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-72 w-full rounded-md" />
              ))}
            </div>
          )}

          {!isLoading && !error && data && data.results.length === 0 && (
            <EmptyState
              icon={<Inbox className="h-10 w-10" />}
              title="Nenhuma vaga pra esse período"
              description="Tente outras datas próximas ou limpe os filtros aplicados."
              action={
                <Button
                  onClick={() =>
                    patch({
                      operator: null,
                      amenities: null,
                      max_distance_km: null,
                      category: null,
                    })
                  }
                >
                  Limpar filtros
                </Button>
              }
            />
          )}

          {!isLoading && data && data.results.length > 0 && (
            <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
              {data.results.map((r) => (
                <ResultCard
                  key={r.id}
                  item={r}
                  isSaved={saved.isSaved(r.id)}
                  onToggleSave={() => saved.toggle(r.id)}
                  searchParams={params}
                  badges={computeResultBadges(r, data.results)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
