import { useNavigate } from "react-router-dom";
import { Car, ArrowRight, Star } from "lucide-react";
import { usePopularLocations, type PopularLocation } from "@/features/search/api";
import { Skeleton } from "@/components/ui/skeleton";

const amenityShortLabel: Record<string, string> = {
  shuttle_free: "Shuttle",
  valet: "Valet",
  covered: "Coberto",
  cover_protection: "Capa protetora",
  ev_charger: "Carregador EV",
  cameras_24h: "Câmeras 24h",
  on_site_24h: "24 horas",
  gated_access: "Portaria",
  pcd: "Acessível",
  motorcycle: "Vagas moto",
};

const AMENITY_PRIORITY = [
  "shuttle_free",
  "valet",
  "covered",
  "cover_protection",
  "ev_charger",
  "cameras_24h",
  "on_site_24h",
  "gated_access",
];

function topAmenities(amenities: { amenity_code: string }[], n: number): string[] {
  const set = new Set(amenities.map((a) => a.amenity_code));
  const out: string[] = [];
  for (const code of AMENITY_PRIORITY) {
    if (set.has(code) && amenityShortLabel[code]) out.push(amenityShortLabel[code]);
    if (out.length >= n) break;
  }
  return out;
}

function destLink(loc: PopularLocation): string {
  if (loc.destination) return `/search?dest=${loc.destination.code}`;
  return "/search";
}

function RatingLine({ avg, count }: { avg: number | null; count: number }) {
  if (!avg || count === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 text-caption-sm text-white/80">
      <Star className="h-3 w-3 fill-mp-amber stroke-mp-amber" />
      {avg.toFixed(1)}
      <span className="text-white/50">({count})</span>
    </span>
  );
}

function RatingLineMuted({ avg, count }: { avg: number | null; count: number }) {
  if (!avg || count === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 text-caption-sm text-muted">
      <Star className="h-3 w-3 fill-mp-amber stroke-mp-amber" />
      {avg.toFixed(1)}
      <span className="text-muted-soft">({count})</span>
    </span>
  );
}

export function PopularParkingLots() {
  const navigate = useNavigate();
  const { data, isLoading } = usePopularLocations(5);

  const [featured, ...rest] = data ?? [];
  const grid = rest.slice(0, 4);

  if (isLoading) {
    return (
      <section className="mx-auto w-full max-w-[1280px] px-6 py-16 desktop:px-8">
        <Skeleton className="mb-2 h-4 w-32" />
        <Skeleton className="mb-8 h-9 w-72" />
        <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
          <Skeleton className="h-72 w-full rounded-md" />
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[136px] w-full rounded-md" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (!featured && grid.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-[1280px] px-6 py-16 desktop:px-8">
      <p className="mb-2 text-caption-sm font-bold uppercase tracking-widest text-mp-violet">
        Os mais reservados
      </p>
      <h2 className="mb-8 text-[28px] font-bold tracking-tight text-ink tablet:text-[36px]">
        Estacionamentos populares
      </h2>

      <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
        {/* Card featured — coluna esquerda */}
        {featured && (
          <button
            type="button"
            onClick={() => navigate(destLink(featured))}
            className="group relative flex min-h-[300px] flex-col justify-end overflow-hidden rounded-md bg-gradient-to-br from-mp-navy to-mp-indigo p-6 text-left transition-all hover:shadow-tier desktop:min-h-[340px]"
          >
            <div className="absolute inset-0 flex items-center justify-center opacity-10">
              <Car className="h-28 w-28 text-white" aria-hidden="true" />
            </div>

            <div className="relative z-10">
              <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white">
                <Car className="h-5 w-5" />
              </span>

              <div className="mb-0.5 text-[22px] font-bold leading-tight text-white">
                {featured.name}
              </div>
              <div className="mb-1 text-body-sm text-white/70">{featured.company.name}</div>

              {featured.destination && (
                <div className="mb-2 text-caption-sm text-white/50">
                  {featured.destination.short_name ?? featured.destination.name}
                </div>
              )}

              <div className="mb-3 flex flex-wrap items-center gap-2">
                <RatingLine avg={featured.review_avg} count={featured.review_count} />
                {topAmenities(featured.amenities, 2).map((label) => (
                  <span
                    key={label}
                    className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/80 backdrop-blur-sm"
                  >
                    {label}
                  </span>
                ))}
              </div>

              <span className="inline-flex items-center gap-1.5 text-caption font-semibold text-white/90 transition-[gap] group-hover:gap-2.5">
                Ver vagas disponíveis <ArrowRight className="h-4 w-4" />
              </span>
            </div>
          </button>
        )}

        {/* Grid 2×2 */}
        <div className="grid grid-cols-2 gap-4">
          {grid.map((loc) => {
            const topAm = topAmenities(loc.amenities, 1);
            return (
              <button
                key={loc.id}
                type="button"
                onClick={() => navigate(destLink(loc))}
                className="group flex flex-col items-start gap-3 rounded-md border border-hairline bg-canvas p-4 text-left transition-all hover:border-mp-violet/30 hover:shadow-tier"
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-mp-pale text-mp-indigo">
                  <Car className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-1 text-title-md leading-snug text-ink">
                    {loc.name}
                  </div>
                  <div className="mt-0.5 line-clamp-1 text-caption-sm text-muted">
                    {loc.company.name}
                  </div>
                  {loc.destination && (
                    <div className="mt-0.5 text-caption-sm text-muted-soft">
                      {loc.destination.short_name ?? loc.destination.name}
                    </div>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <RatingLineMuted avg={loc.review_avg} count={loc.review_count} />
                    {topAm.map((label) => (
                      <span key={label} className="text-caption-sm text-muted">
                        · {label}
                      </span>
                    ))}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
