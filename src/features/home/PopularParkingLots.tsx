import { Link } from "react-router-dom";
import { Car, BusFront, Umbrella, ConciergeBell, Star } from "lucide-react";
import { usePopularLocations, type PopularLocation } from "@/features/search/api";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// Amenidades que merecem destaque visual no card da home
const BADGE_AMENITIES: {
  code: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}[] = [
  { code: "shuttle_free", label: "Traslado grátis", Icon: BusFront },
  { code: "covered", label: "Coberto", Icon: Umbrella },
  { code: "valet", label: "Valet", Icon: ConciergeBell },
];

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

const amenityShortLabel: Record<string, string> = {
  shuttle_free: "Shuttle 24h",
  valet: "Valet",
  covered: "Coberto",
  cover_protection: "Capa proteção",
  ev_charger: "Carregador EV",
  cameras_24h: "Câmeras 24h",
  on_site_24h: "24 horas",
  gated_access: "Portaria",
  pcd: "Acessível",
  motorcycle: "Vagas moto",
};

function topAmenityLabels(amenities: { amenity_code: string }[], n = 3): string[] {
  const set = new Set(amenities.map((a) => a.amenity_code));
  const out: string[] = [];
  for (const code of AMENITY_PRIORITY) {
    if (set.has(code) && amenityShortLabel[code]) out.push(amenityShortLabel[code]);
    if (out.length >= n) break;
  }
  return out;
}

function activeBadges(amenities: { amenity_code: string }[]) {
  const set = new Set(amenities.map((a) => a.amenity_code));
  return BADGE_AMENITIES.filter((b) => set.has(b.code));
}

function destLink(loc: PopularLocation): string {
  return loc.destination ? `/search?dest=${loc.destination.code}` : "/search";
}

function PopularParkingCard({ loc }: { loc: PopularLocation }) {
  const badges = activeBadges(loc.amenities);
  const amenityLabels = topAmenityLabels(loc.amenities);
  const to = destLink(loc);

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-md border border-hairline bg-canvas transition-shadow hover:shadow-tier">
      {/* Área de foto */}
      <Link to={to} className="relative block aspect-[4/3] overflow-hidden bg-surface-soft">
        <div className="absolute inset-0 flex items-center justify-center">
          <Car className="h-14 w-14 text-muted-soft" />
        </div>
        <div className="absolute inset-0 bg-soft-gradient opacity-60" aria-hidden />

        {/* Badges de amenidade sobreposto (fundo da foto) */}
        {badges.length > 0 && (
          <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center gap-1.5">
            {badges.map(({ code, label, Icon }) => (
              <span
                key={code}
                className="inline-flex items-center gap-1 rounded-full bg-canvas/95 px-2 py-0.5 text-caption font-semibold text-ink shadow-tier backdrop-blur"
              >
                <Icon className="h-3 w-3 shrink-0" aria-hidden />
                {label}
              </span>
            ))}
          </div>
        )}
      </Link>

      {/* Corpo do card */}
      <Link to={to} className="flex flex-col gap-1 p-4">
        <h3 className="line-clamp-1 text-title-md text-ink">
          {loc.name}
          {loc.company && <span className="font-normal text-muted"> · {loc.company.name}</span>}
        </h3>

        {/* Rating */}
        {loc.review_avg != null && loc.review_count > 0 && (
          <span className="inline-flex items-center gap-1 text-body-sm text-muted">
            <Star className="h-3.5 w-3.5 fill-mp-amber stroke-mp-amber" />
            {loc.review_avg.toFixed(1)}
            <span className="text-muted-soft">({loc.review_count})</span>
          </span>
        )}

        {/* Destino */}
        {loc.destination && (
          <p className="line-clamp-1 text-body-sm text-muted">
            {loc.destination.short_name ?? loc.destination.name}
          </p>
        )}

        {/* Amenidades em texto */}
        {amenityLabels.length > 0 && (
          <p className="line-clamp-1 text-body-sm text-muted">{amenityLabels.join(" · ")}</p>
        )}
      </Link>
    </article>
  );
}

function LoadingSkeleton() {
  return (
    <section className="mx-auto w-full max-w-[1280px] px-6 py-16 desktop:px-8">
      <Skeleton className="mb-2 h-4 w-32" />
      <Skeleton className="mb-8 h-9 w-72" />
      <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex flex-col overflow-hidden rounded-md border border-hairline">
            <Skeleton className="aspect-[4/3] w-full" />
            <div className="flex flex-col gap-2 p-4">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function PopularParkingLots() {
  const { data, isLoading } = usePopularLocations(6);

  if (isLoading) return <LoadingSkeleton />;
  if (!data || data.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-[1280px] px-6 py-16 desktop:px-8">
      <p className="mb-2 text-caption-sm font-bold uppercase tracking-widest text-mp-violet">
        Os mais reservados
      </p>
      <h2 className="mb-8 text-[28px] font-bold tracking-tight text-ink tablet:text-[36px]">
        Estacionamentos populares
      </h2>

      <div className={cn(
        "grid gap-4",
        data.length <= 2
          ? "grid-cols-1 tablet:grid-cols-2"
          : "grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-3",
      )}>
        {data.map((loc) => (
          <PopularParkingCard key={loc.id} loc={loc} />
        ))}
      </div>
    </section>
  );
}
