import { Link } from "react-router-dom";
import { useRef, useEffect } from "react";
import { ArrowRight, Plane, Tag, Car } from "lucide-react";
import { usePopularOffers, type PopularOffer } from "@/features/search/api";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { gsap } from "@/lib/gsap";
import { formatBRL } from "@/lib/format";

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

function topAmenityPills(amenities: { amenity_code: string }[], n = 3) {
  const set = new Set(amenities.map((a) => a.amenity_code));
  const out: string[] = [];
  for (const code of AMENITY_PRIORITY) {
    if (set.has(code) && AMENITY_PILLS[code]) out.push(AMENITY_PILLS[code]);
    if (out.length >= n) break;
  }
  return out;
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

function PopularOfferCard({ offer, badge }: { offer: PopularOffer; badge?: string }) {
  const { from, to } = getDefaultDates();
  const { location, parking_type, price_1d, old_price_1d } = offer;
  const pills = topAmenityPills(location.amenities);
  const url = `/p/${location.company.slug}/${location.slug}/${parking_type.code}?from=${from}&to=${to}&src=home-popular`;
  const cover = location.cover_image;

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-hairline bg-canvas transition-shadow hover:shadow-tier">
      {/* Imagem — 2:1. Sem foto → placeholder (mesmo padrão do ResultCard). */}
      <Link to={url} className="relative block aspect-[2/1] overflow-hidden bg-surface-soft">
        {cover ? (
          <img
            src={cover}
            alt={location.name}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <>
            <div className="absolute inset-0 flex items-center justify-center">
              <Car className="h-12 w-12 text-muted-soft" aria-hidden />
            </div>
            <div className="absolute inset-0 bg-soft-gradient opacity-60" aria-hidden />
          </>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" aria-hidden />

        {/* Diferencial comparativo — só quando o card se destaca no conjunto */}
        {badge && (
          <div className="absolute left-3 top-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-mp-primary px-3 py-1 text-[12px] font-semibold text-white shadow-sm backdrop-blur-sm">
              <Tag className="h-3 w-3 shrink-0" aria-hidden />
              {badge}
            </span>
          </div>
        )}
      </Link>

      {/* Conteúdo */}
      <Link to={url} className="flex flex-1 flex-col gap-3 p-5">
        {/* Nome + destino + tipo de vaga (discreto) */}
        <div className="min-w-0 space-y-0.5">
          <h3 className="line-clamp-1 text-[18px] font-bold leading-snug text-ink">
            {location.company.name}
          </h3>
          <p className="line-clamp-1 flex items-center gap-1.5 text-body-sm text-muted">
            {location.destination && <Plane className="h-3 w-3 shrink-0" aria-hidden />}
            <span>
              {location.destination
                ? location.destination.code
                  ? `(${location.destination.code}) ${location.destination.short_name ?? location.destination.name}`
                  : (location.destination.short_name ?? location.destination.name)
                : location.name}
              {" · "}{parking_type.name}
            </span>
          </p>
        </div>

        {/* Pills de amenidade */}
        {pills.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {pills.map((label) => (
              <span
                key={label}
                className="rounded-full bg-surface-strong px-2.5 py-1 text-[12px] font-medium text-ink"
              >
                {label}
              </span>
            ))}
          </div>
        )}

        {/* Preço — sempre por último */}
        <div className="mt-auto pt-1">
          {old_price_1d != null && old_price_1d > price_1d! && (
            <div className="text-[13px] text-muted line-through tabular-nums">
              {formatBRL(old_price_1d)}
            </div>
          )}
          <div className="text-[24px] font-bold leading-none text-ink tabular-nums">
            {formatBRL(price_1d)}
          </div>
          <span className="mt-1 block text-body-sm text-muted">1 diária</span>
        </div>
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
    <section ref={sectionRef} className="mx-auto w-full max-w-[1280px] px-6 py-16 desktop:px-8">
      <p data-reveal="header" className="mb-2 text-caption-sm font-bold uppercase tracking-widest text-mp-violet">
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
            />
          );
        })}
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
