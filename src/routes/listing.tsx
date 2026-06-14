import { Link, useLoaderData, useParams, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, Building2, MapPin, Heart } from "lucide-react";
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
import { useFaqCombined } from "@/features/faqs/api";
import { FaqList } from "@/features/faqs/FaqList";
import { formatBRL } from "@/lib/format";
import { optimizedImageUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";
import {
  localBusinessSchema,
  productOfferSchema,
  breadcrumbSchema,
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

  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");
  const initialFrom = fromStr ? new Date(fromStr) : null;
  const initialTo = toStr ? new Date(toStr) : null;

  const pageTitle = listing
    ? `${listing.parking_type.name} — ${listing.location.name} | Movepark`
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
          description="Pode ter sido removida pela operadora. Volte pra busca."
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

  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 py-6 desktop:px-8">
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
          <h1 className="text-display-lg text-ink">
            {listing.parking_type.name} · {listing.company.name} {listing.location.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-body-md text-muted">
            <RatingBadge
              avg={listing.location.review_avg}
              count={listing.location.review_count}
              href="#avaliacoes"
            />
            {(listing.location.review_count ?? 0) > 0 && <span>·</span>}
            <Building2 className="h-4 w-4" />
            <span>Operada por {listing.company.name}</span>
            {listing.location.address && (
              <>
                <span>·</span>
                <MapPin className="h-4 w-4" />
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
          <Heart className={cn("h-4 w-4", isSaved ? "fill-mp-red stroke-mp-red" : "")} />
          <span className="hidden tablet:inline">{isSaved ? "Salvo" : "Salvar"}</span>
        </button>
      </div>

      {/* Photo grid */}
      <PhotoGrid title={listing.location.name} photoUrls={listing.location.photos} />

      {/* Body 2-col */}
      <div className="mt-8 grid grid-cols-1 gap-12 desktop:grid-cols-[1fr_360px]">
        <div className="space-y-8">
          {/* Sub-header */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-body-md text-ink">
              <strong>{listing.parking_type.name}</strong>
              <span className="text-muted">·</span>
              <span className="text-muted">{listing.capacity} vagas disponíveis</span>
              <span className="text-muted">·</span>
              <span className="text-muted">
                Preço base {formatBRL(listing.company_parking_type.base_price)}
              </span>
            </div>
            {listing.parking_type.description && (
              <p className="text-body-md text-body">{listing.parking_type.description}</p>
            )}
          </section>

          <Separator />

          {/* O que oferece */}
          <section className="space-y-4">
            <h2 className="text-display-sm text-ink">O que essa vaga oferece</h2>
            <AmenityList amenities={listing.amenities} />
          </section>

          <Separator />

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

          {/* FAQ — global + da unidade */}
          <ListingFaqSection locationId={listing.location.id} />

          <Separator />

          {/* Operadora */}
          <section className="space-y-4">
            <h2 className="text-display-sm text-ink">Conheça a operadora</h2>
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

      {/* Mobile/tablet: card no fim do conteúdo */}
      <div className="mt-12 desktop:hidden">
        <ReservationCard
          listing={listing}
          initialFrom={initialFrom}
          initialTo={initialTo}
        />
      </div>
    </div>
  );
}

function ListingFaqSection({ locationId }: { locationId: string }) {
  const { data, isLoading } = useFaqCombined({ locationId });
  if (!isLoading && (data ?? []).length === 0) return null;
  return (
    <section className="space-y-4">
      <h2 className="text-display-sm text-ink">Perguntas frequentes</h2>
      <FaqList items={data} isLoading={isLoading} groupByScope />
    </section>
  );
}
