import * as React from "react";
import { Link, useLoaderData, useParams, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, ArrowRight, BadgeCheck, Building2, Bus, CalendarX, Car, Heart, MapPin, ShieldCheck, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/shared/EmptyState";
import { PhotoGrid } from "@/features/listing/PhotoGrid";
import { AmenityList } from "@/features/listing/AmenityList";
import { HowToArrive } from "@/features/listing/HowToArrive";
import { TerminalDistances } from "@/features/listing/TerminalDistances";
import { ReservationCard } from "@/features/listing/ReservationCard";
import { RecommendedCarousel } from "@/features/listing/RecommendedCarousel";
import { buildListingTldr, nearestTerminal } from "@/features/listing/tldr.logic";
import { ReviewsBlock } from "@/features/reviews/ReviewsBlock";
import { RatingBadge } from "@/features/reviews/RatingStars";
import { useLocationReviews } from "@/features/reviews/api";
import { useListing, useLocationTerminals, type ListingDetail } from "@/features/listing/api";
import { useSavedListings } from "@/features/search/useSavedListings";
import { useFaqCombined, type FaqCombinedItem } from "@/features/faqs/api";
import { FaqList } from "@/features/faqs/FaqList";
import { groupFaqsByScope } from "@/features/faqs/FaqList.logic";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { optimizedImageUrl } from "@/lib/storage";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CANCELLATION_POLICY_LINES } from "@/features/bookings/cancellation.logic";
import { GUARANTEE_PROMISE } from "@/features/guarantee/copy";
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

  // TLDR-first (E3.2): resumo extraível gerado dos dados da unidade. Alimenta apenas a meta
  // description e o JSON-LD (description) — extração por IA, sem bloco visível na página.
  // Reusa a query de terminais do bloco "Distância aos terminais" (cache, sem fetch extra).
  const { data: terminals } = useLocationTerminals(listing?.location.id);
  const tldr = listing
    ? buildListingTldr(listing, { nearest: nearestTerminal(terminals ?? []) })
    : null;

  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");
  const dest = searchParams.get("dest");
  const initialFrom = fromStr ? new Date(fromStr) : null;
  const initialTo = toStr ? new Date(toStr) : null;

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
  const pageDesc =
    tldr?.summary ??
    (listing
      ? `Reserve ${listing.parking_type.name} em ${listing.location.name}. ${listing.location.address ?? ""}`
      : "");
  const pageUrl = listing
    ? `https://hub.movepark.co/p/${listing.company.slug}/${listing.location.slug}/${listing.parking_type.code}`
    : "";
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
      <div className="mx-auto w-full max-w-[1280px] px-4 py-6 desktop:px-8">
        <Skeleton className="mb-6 h-6 w-32" />
        <Skeleton className="mb-3 h-8 w-2/3" />
        <Skeleton className="mb-6 h-4 w-1/2" />
        <Skeleton className="mb-8 h-[420px] w-full rounded-md" />
        <div className="grid grid-cols-1 gap-8 desktop:grid-cols-[1fr_400px]">
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
      <div className="mx-auto w-full max-w-[1280px] px-4 py-12 desktop:px-8">
        <div className="rounded-md border border-error bg-badge-cancelled-bg p-4 text-body-sm text-error">
          {(error as Error).message}
        </div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="mx-auto w-full max-w-[1280px] px-4 py-12 desktop:px-8">
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
  const hasShuttle =
    listing.location.shuttle_to_terminal_minutes != null ||
    listing.location.shuttle_frequency_minutes != null;
  const shuttleMin = listing.location.shuttle_to_terminal_minutes;

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-8 desktop:px-8">
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
        <script type="application/ld+json">
          {JSON.stringify(localBusinessSchema(listing, { description: tldr?.summary }))}
        </script>
        <script type="application/ld+json">
          {JSON.stringify(productOfferSchema(listing, schemaReviews, { description: tldr?.summary }))}
        </script>
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
        <div className="space-y-2">
          <h1 className="text-display-xl text-ink">{listing.company.name}</h1>
          <p className="text-display-sm text-muted">{listing.parking_type.name}</p>

          {/* Social proof row */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <RatingBadge
              avg={listing.location.review_avg}
              count={listing.location.review_count}
              href="#avaliacoes"
            />

            {listing.location.address && (
              <div className="flex items-center gap-1.5 text-body-sm text-muted">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="line-clamp-1">{listing.location.address}</span>
              </div>
            )}

            {hasShuttle && (
              <div className="flex items-center gap-1.5 text-body-sm text-muted">
                <Bus className="h-3.5 w-3.5 shrink-0" />
                <span>
                  Transfer{shuttleMin ? ` em ${shuttleMin} min` : " gratuito"}
                </span>
              </div>
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

      {/* Galeria de fotos */}
      <PhotoGrid title={listing.location.name} photoUrls={listing.location.photos} />

      {/* Mobile: card de reserva logo após as fotos */}
      <div ref={mobileCardRef} className="mt-6 desktop:hidden">
        <ReservationCard
          listing={listing}
          initialFrom={initialFrom}
          initialTo={initialTo}
        />
      </div>

      {/* Corpo em 2 colunas */}
      <div className="mt-10 grid grid-cols-1 gap-12 desktop:grid-cols-[1fr_400px]">
        <div className="space-y-10">

          {/* Descrição e tipo de vaga */}
          {hasDescription && (
            <>
              <section className="space-y-3">
                {(listing.capacity ?? 0) > 0 && (
                  <div className="flex items-center gap-1.5 text-body-md text-muted">
                    <Car className="h-4 w-4 shrink-0" />
                    <span>{listing.capacity} vagas</span>
                  </div>
                )}
                {listing.parking_type.description && (
                  <p className="text-body-md text-body">{listing.parking_type.description}</p>
                )}
              </section>
              <Separator />
            </>
          )}

          {/* O que essa vaga oferece — cards visuais */}
          {hasAmenities && (
            <>
              <section className="space-y-5">
                <h2 className="text-display-sm text-ink">O que essa vaga oferece</h2>
                <AmenityList amenities={listing.amenities} />
              </section>
              <Separator />
            </>
          )}

          {/* Como chegar */}
          <section className="space-y-4" id="como-chegar">
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

          {/* Avaliações — sempre visível; ReviewsBlock mostra empty state quando count = 0 */}
          <Separator />
          <ListingReviewsSection
            locationId={listing.location.id}
            reviewCount={listing.location.review_count}
          />

          <Separator />

          {/* FAQ */}
          <ListingFaqSection items={faqItems} isLoading={faqLoading} />

          <Separator />

          {/* O que você deve saber — 3 colunas: cancelamento + garantia + estacionamento */}
          <ListingKnowSection listing={listing} />
        </div>

        {/* Card lateral sticky */}
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

      {/* Carrossel de recomendados */}
      {dest && fromStr && toStr && (
        <>
          <Separator className="mt-10" />
          <div className="mt-10">
            <RecommendedCarousel
              currentLocationId={listing.location.id}
              dest={dest}
              from={fromStr}
              to={toStr}
              searchParams={searchParams}
            />
          </div>
        </>
      )}

      {/* Sticky CTA mobile */}
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
  const [allOpen, setAllOpen] = React.useState(false);

  if (!isLoading && (items ?? []).length === 0) return null;

  const groups = items ? groupFaqsByScope(items) : null;
  const inlineItems = groups ? [...groups.location, ...groups.destination] : undefined;
  const hasGlobal = (groups?.global.length ?? 0) > 0;
  const totalCount = (items ?? []).length;

  return (
    <section className="space-y-4" id="faq">
      <h2 className="text-display-sm text-ink">Perguntas frequentes</h2>

      {/* Só perguntas específicas do estacionamento/destino inline */}
      <FaqList
        items={isLoading ? undefined : (inlineItems?.length ? inlineItems : items)}
        isLoading={isLoading}
      />

      {/* Link para abrir todas as perguntas */}
      {!isLoading && hasGlobal && (
        <button
          type="button"
          onClick={() => setAllOpen(true)}
          className="flex items-center gap-1 text-body-sm font-medium text-mp-indigo underline-offset-2 hover:underline"
        >
          Ver todas as {totalCount} perguntas frequentes
          <ArrowRight className="h-4 w-4" />
        </button>
      )}

      <Dialog open={allOpen} onOpenChange={setAllOpen}>
        <DialogContent className="max-h-[70vh] max-w-3xl overflow-y-auto px-12 py-10">
          <FaqList items={items} groupByScope />
        </DialogContent>
      </Dialog>
    </section>
  );
}

type ListingReviewsSectionProps = {
  locationId: string;
  reviewCount: number;
};

function ListingReviewsSection({ locationId, reviewCount }: ListingReviewsSectionProps) {
  if (reviewCount > 0) {
    return <ReviewsBlock locationId={locationId} totalCount={reviewCount} />;
  }

  return (
    <section id="avaliacoes" className="scroll-mt-24 space-y-4">
      <h2 className="text-display-sm text-ink">Avaliações</h2>
      <div className="flex flex-col items-center gap-3 rounded-md border border-hairline bg-surface-soft py-10 text-center">
        <div className="flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star key={n} className="h-6 w-6 text-hairline" />
          ))}
        </div>
        <p className="text-body-md font-medium text-ink">Seja o primeiro a avaliar</p>
        <p className="max-w-xs text-body-sm text-muted">
          As avaliações aparecem aqui após a conclusão das reservas. Reserve e compartilhe sua
          experiência.
        </p>
      </div>
    </section>
  );
}

