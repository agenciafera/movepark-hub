import { Link } from "react-router-dom";
import { BusFront, Umbrella, ConciergeBell, Car, ArrowRight } from "lucide-react";
import { usePopularOffers, type PopularOffer } from "@/features/search/api";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";
import { RatingBadge } from "@/features/reviews/RatingStars";

const BADGE_AMENITIES: { code: string; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { code: "shuttle_free", label: "Traslado grátis", Icon: BusFront },
  { code: "covered", label: "Coberto", Icon: Umbrella },
  { code: "valet", label: "Valet", Icon: ConciergeBell },
];

const AMENITY_PRIORITY = [
  "shuttle_free",
  "valet",
  "self_park",
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
  self_park: "Self-park",
  covered: "Coberto",
  cover_protection: "Capa proteção",
  ev_charger: "Carregador EV",
  cameras_24h: "Câmeras 24h",
  on_site_24h: "24 horas",
  gated_access: "Portaria",
  pcd: "Acessível",
  motorcycle: "Vagas moto",
};

function getDefaultDates() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const dayAfter = new Date(now);
  dayAfter.setDate(now.getDate() + 2);
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  return { from: fmt(tomorrow), to: fmt(dayAfter) };
}

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

function PopularOfferCard({ offer }: { offer: PopularOffer }) {
  const { from, to } = getDefaultDates();
  const { location, parking_type, price_1d, old_price_1d } = offer;
  const badges = activeBadges(location.amenities);
  const amenityLabels = topAmenityLabels(location.amenities);
  const url = `/p/${location.company.slug}/${location.slug}/${parking_type.code}?from=${from}&to=${to}&src=home-popular`;

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-md border border-hairline bg-canvas transition-shadow hover:shadow-tier">
      <Link to={url} className="relative block aspect-[4/3] overflow-hidden bg-surface-soft">
        <div className="absolute inset-0 flex items-center justify-center">
          <Car className="h-14 w-14 text-muted-soft" />
        </div>
        <div className="absolute inset-0 bg-soft-gradient opacity-60" aria-hidden />
        {badges.length > 0 && (
          <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center gap-1.5">
            {badges.map(({ code, label, Icon }) => (
              <span
                key={code}
                className="inline-flex items-center gap-1 rounded-full bg-canvas/95 px-2.5 py-1 text-caption font-semibold text-ink shadow-tier backdrop-blur"
              >
                <Icon className="h-3 w-3 shrink-0" aria-hidden />
                {label}
              </span>
            ))}
          </div>
        )}
      </Link>

      <Link to={url} className="flex flex-col gap-1 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <h3 className="line-clamp-1 text-title-md text-ink">
              {parking_type.name}
              {location.company && (
                <span className="font-normal text-muted"> · {location.company.name}</span>
              )}
            </h3>
            <RatingBadge avg={location.review_avg} count={location.review_count} className="text-body-sm" />
            {location.destination && (
              <p className="line-clamp-1 text-body-sm text-muted">
                {location.destination.short_name ?? location.destination.name}
              </p>
            )}
            {amenityLabels.length > 0 && (
              <p className="line-clamp-1 text-body-sm text-muted">{amenityLabels.join(" · ")}</p>
            )}
          </div>

          <div className="shrink-0 text-right">
            {old_price_1d != null && old_price_1d > price_1d! && (
              <div className="text-caption-sm text-muted line-through tabular-nums">
                {formatBRL(old_price_1d)}
              </div>
            )}
            <div className="text-display-sm text-ink tabular-nums">{formatBRL(price_1d)}</div>
            <div className="text-caption text-muted">1 diária</div>
          </div>
        </div>
      </Link>
    </article>
  );
}

function LoadingSkeleton() {
  return (
    <section className="mx-auto w-full max-w-[1280px] px-6 py-16 desktop:px-8">
      <Skeleton className="mb-2 h-4 w-32" />
      <Skeleton className="mb-3 h-9 w-72" />
      <Skeleton className="mb-8 h-5 w-96" />
      <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col overflow-hidden rounded-xl border border-hairline">
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
  const { data, isLoading } = usePopularOffers(4);

  if (isLoading) return <LoadingSkeleton />;
  if (!data || data.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-[1280px] px-6 py-16 desktop:px-8">
      <p className="mb-2 text-caption-sm font-bold uppercase tracking-widest text-mp-violet">
        Os mais reservados
      </p>
      <h2 className="mb-2 text-[36px] leading-[1.1] font-bold text-ink tablet:text-display-2xl">
        Estacionamentos populares
      </h2>
      <p className="mb-8 max-w-xl text-body-md text-muted">
        Escolhidos por viajantes em todo o Brasil, com avaliações verificadas.
      </p>

      <div
        className={cn(
          "grid gap-5",
          data.length <= 2
            ? "grid-cols-1 tablet:grid-cols-2"
            : "grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-3",
        )}
      >
        {data.map((offer) => (
          <PopularOfferCard key={offer.id} offer={offer} />
        ))}
      </div>

      <div className="mt-10 flex justify-center">
        <Link
          to="/search"
          className="inline-flex items-center gap-2 rounded-full border border-hairline bg-canvas px-6 py-3 text-button-sm font-semibold text-ink transition-shadow hover:shadow-tier"
        >
          Ver todos os estacionamentos <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
