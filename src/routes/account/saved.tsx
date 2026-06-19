import * as React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Heart, Car } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { useSavedListings } from "@/features/search/useSavedListings";

type SavedListingDetail = {
  id: string;
  operator: { slug: string; name: string };
  location: { slug: string; name: string; address: string | null };
  parking_type: { code: string; name: string };
};

function useSavedListingsDetail(ids: string[]) {
  return useQuery({
    queryKey: ["saved-listings-detail", ids.slice().sort().join(",")],
    queryFn: async (): Promise<SavedListingDetail[]> => {
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("location_parking_type")
        .select(
          `
          id,
          location:location_id (
            slug,
            name,
            address,
            company:company_id ( slug, name )
          ),
          parking_type:parking_type_code ( code, name )
        `,
        )
        .in("id", ids);
      if (error) throw error;
      return (data ?? []).map((row) => {
        const rec = row as unknown as {
          id: string;
          location: {
            slug: string;
            name: string;
            address: string | null;
            company: { slug: string; name: string } | null;
          } | null;
          parking_type: { code: string; name: string } | null;
        };
        return {
          id: rec.id,
          operator: {
            slug: rec.location?.company?.slug ?? "",
            name: rec.location?.company?.name ?? "",
          },
          location: {
            slug: rec.location?.slug ?? "",
            name: rec.location?.name ?? "",
            address: rec.location?.address ?? null,
          },
          parking_type: {
            code: rec.parking_type?.code ?? "",
            name: rec.parking_type?.name ?? "",
          },
        };
      });
    },
    enabled: ids.length > 0,
    staleTime: 60_000,
  });
}

export default function SavedPage() {
  const { ids, toggle } = useSavedListings();
  const idsArray = React.useMemo(() => Array.from(ids), [ids]);
  const detail = useSavedListingsDetail(idsArray);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Favoritos"
        description="Os estacionamentos que você salvou."
      />

      {detail.isLoading && idsArray.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-md" />
          ))}
        </div>
      ) : idsArray.length === 0 || detail.data?.length === 0 ? (
        <EmptyState
          icon={<Heart className="h-10 w-10" />}
          title="Nada salvo por aqui"
          description="Toque no coração nos resultados de busca pra salvar vagas que te interessam."
          action={
            <Link to="/search">
              <Button>Buscar estacionamentos</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {detail.data?.map((item) => {
            const url = `/p/${item.operator.slug}/${item.location.slug}/${item.parking_type.code}`;
            return (
              <article
                key={item.id}
                className="group relative flex flex-col overflow-hidden rounded-md border border-hairline bg-canvas transition-shadow hover:shadow-tier"
              >
                <Link
                  to={url}
                  className="relative block aspect-[4/3] overflow-hidden bg-surface-soft"
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Car className="h-14 w-14 text-muted-soft" />
                  </div>
                  <div
                    className="absolute inset-0 bg-soft-gradient opacity-60"
                    aria-hidden
                  />
                </Link>

                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    toggle(item.id);
                  }}
                  className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-canvas/95 backdrop-blur transition-transform hover:scale-105"
                  aria-label="Remover dos salvos"
                >
                  <Heart className="h-4 w-4 fill-mp-primary stroke-mp-primary" />
                </button>

                <Link to={url} className="flex flex-col gap-1 p-4">
                  <h3 className="line-clamp-1 text-title-md text-ink">
                    {item.parking_type.name} · {item.operator.name}
                  </h3>
                  <p className="line-clamp-1 text-body-sm text-muted">
                    {item.location.name}
                  </p>
                  {item.location.address && (
                    <p className="line-clamp-1 text-body-sm text-muted">
                      {item.location.address}
                    </p>
                  )}
                </Link>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
