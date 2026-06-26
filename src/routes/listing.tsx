import * as React from "react";
import { Link, useLoaderData, useParams, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, MapPin, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/shared/EmptyState";
import { PhotoGrid } from "@/features/listing/PhotoGrid";
import { AmenityList } from "@/features/listing/AmenityList";
import { OperatorCard } from "@/features/listing/OperatorCard";
import { HowToArrive } from "@/features/listing/HowToArrive";
import { TerminalDistances } from "@/features/listing/TerminalDistances";
import { ReservationCard } from "@/features/listing/ReservationCard";
import { GuaranteeSection } from "@/features/guarantee/GuaranteeSection";
import { CancellationPolicy } from "@/features/bookings/CancellationPolicy";
import { ReviewsBlock } from "@/features/reviews/ReviewsBlock";
import { RatingBadge } from "@/features/reviews/RatingStars";
import { useLocationReviews } from "@/features/reviews/api";
import { useListing, type ListingDetail } from "@/features/listing/api";
import { useSavedListings } from "@/features/search/useSavedListings";
import { useFaqCombined, type FaqCombinedItem } from "@/features/faqs/api";
import { FaqList } from "@/features/faqs/FaqList";
import { optimizedImageUrl } from "@/lib/storage";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  localBusinessSchema,
  productOfferSchema,
  breadcrumbSchema,
  faqSchema,
  type SchemaReview,
} from "@/lib/jsonld";

