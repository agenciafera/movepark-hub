import { Link } from "react-router-dom";
import { useRef, useEffect } from "react";
import { ArrowRight, Plane } from "lucide-react";
import { usePopularOffers, type PopularOffer } from "@/features/search/api";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { gsap } from "@/lib/gsap";
import { formatBRL } from "@/lib/format";

// Rotação por índice — cada card recebe uma foto diferente
const PARKING_IMAGES = [
  "/Estacionamentos/nation park.avif",
  "/Estacionamentos/movepark-virapark-002.jpg",
  "/Estacionamentos/vaga-coberta-estacionamento-aeroporto-guarulhos-aeroparking.png",
  "/Estacionamentos/nation park 2.avif",
  "/Estacionamentos/movepark-virapark_001.jpg",
  "/Estacionamentos/vaga-descoberta-estacionamento-aeroporto-guarulhos-aeroparking.png",
  "/Estacionamentos/virapark-estacionamento-aeroporto-viracopos.png",
];

function getCardImage(offer: PopularOffer, index: number): string {
  return offer.location.cover_image ?? PARKING_IMAGES[index % PARKING_IMAGES.length];
}

// Mapeamento de amenidade → label + cor de pill
const AMENITY_PILLS: Record<string, { label: string; className: string }> = {
  shuttle_free: { label: "Traslado grátis", className: "bg-ink text-canvas" },
  covered:      { label: "Coberto",         className: "bg-ink text-canvas" },
  valet:        { label: "Valet",           className: "bg-ink text-canvas" },
  ev_charger:   { label: "Carregador EV",   className: "bg-surface-strong text-ink" },
  cameras_24h:  { label: "Câmeras 24h",     className: "bg-surface-strong text-ink" },
  on_site_24h:  { label: "24 horas",        className: "bg-surface-strong text-ink" },
  gated_access: { label: "Portaria",        className: "bg-surface-strong text-ink" },
  self_park:    { label: "Self-park",       className: "bg-surface-strong text-ink" },
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

function topAmenityPills(amenities: { amenity_code: string }[], n = 2) {
  const set = new Set(amenities.map((a) => a.amenity_code));
  const out: { label: string; className: string }[] = [];
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

function PopularOfferCard({ offer, index }: { offer: PopularOffer; index: number }) {
  const { from, to } = getDefaultDates();
  const { location, parking_type, price_1d, old_price_1d } = offer;
  const pills = topAmenityPills(location.amenities);
  const url = `/p/${location.company.slug}/${location.slug}/${parking_type.code}?from=${from}&to=${to}&src=home-popular`;
  const imgSrc = getCardImage(offer, index);

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-hairline bg-canvas transition-shadow hover:shadow-tier">
      {/* Imagem — proporção 2:1 (mais larga que alta) */}
      <Link to={url} className="relative block aspect-[2/1] overflow-hidden bg-surface-soft">
        <img
          src={imgSrc}
          alt={location.name}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
          decoding="async"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" aria-hidden />

        {/* Tipo de vaga como badge — canto superior esquerdo */}
        <div className="absolute left-3 top-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-mp-primary px-3 py-1 text-[12px] font-semibold text-white shadow-sm backdrop-blur-sm">
            {parking_type.name}
          </span>
        </div>
      </Link>

      {/* Conteúdo — padding e espaçamento maior */}
      <Link to={url} className="flex flex-1 flex-col gap-3 p-5">
        {/* Nome + destino */}
        <div className="min-w-0">
          <h3 className="line-clamp-1 text-[18px] font-bold leading-snug text-ink">
            {location.company.name}
          </h3>
          {location.destination && (
            <p className="mt-1 flex items-center gap-1.5 text-body-sm text-muted">
              <Plane className="h-3 w-3 shrink-0" aria-hidden />
              {location.destination.code
                ? `(${location.destination.code}) ${location.destination.short_name ?? location.destination.name}`
                : (location.destination.short_name ?? location.destination.name)}
            </p>
          )}
        </div>

        {/* Pills de amenidade */}
        {pills.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {pills.map((p) => (
              <span
                key={p.label}
                className={cn(
                  "rounded-full px-3 py-1 text-[12px] font-medium",
                  p.className,
                )}
              >
                {p.label}
              </span>
            ))}
          </div>
        )}

        {/* Preço */}
        <div className="mt-auto">
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

  return (
    <section ref={sectionRef} className="mx-auto w-full max-w-[1280px] px-6 py-16 desktop:px-8">
      <p data-reveal="header" className="mb-2 text-caption-sm font-bold uppercase tracking-widest text-mp-violet">
        Os mais reservados
      </p>
      <h2 data-reveal="header" className="mb-8 text-[36px] leading-[1.1] font-bold text-ink tablet:text-display-2xl">
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
        {data.map((offer, i) => (
          <PopularOfferCard key={offer.id} offer={offer} index={i} />
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
