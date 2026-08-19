import { Link } from "react-router-dom";
import { useRef, useEffect } from "react";
import { Airplane, ArrowRight, Tag } from "@phosphor-icons/react";
import { useFeaturedOffers, type FeaturedOffer } from "@/features/search/api";
import { useSavedListings } from "@/features/search/useSavedListings";
import {
  ParkingCard,
  ParkingCardBadge,
  type ParkingCardAmenity,
} from "@/features/search/ParkingCard";
import { Go2ParkCardCredit, Go2ParkLivePill } from "@/features/go2park/Go2ParkLive";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { parkingTitle } from "@/lib/parkingName";
import { gsap } from "@/lib/gsap";
import { rotuloDeDestino } from "./featured.logic";

// Mapeamento de amenidade → label
const AMENITY_PILLS: Record<string, string> = {
  shuttle_free: "Transfer grátis",
  covered: "Coberto",
  valet: "Valet",
  ev_charger: "Carregador EV",
  cameras_24h: "Câmeras 24h",
  on_site_24h: "24 horas",
  gated_access: "Portaria",
  self_park: "Self-park",
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

/** Rótulo do destino no card, ou o nome da unidade quando ela não tem destino. */
function destinationMeta(location: FeaturedOffer["location"]): string {
  return rotuloDeDestino(location.destination) ?? location.name;
}

/** Janela do link do card: amanhã por `days` diárias (a estadia que o card mostrou). */
function getDefaultDates(days = 1) {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const checkout = new Date(now);
  checkout.setDate(now.getDate() + 1 + Math.max(1, days));
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  return { from: fmt(tomorrow), to: fmt(checkout) };
}

function FeaturedOfferCard({
  offer,
  badge,
  isSaved,
  onToggleSave,
}: {
  offer: FeaturedOffer;
  badge?: string;
  isSaved: boolean;
  onToggleSave: () => void;
}) {
  const { location, parking_type, price_from, old_price_from, price_days } = offer;
  // A janela do link acompanha a estadia que o card mostrou: mandar 1 diária para um lote que
  // só vende 3 levaria o cliente a uma página sem o preço que ele acabou de ver.
  const { from, to } = getDefaultDates(price_days);
  const url = `/p/${location.company.slug}/${location.slug}/${parking_type.code}?from=${from}&to=${to}&src=home-destaque`;

  return (
    <ParkingCard
      testId="home-featured-card"
      href={url}
      coverImage={location.cover_image}
      coverAlt={location.name}
      title={parkingTitle(location.company.name, location.name)}
      parkingTypeName={parking_type.name}
      parkingTypeCode={parking_type.code}
      metaIcon={location.destination ? Airplane : undefined}
      meta={destinationMeta(location)}
      rating={{ avg: location.review_avg, count: location.review_count }}
      // A vitrine não busca via edge /search: sem snapshot do Google nesta fonte.
      googleRating={null}
      amenities={topAmenityPills(location.amenities)}
      // Rastreio ao vivo da van (Go2Park): promessa na pílula sobre a foto, crédito do parceiro
      // aqui embaixo em tom de metadado.
      highlight={location.go2park ? <Go2ParkCardCredit /> : undefined}
      // Quem exige estadia mínima mostra a diária, e não o total dela: a vitrine põe lado a
      // lado cards de durações diferentes, e comparar total com total faria o "Mais barato"
      // cair no número maior da tela.
      price={{
        total: price_days > 1 && price_from != null ? price_from / price_days : price_from,
        oldPrice:
          price_days > 1 && old_price_from != null ? old_price_from / price_days : old_price_from,
        unit: price_days > 1 ? `por diária · mínimo ${price_days} diárias` : "1 diária",
      }}
      // A pílula do transfer divide a fila com o selo de preço: mesma natureza (o que separa
      // esta unidade das vizinhas) e o mesmo canto da foto.
      overlay={
        badge || location.go2park ? (
          <>
            {badge && <ParkingCardBadge icon={Tag}>{badge}</ParkingCardBadge>}
            {location.go2park && <Go2ParkLivePill />}
          </>
        ) : undefined
      }
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

export function FeaturedParkingLots() {
  const { data, isLoading } = useFeaturedOffers();
  const saved = useSavedListings();
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!data || !sectionRef.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        "[data-reveal='header']",
        { opacity: 0, y: 20 },
        {
          opacity: 1,
          y: 0,
          duration: 0.55,
          ease: "power2.out",
          stagger: 0.08,
          scrollTrigger: { trigger: sectionRef.current, start: "top 88%", once: true },
        },
      );
      gsap.fromTo(
        "article",
        { opacity: 0, y: 36 },
        {
          opacity: 1,
          y: 0,
          duration: 0.65,
          ease: "power2.out",
          stagger: 0.08,
          scrollTrigger: { trigger: sectionRef.current, start: "top 80%", once: true },
        },
      );
    }, sectionRef);
    return () => ctx.revert();
  }, [data]);

  if (isLoading) return <LoadingSkeleton />;
  if (!data || data.length === 0) return null;

  // Menor preço do conjunto para destacar o "Mais barato". Por diária, porque a lista mistura
  // durações: um lote de 3 diárias tem total maior sem ser o mais caro por dia.
  const prices = data.map((o) => (o.price_from != null ? o.price_from / o.price_days : Infinity));
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices.filter((p) => p !== Infinity));
  const hasPriceVariation = data.length >= 2 && maxPrice > minPrice;

  return (
    <section
      ref={sectionRef}
      data-testid="home-featured"
      className="mx-auto w-full max-w-[1280px] px-6 py-16 desktop:px-8"
    >
      <p data-reveal="header" className="mb-2 text-badge uppercase tracking-[0.4px] text-mp-indigo">
        Escolhidos pela Movepark
      </p>
      <h2 data-reveal="header" className="mb-8 text-display-2xl text-ink">
        Estacionamentos em destaque
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
          const isCheapest =
            hasPriceVariation &&
            offer.price_from != null &&
            offer.price_from / offer.price_days === minPrice;
          return (
            <FeaturedOfferCard
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
