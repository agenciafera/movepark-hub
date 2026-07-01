import * as React from "react";
import { Link } from "react-router-dom";
import { Car, ChevronLeft, ChevronRight, Star } from "lucide-react";
import { useSearchResults } from "@/features/search/useSearchResults";
import { formatBRL } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Props = {
  currentLocationId: string;
  dest: string;
  from: string;
  to: string;
  searchParams: URLSearchParams;
};

export function RecommendedCarousel({
  currentLocationId,
  dest,
  from,
  to,
  searchParams,
}: Props) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(true);

  const { data, isLoading } = useSearchResults({ dest, from, to, limit: 9 });

  const items = React.useMemo(
    () => (data?.results ?? []).filter((r) => r.location.id !== currentLocationId).slice(0, 8),
    [data, currentLocationId],
  );

  function scroll(dir: "left" | "right") {
    scrollRef.current?.scrollBy({ left: dir === "right" ? 288 : -288, behavior: "smooth" });
  }

  function updateArrows() {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 8);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  }

  React.useEffect(() => {
    updateArrows();
  }, [items]);

  if (!isLoading && items.length === 0) return null;

  const linkParams = new URLSearchParams(searchParams);
  linkParams.set("src", "listing_rec");

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-display-sm text-ink">Outras opções no mesmo destino</h2>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => scroll("left")}
            disabled={!canScrollLeft}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full border border-hairline bg-canvas transition-colors",
              canScrollLeft ? "hover:bg-surface-soft" : "opacity-30",
            )}
            aria-label="Rolar para a esquerda"
          >
            <ChevronLeft className="h-4 w-4 text-ink" />
          </button>
          <button
            type="button"
            onClick={() => scroll("right")}
            disabled={!canScrollRight}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full border border-hairline bg-canvas transition-colors",
              canScrollRight ? "hover:bg-surface-soft" : "opacity-30",
            )}
            aria-label="Rolar para a direita"
          >
            <ChevronRight className="h-4 w-4 text-ink" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={updateArrows}
        className="flex gap-4 overflow-x-auto scroll-smooth pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ scrollSnapType: "x mandatory" }}
      >
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="w-[264px] shrink-0">
                <Skeleton className="aspect-[4/3] w-full rounded-md" />
                <div className="mt-3 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-4 w-1/3" />
                </div>
              </div>
            ))
          : items.map((item) => {
              const url = `/p/${item.operator.slug}/${item.location.slug}/${item.parking_type.code}?${linkParams.toString()}`;
              const soldOut = item.availability?.sold_out ?? false;

              return (
                <Link
                  key={item.id}
                  to={url}
                  style={{ scrollSnapAlign: "start" }}
                  className={cn(
                    "group w-[264px] shrink-0 overflow-hidden rounded-md border border-hairline bg-canvas transition-shadow hover:shadow-tier",
                    soldOut && "pointer-events-none opacity-50",
                  )}
                >
                  {/* Foto */}
                  <div className="relative aspect-[4/3] overflow-hidden bg-surface-soft">
                    {item.location.cover_image ? (
                      <img
                        src={item.location.cover_image}
                        alt={item.location.name}
                        loading="lazy"
                        decoding="async"
                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Car className="h-10 w-10 text-muted-soft" />
                      </div>
                    )}
                    {soldOut && (
                      <span className="absolute left-3 top-3 rounded-sm bg-badge-cancelled-bg px-2 py-0.5 text-caption font-bold text-badge-cancelled-fg">
                        Esgotado
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-4">
                    <p className="truncate text-body-sm font-semibold text-ink">
                      {item.operator.name}
                    </p>
                    <p className="truncate text-caption text-muted">{item.parking_type.name}</p>

                    {item.location.review_avg != null && item.location.review_count > 0 && (
                      <div className="mt-1.5 flex items-center gap-1">
                        <Star className="h-3 w-3 fill-ink text-ink" />
                        <span className="text-caption font-medium text-ink">
                          {item.location.review_avg.toFixed(1)}
                        </span>
                        <span className="text-caption text-muted">
                          ({item.location.review_count})
                        </span>
                      </div>
                    )}

                    <p className="mt-3 text-body-sm text-ink">
                      <span className="font-semibold tabular-nums">
                        {formatBRL(item.price.per_day)}
                      </span>
                      <span className="text-muted"> / dia</span>
                    </p>
                  </div>
                </Link>
              );
            })}
      </div>
    </section>
  );
}
