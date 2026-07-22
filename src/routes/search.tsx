import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Inbox } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ResultsHeader } from "@/features/search/ResultsHeader";
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
import { ResultCard } from "@/features/search/ResultCard";
import { isTypeDescriptorAmenity } from "@/features/search/amenities.logic";

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
  const point = params.get("point") ?? undefined;

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
      point,
      from: dates.from,
      to: dates.to,
      vehicle,
      sort,
      category: category.length ? category : undefined,
      amenities: amenities.length ? amenities : undefined,
      max_distance_km: maxDistanceKm ?? undefined,
      limit: 50,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dest,
    point,
    dates.from,
    dates.to,
    vehicle,
    sort,
    category.join(","),
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
  // refina dentro do destino escolhido: tipo de vaga, distância e comodidades. Filtro por
  // estacionamento (marca) saiu na E2.1.3.
  const activeCount = amenities.length + (maxDistanceKm ? 1 : 0) + category.length;

  const hasDestCoords = !!data?.destination;

  // Códigos de amenidade presentes nos resultados atuais — limita o catálogo exibido na sidebar. Os
  // descritores de tipo (Coberto, Valet…) ficam de fora: viraram o filtro "Tipo de vaga" (E2.1.3).
  const availableAmenities = React.useMemo(() => {
    if (!data?.results) return [];
    const codes = new Set<string>();
    for (const r of data.results) {
      for (const code of r.amenities) {
        if (!isTypeDescriptorAmenity(code)) codes.add(code);
      }
    }
    return Array.from(codes);
  }, [data?.results]);

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-6 desktop:px-8">
      <Helmet>
        <title>{searchTitle}</title>
        <meta name="description" content={searchDesc} />
      </Helmet>

      {/* A barra de busca vive no header (ConsumerTopbar), sticky e persistente no scroll. */}
      <ResultsHeader
        data={data}
        isLoading={isLoading}
        from={fromDate}
        to={toDate}
        datesAreEstimate={dates.isEstimate}
        sort={sort}
        onSortChange={(s) => patch({ sort: s })}
        hasDestCoords={hasDestCoords}
      />

      {/* Botão de filtros do mobile (a sidebar cobre o desktop). Os tipos de vaga, que ficavam em
          pills no topo, foram para dentro dos filtros na E2.1.3. */}
      <div className="mt-6 flex justify-end desktop:hidden">
        <SearchFiltersSheet
          hasDestCoords={hasDestCoords}
          category={category}
          amenities={amenities}
          maxDistanceKm={maxDistanceKm}
          facetsLoading={isLoading}
          availableAmenities={availableAmenities}
          onCategoryChange={(next) => patch({ category: toCsv(next) })}
          onAmenitiesChange={(next) => patch({ amenities: toCsv(next) })}
          onMaxDistanceChange={(km) =>
            patch({ max_distance_km: km == null ? null : String(km) })
          }
          onClearAll={() =>
            patch({
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
          category={category}
          amenities={amenities}
          maxDistanceKm={maxDistanceKm}
          facetsLoading={isLoading}
          availableAmenities={availableAmenities}
          onCategoryChange={(next) => patch({ category: toCsv(next) })}
          onAmenitiesChange={(next) => patch({ amenities: toCsv(next) })}
          onMaxDistanceChange={(km) =>
            patch({ max_distance_km: km == null ? null : String(km) })
          }
          onClearAll={() =>
            patch({
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
                <Skeleton key={i} className="h-72 w-full rounded-2xl" />
              ))}
            </div>
          )}

          {!isLoading && !error && data && data.results.length === 0 && (
            <EmptyState
              icon={<Inbox className="h-10 w-10" />}
              title="Nenhuma vaga pra esse período"
              description={
                activeCount > 0
                  ? "Nenhuma vaga com esses filtros. Tente ampliar os critérios ou limpe os filtros."
                  : "Tente outras datas próximas ou um destino diferente."
              }
              action={
                activeCount > 0 ? (
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
                ) : undefined
              }
            />
          )}

          {/* Um card por tipo de vaga: a Edge já pagina por location_parking_type, então o número
              de cards bate com o contador de vagas (E2.1.3). */}
          {!isLoading && data && data.results.length > 0 && (
            <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
              {data.results.map((r) => (
                <ResultCard
                  key={r.id}
                  item={r}
                  isSaved={saved.isSaved(r.id)}
                  onToggleSave={() => saved.toggle(r.id)}
                  searchParams={params}
                  source="search"
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