export default function ListingPage() {
  const params = useParams<{
    operatorSlug: string;
    locationSlug: string;
    parkingTypeCode: string;
  }>();
  const [searchParams] = useSearchParams();
  const saved = useSavedListings();
  const loaderData = useLoaderData() as ListingDetail | null | undefined;

  const { data: listing, isLoading, error } = useListing(
    params.operatorSlug,
    params.locationSlug,
    params.parkingTypeCode,
    { initialData: loaderData ?? undefined },
  );

  const { data: reviews } = useLocationReviews(
    (listing?.location.review_count ?? 0) > 0 ? listing?.location.id : undefined,
    8,
  );
  const schemaReviews: SchemaReview[] = (reviews ?? []).map((r) => ({
    author: r.author_name,
    rating: r.rating,
    comment: r.comment,
    date: r.created_at,
  }));

  const { data: faqItems, isLoading: faqLoading } = useFaqCombined({
    locationId: listing?.location.id,
    enabled: !!listing?.location.id,
  });

  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");
  const initialFrom = fromStr ? new Date(fromStr) : null;
  const initialTo = toStr ? new Date(toStr) : null;

  // Ref para o card de reserva mobile — aciona sticky CTA ao sair da viewport
  const mobileCardRef = React.useRef<HTMLDivElement>(null);
  const [showStickyBar, setShowStickyBar] = React.useState(false);

  React.useEffect(() => {
    const el = mobileCardRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => setShowStickyBar(!entry.isIntersecting),
      { threshold: 0 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [listing]);

  const pageTitle = listing
    ? `${listing.parking_type.name} · ${listing.location.name} | Movepark`
    : "Estacionamento | Movepark";
  const pageDesc = listing
    ? `Reserve ${listing.parking_type.name} em ${listing.location.name}. ${listing.location.address ?? ""}`
    : "";
  const pageUrl = listing
    ? `https://hub.movepark.co/p/${listing.company.slug}/${listing.location.slug}/${listing.parking_type.code}`
    : "";
  // og:image/twitter — usa a 1ª foto da unidade, recortada pro formato de card (1200x630).
  const ogImage =
    listing && listing.location.photos[0]
      ? optimizedImageUrl(listing.location.photos[0], { width: 1200, height: 630, resize: "cover" })
      : undefined;

  const faqSchemaData =
    faqItems && faqItems.length > 0
      ? faqSchema(faqItems.map((f) => ({ question: f.question, answer: f.answer })))
      : null;

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-[1080px] px-4 py-6 desktop:px-8">
        <Skeleton className="mb-6 h-6 w-32" />
        <Skeleton className="mb-3 h-8 w-2/3" />
        <Skeleton className="mb-6 h-4 w-1/2" />
        <Skeleton className="mb-8 h-[420px] w-full rounded-md" />
        <div className="grid grid-cols-1 gap-8 desktop:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
          <Skeleton className="h-96 w-full rounded-md" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-[1080px] px-4 py-12 desktop:px-8">
        <div className="rounded-md border border-error bg-badge-cancelled-bg p-4 text-body-sm text-error">
          {(error as Error).message}
        </div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="mx-auto w-full max-w-[1080px] px-4 py-12 desktop:px-8">
        <EmptyState
          title="Vaga não encontrada"
          description="Pode ter sido removida pelo estacionamento. Volte pra busca."
          action={
            <Button asChild>
              <Link to="/">Voltar pra home</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const isSaved = saved.isSaved(listing.id);
  const hasDescription = (listing.capacity ?? 0) > 0 || !!listing.parking_type.description;
  const hasAmenities = listing.amenities.length > 0;

  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 py-8 desktop:px-8">
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDesc} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDesc} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={pageUrl} />
        <meta name="twitter:card" content={ogImage ? "summary_large_image" : "summary"} />
        {ogImage && <meta property="og:image" content={ogImage} />}
        {ogImage && <meta property="og:image:width" content="1200" />}
        {ogImage && <meta property="og:image:height" content="630" />}
        {ogImage && <meta name="twitter:image" content={ogImage} />}
        <link rel="canonical" href={pageUrl} />
        <script type="application/ld+json">{JSON.stringify(localBusinessSchema(listing))}</script>
        <script type="application/ld+json">{JSON.stringify(productOfferSchema(listing, schemaReviews))}</script>
        <script type="application/ld+json">
          {JSON.stringify(
            breadcrumbSchema([
              { name: "Home", url: "https://hub.movepark.co" },
              { name: listing.location.name, url: pageUrl },
            ]),
          )}
        </script>
        {faqSchemaData && (
          <script type="application/ld+json">{JSON.stringify(faqSchemaData)}</script>
        )}
      </Helmet>
      {/* Voltar */}
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-3">
        <Link to={`/search?${searchParams.toString()}`}>
          <ArrowLeft className="h-4 w-4" />
          Voltar pra busca
        </Link>
      </Button>

      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-display-xl text-ink">{listing.company.name}</h1>
          <p className="text-display-sm text-muted">{listing.parking_type.name}</p>
          <div className="flex flex-wrap items-center gap-2 text-body-sm text-muted">
            <RatingBadge
              avg={listing.location.review_avg}
              count={listing.location.review_count}
              href="#avaliacoes"
            />
            {listing.location.address && (
              <>
                {(listing.location.review_count ?? 0) > 0 && <span>·</span>}
                <MapPin className="h-4 w-4 shrink-0" />
                <span className="line-clamp-1">{listing.location.address}</span>
              </>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => saved.toggle(listing.id)}
          aria-label={isSaved ? "Remover dos salvos" : "Salvar nos favoritos"}
          className="inline-flex shrink-0 items-center gap-2 rounded-full border border-hairline px-3 py-2 text-body-sm text-ink hover:shadow-tier"
        >
          <Heart className={cn("h-4 w-4", isSaved ? "fill-mp-primary stroke-mp-primary" : "")} />
          <span className="hidden tablet:inline">{isSaved ? "Salvo" : "Salvar"}</span>
        </button>
      </div>

      {/* Photo grid */}
      <PhotoGrid title={listing.location.name} photoUrls={listing.location.photos} />

      {/* Mobile/tablet: card de reserva logo após as fotos — visível sem scroll */}
      <div ref={mobileCardRef} className="mt-6 desktop:hidden">
        <ReservationCard
          listing={listing}
          initialFrom={initialFrom}
          initialTo={initialTo}
        />
      </div>

      {/* Body 2-col */}
      <div className="mt-8 grid grid-cols-1 gap-12 desktop:grid-cols-[1fr_360px]">
        <div className="space-y-10">
          {/* Sub-header: descrição e capacidade — só renderiza quando tem conteúdo */}
          {hasDescription && (
            <section className="space-y-3">
              {(listing.capacity ?? 0) > 0 && (
                <p className="text-body-sm text-muted">
                  {listing.capacity} vagas disponíveis
                </p>
              )}
              {listing.parking_type.description && (
                <p className="text-body-md text-body">{listing.parking_type.description}</p>
              )}
            </section>
          )}

          {hasDescription && <Separator />}

          {/* O que oferece — oculto quando o estacionamento não cadastrou comodidades */}
          {hasAmenities && (
            <>
              <section className="space-y-4">
                <h2 className="text-display-sm text-ink">O que essa vaga oferece</h2>
                <AmenityList amenities={listing.amenities} />
              </section>

              <Separator />
            </>
          )}

          {/* Como chegar (PRD-11): aviso de entrada + passo-a-passo + traslado + mapa */}
          <section className="space-y-4">
            <h2 className="text-display-sm text-ink">Como chegar</h2>
            <HowToArrive
              address={listing.location.address}
              latitude={listing.location.latitude}
              longitude={listing.location.longitude}
              notice={listing.location.notice}
              hasNotice={listing.location.has_notice}
              directionsText={listing.location.directions_text}
              shuttleFrequencyMinutes={listing.location.shuttle_frequency_minutes}
              shuttleToTerminalMinutes={listing.location.shuttle_to_terminal_minutes}
            />
            <TerminalDistances locationId={listing.location.id} />
          </section>

          {listing.location.review_count > 0 && (
            <>
              <Separator />
              <ReviewsBlock
                locationId={listing.location.id}
                totalCount={listing.location.review_count}
              />
            </>
          )}

          <Separator />

          {/* Política */}
          <section className="space-y-3">
            <h2 className="text-display-sm text-ink">Política de cancelamento</h2>
            <CancellationPolicy operatorPolicy={listing.location.reservation_policy} />
          </section>

          <Separator />

          {/* Garantia de vaga */}
          <GuaranteeSection />

          <Separator />

          {/* FAQ — global + destination + location (ADR-002) */}
          <ListingFaqSection items={faqItems} isLoading={faqLoading} />

          <Separator />

          {/* Estacionamento */}
          <section className="space-y-4">
            <h2 className="text-display-sm text-ink">Conheça o estacionamento</h2>
            <OperatorCard
              company={listing.company}
              others={listing.other_locations}
            />
          </section>
        </div>

        {/* Reservation card sticky */}
        <aside className="hidden desktop:block">
          <div className="sticky top-24">
            <ReservationCard
              listing={listing}
              initialFrom={initialFrom}
              initialTo={initialTo}
            />
          </div>
        </aside>
      </div>

      {/* Sticky CTA mobile — aparece quando o card de reserva sai da viewport */}
      {showStickyBar && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-4 border-t border-hairline bg-canvas/95 px-4 py-3 backdrop-blur-sm desktop:hidden">
          <div>
            <p className="text-caption text-muted">A partir de</p>
            <p className="text-display-sm font-bold text-ink tabular-nums">
              {formatBRL(listing.company_parking_type.base_price)}
            </p>
          </div>
          <Button
            onClick={() =>
              mobileCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
          >
            Reservar
          </Button>
        </div>
      )}
    </div>
  );
}

type ListingFaqSectionProps = {
  items: FaqCombinedItem[] | undefined;
  isLoading: boolean;
};

function ListingFaqSection({ items, isLoading }: ListingFaqSectionProps) {
  if (!isLoading && (items ?? []).length === 0) return null;
  return (
    <section className="space-y-4">
      <h2 className="text-display-sm text-ink">Perguntas frequentes</h2>
      <FaqList items={items} isLoading={isLoading} groupByScope />
    </section>
  );
}
