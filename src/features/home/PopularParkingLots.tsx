import { Link } from "react-router-dom";
import { useRef, useEffect } from "react";
import { ArrowRight, Plane, Tag } from "lucide-react";
import { usePopularOffers, type PopularOffer } from "@/features/search/api";
import { useSavedListings } from "@/features/search/useSavedListings";
import { ParkingCard, ParkingCardBadge, type ParkingCardAmenity } from "@/features/search/ParkingCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { gsap } from "@/lib/gsap";

// Mapeamento de amenidade → label
const AMENITY_PILLS: Record<string, string> = {
  shuttle_free: "Transfer grátis",
  covered:      "Coberto",
  valet:        "Valet",
  ev_charger:   "Carregador EV",
  cameras_24h:  "Câmeras 24h",
  on_site_24h:  "24 horas",
  gated_access: "Portaria",
  self_park:    "Self-park",
};

const AMENITY_PRIORITY = [
  "shuttle_free",
  "valet",
  "covered",
  "ev_charger",
  "cameras_24h",
  "on_site_24h",
  "gated_access",
  "self_park",
];

function topAmenityPills(amenities: { amenity_code: string }[], n = 3): ParkingCardAmenity[] {
  const set = new Set(amenities.map((a) => a.amenity_code));
  const out: ParkingCardAmenity[] = [];
  for (const code of AMENITY_PRIORITY) {
    if (set.has(code) && AMENITY_PILLS[code]) out.push({ code, label: AMENITY_PILLS[code] });
    if (out.length >= n) break;
  }
  return out;
}

/** Rótulo do destino no card da home: "(GRU) Guarulhos", ou o nome da unidade sem destino. */
function destinationMeta(location: PopularOffer["location"]): string {
  const d = location.destination;
  if (!d) return location.name;
  const label = d.short_name ?? d.name;
  return d.code ? `(${d.code}) ${label}` : label;
}

function getDefaultDates() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const dayAfter = new Date(now);
  dayAfter.setDate(now.getDate() + 2);
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  return { from: fmt(tomorrow), to: fmt(dayAfter) };
}

function PopularOfferCard({
  offer,
  badge,
  isSaved,
  onToggleSave,
}: {
  offer: PopularOffer;
  badge?: string;
  isSaved: boolean;
  onToggleSave: () => void;
}) {
  const { from, to } = getDefaultDates();
  const { location, parking_type, price_1d, old_price_1d } = offer;
  const url = `/p/${location.company.slug}/${location.slug}/${parking_type.code}?from=${from}&to=${to}&src=home-popular`;

  return (
    <ParkingCard
      testId="popular-card"
      href={url}
      coverImage={location.cover_image}
      coverAlt={location.name}
      title={location.company.name}
      parkingTypeName={parking_type.name}
      parkingTypeCode={parking_type.code}
      metaIcon={location.destination ? Plane : undefined}
      meta={destinationMeta(location)}
      rating={{ avg: location.review_avg, count: location.review_count }}
      amenities={topAmenityPills(location.amenities)}
      price={{ total: price_1d, oldPrice: old_price_1d, unit: "1 diária" }}
      overlay={badge ? <ParkingCardBadge icon={Tag}>{badge}</ParkingCardBadge> : undefined}
      favorite={{ isSaved, onToggle: onToggleSave }}
    />
  );
}

function LoadingSkeleton() {
  return (
    <section className="mx-auto w-full max-w-[1280px] px-6 py-16 desktop:px-8">
      <Skeleton className="mb-2 h-4 w-32" />
      <Skeleton className="mb-8 h-9 w-72" />
      <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col overflow-hidden rounded-2xl border border-hairline">
            <Skeleton className="aspect-[2/1] w-full" />
            <div className="flex flex-col gap-3 p-5">
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
  const { data, isLoading } = usePopularOffers(6);
  const saved = useSavedListings();
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!data || !sectionRef.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        "[data-reveal='header']",
        { opacity: 0, y: 20 },
        {
          opacity: 1, y: 0, duration: 0.55, ease: "power2.out", stagger: 0.08,
          scrollTrigger: { trigger: sectionRef.current, start: "top 88%", once: true },
        },
      );
      gsap.fromTo(
        "article",
        { opacity: 0, y: 36 },
        {
          opacity: 1, y: 0, duration: 0.65, ease: "power2.out", stagger: 0.08,
          scrollTrigger: { trigger: sectionRef.current, start: "top 80%", once: true },
        },
      );
    }, sectionRef);
    return () => ctx.revert();
  }, [data]);

  if (isLoading) return <LoadingSkeleton />;
  if (!data || data.length === 0) return null;

  // Computa o menor preço do conjunto para destacar o "Mais barato"
  const prices = data.map((o) => o.price_1d ?? Infinity);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices.filter((p) => p !== Infinity));
  const hasPriceVariation = data.length >= 2 && maxPrice > minPrice;

  return (
    <section
      ref={sectionRef}
      data-testid="popular-parking-lots"
      className="mx-auto w-full max-w-[1280px] px-6 py-16 desktop:px-8"
    >
      <p data-reveal="header" className="mb-2 text-badge uppercase tracking-[0.4px] text-mp-indigo">
        Os mais reservados
      </p>
      <h2 data-reveal="header" className="mb-8 text-display-2xl text-ink">
        Estacionamentos Populares
      </h2>

      <div
        className={cn(
          "grid gap-5",
          data.length <= 2
            ? "grid-cols-1 tablet:grid-cols-2"
            : "grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-3",
        )}
      >
        {data.map((offer) => {
          const isCheapest = hasPriceVariation && offer.price_1d === minPrice;
          return (
            <PopularOfferCard
              key={offer.id}
              offer={offer}
              badge={isCheapest ? "Mais barato" : undefined}
              isSaved={saved.isSaved(offer.id)}
              onToggleSave={() => saved.toggle(offer.id)}
            />
          );
        })}
      </div>

      <div className="mt-10 flex justify-center">
        <Button asChild variant="outline">
          <Link to="/search">
            Ver todos os estacionamentos <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