function ListingKnowSection({ listing }: { listing: ListingDetail }) {
  const years = Math.max(
    1,
    Math.floor((Date.now() - new Date(listing.company.created_at).getTime()) / (1000 * 60 * 60 * 24 * 365)),
  );

  const columns = [
    {
      icon: <CalendarX className="h-7 w-7 text-ink" />,
      title: "Política de cancelamento",
      lines: CANCELLATION_POLICY_LINES,
      extra: listing.location.reservation_policy ?? null,
    },
    {
      icon: <ShieldCheck className="h-7 w-7 text-ink" />,
      title: "Garantia Movepark",
      lines: [
        GUARANTEE_PROMISE,
        "Se faltar vaga na chegada, realocamos e cobrimos a diferença — ou devolvemos 100% + crédito.",
      ],
      extra: null,
    },
    {
      icon: <Building2 className="h-7 w-7 text-ink" />,
      title: listing.company.name,
      lines: [
        `Parceiro Movepark há ${years} ${years === 1 ? "ano" : "anos"}.`,
        listing.other_locations.length > 0
          ? `${listing.other_locations.length} outra${listing.other_locations.length > 1 ? "s" : ""} unidade${listing.other_locations.length > 1 ? "s" : ""} disponível.`
          : null,
      ].filter((l): l is string => l != null),
      extra: null,
      badge: true,
    },
  ] as const;

  return (
    <section className="space-y-6">
      <h2 className="text-display-sm text-ink">O que você deve saber</h2>
      <div className="grid grid-cols-1 gap-8 tablet:grid-cols-3 tablet:divide-x tablet:divide-hairline">
        {columns.map((col, i) => (
          <div key={i} className={cn("space-y-3", i > 0 && "tablet:pl-8")}>
            {col.icon}
            <div className="flex items-center gap-2">
              <p className="text-body-md font-semibold text-ink">{col.title}</p>
              {"badge" in col && col.badge && (
                <span className="inline-flex items-center gap-1 rounded-full bg-mp-pale px-2 py-0.5 text-caption-sm text-mp-indigo">
                  <BadgeCheck className="h-3 w-3" />
                  Verificado
                </span>
              )}
            </div>
            <ul className="space-y-1">
              {col.lines.map((line, j) => (
                <li key={j} className="text-body-sm text-body">{line}</li>
              ))}
              {col.extra && (
                <li className="text-body-sm text-muted">{col.extra}</li>
              )}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
