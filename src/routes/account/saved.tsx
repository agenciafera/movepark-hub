import * as React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Heart, Car, ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { useSavedListings } from "@/features/search/useSavedListings";

type SavedListingDetail = {
  id: string;
  operator: { slug: string; name: string };
  location: {
    slug: string;
    name: string;
    address: string | null;
    cover_image: string | null;
  };
  parking_type: { code: string; name: string };
};

function useSavedListingsDetail(ids: string[]) {
  return useQuery({
    queryKey: ["saved-listings-detail", ids.slice().sort().join(",")],
    queryFn: async (): Promise<SavedListingDetail[]> => {
      if (ids.length === 0) return [];
      // O tipo de vaga (código/nome) vem por company_parking_type → parking_type;
      // location_parking_type não tem "parking_type_code" (isso dava erro PGRST200
      // e deixava a lista de favoritos sempre vazia).
      const { data, error } = await supabase
        .from("location_parking_type")
        .select(
          `
          id,
          location:location!inner (
            slug,
            name,
            address,
            photos,
            company:company!inner ( slug, name )
          ),
          company_parking_type:company_parking_type!inner (
            parking_type:parking_type!inner ( code, name )
          )
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
            photos: unknown;
            company: { slug: string; name: string } | null;
          } | null;
          company_parking_type: {
            parking_type: { code: string; name: string } | null;
          } | null;
        };
        const parkingType = rec.company_parking_type?.parking_type;
        // Capa = 1ª foto da galeria, a mesma regra da busca (search/index.ts).
        const photos = rec.location?.photos;
        const cover =
          Array.isArray(photos) && typeof photos[0] === "string" ? (photos[0] as string) : null;
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
            cover_image: cover,
          },
          parking_type: {
            code: parkingType?.code ?? "",
            name: parkingType?.name ?? "",
          },
        };
      });
    },
    enabled: ids.length > 0,
    staleTime: 60_000,
  });
}

/** Skeleton espelhando o card de favorito (mesma forma e altura) — evita salto de layout. */
function SavedCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-hairline bg-canvas">
      <Skeleton className="aspect-[4/3] w-full rounded-none" />
      <div className="flex flex-col gap-3 p-5">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="mt-1 h-4 w-32" />
      </div>
    </div>
  );
}

export default function SavedPage() {
  const { ids, toggle } = useSavedListings();
  const idsArray = React.useMemo(() => Array.from(ids), [ids]);
  const detail = useSavedListingsDetail(idsArray);

  return (
    <div className="space-y-6">
      <PageHeader title="Favoritos" description="Os estacionamentos que você salvou." />

      {detail.isError ? (
        <div className="flex flex-col items-start gap-3 rounded-md border border-error bg-badge-cancelled-bg p-4">
          <p className="text-body-sm text-error">
            Não conseguimos carregar seus favoritos agora.
          </p>
          <Button variant="secondary" size="sm" onClick={() => detail.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : detail.isLoading && idsArray.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
          {Array.from({ length: Math.min(idsArray.length, 6) }).map((_, i) => (
            <SavedCardSkeleton key={i} />
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
        <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
          {detail.data?.map((item) => {
            const url = `/p/${item.operator.slug}/${item.location.slug}/${item.parking_type.code}`;
            return (
              <article
                key={item.id}
                className="group relative flex flex-col overflow-hidden rounded-2xl border border-hairline bg-canvas transition-shadow hover:shadow-tier"
              >
                <Link to={url} className="relative block aspect-[4/3] overflow-hidden bg-surface-soft">
                  {item.location.cover_image ? (
                    <img
                      src={item.location.cover_image}
                      alt={item.location.name}
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Car className="h-14 w-14 text-muted-soft" />
                      </div>
                      <div className="absolute inset-0 bg-soft-gradient opacity-60" aria-hidden />
                    </>
                  )}
                </Link>

                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    toggle(item.id);
                  }}
                  className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-canvas/95 backdrop-blur transition-transform hover:scale-105 motion-reduce:transition-none motion-reduce:hover:scale-100"
                  aria-label={`Remover ${item.operator.name} dos favoritos`}
                >
                  <Heart className="h-4 w-4 fill-mp-primary stroke-mp-primary" />
                </button>

                <Link to={url} className="flex flex-1 flex-col gap-3 p-5">
                  <div className="space-y-0.5">
                    <h3 className="line-clamp-1 text-[18px] font-bold leading-snug text-ink">
                      {item.operator.name}
                    </h3>
                    <p className="line-clamp-1 text-body-sm text-muted">
                      {item.location.name} · {item.parking_type.name}
                    </p>
                    {item.location.address && (
                      <p className="line-clamp-1 text-body-sm text-muted">
                        {item.location.address}
                      </p>
                    )}
                  </div>
                  {/* Favorito não tem período, então não tem preço: a âncora do rodapé
                      é a afordância de ir pro lote (o violeta fica reservado ao CTA). */}
                  <span className="mt-auto inline-flex items-center gap-1.5 pt-1 text-body-sm font-medium text-ink">
                    Ver disponibilidade
                    <ArrowRight
                      className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
                      aria-hidden
                    />
                  </span>
                </Link>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
