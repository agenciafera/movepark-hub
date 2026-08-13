import * as React from "react";
import { Link, useLoaderData, useParams, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, ArrowRight, Buildings, Bus, CalendarX, Car, Heart, MapPin, SealCheck, ShieldCheck, Star } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/shared/EmptyState";
import { PhotoGrid } from "@/features/listing/PhotoGrid";
import { AmenityList } from "@/features/listing/AmenityList";
import { HowToArrive } from "@/features/listing/HowToArrive";
import { TerminalDistances } from "@/features/listing/TerminalDistances";
import { ReservationCard } from "@/features/listing/ReservationCard";
import { ListingStickyBar } from "@/features/listing/ListingStickyBar";
import type { ReservationSummary } from "@/features/listing/reservation.logic";
import { ListingTrustBar } from "@/features/listing/ListingTrustBar";
import { RecommendedCarousel } from "@/features/listing/RecommendedCarousel";
import { buildListingTldr, nearestTerminal } from "@/features/listing/tldr.logic";
import { ReviewsBlock } from "@/features/reviews/ReviewsBlock";
import { RatingBadge } from "@/features/reviews/RatingStars";
import { useLocationReviews } from "@/features/reviews/api";
import { useListing, useLocationTerminals, useLocationTypePrices, type ListingDetail } from "@/features/listing/api";
import { useSavedListings } from "@/features/search/useSavedListings";
import { useFaqCombined, type FaqCombinedItem } from "@/features/faqs/api";
import { FaqList } from "@/features/faqs/FaqList";
import { groupFaqsByScope } from "@/features/faqs/FaqList.logic";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { optimizedImageUrl } from "@/lib/storage";
import { parkingTitle } from "@/lib/parkingName";
import { listingDescription, listingHeading, listingTitle } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { CANCELLATION_POLICY_LINES_GENERIC } from "@/features/bookings/cancellation.logic";
import { isTypeDescriptorAmenity } from "@/features/search/amenities.logic";
import { UpgradeVagaNudge } from "@/features/listing/UpgradeVagaNudge";
import { pickUpgradeTarget } from "@/features/listing/upgrade.logic";
import { GUARANTEE_PROMISE } from "@/features/guarantee/copy";
import { getLocationCapabilities } from "@/features/listing/capabilities";
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
  // O JSON-LD tem que dizer o mesmo que a página. Se a nota sai da tela e continua no schema,
  // o Google exibe no resultado de busca uma avaliação que a unidade não mostra, e o
  // ADR-009 vale para o que a Movepark publica, não só para o que renderiza.
  const schemaReviews: SchemaReview[] = getLocationCapabilities(listing?.location).reviews
    ? (reviews ?? []).map((r) => ({
        author: r.author_name,
        rating: r.rating,
        comment: r.comment,
        date: r.created_at,
      }))
    : [];

  const { data: faqItems, isLoading: faqLoading } = useFaqCombined({
    locationId: listing?.location.id,
    enabled: !!listing?.location.id,
  });

  // TLDR-first (E3.2): resumo extraível gerado dos dados da unidade. Alimenta apenas a meta
  // description e o JSON-LD (description): extração por IA, sem bloco visível na página.
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
  // Nasce visível no mobile: preço é a informação nº 1 da decisão e não pode exigir
  // scroll. O observer abaixo só a ESCONDE quando o card de reserva já está na tela.
  const [showStickyBar, setShowStickyBar] = React.useState(true);
  // Resumo vivo do card de reserva do mobile pra alimentar o CTA fixo com o total real.
  const [summary, setSummary] = React.useState<ReservationSummary | null>(null);

  // Upsell de upgrade de vaga (E2.1.4): preços de todos os tipos da unidade pra mesma duração.
  // Sem datas escolhidas o card reporta days = 0, e 0 passaria pelo `??` e desligaria as queries de
  // preço (que exigem days > 0). Então só vale a duração do card quando ela é positiva; senão cai
  // nas datas da URL e, na falta delas, em 1 diária (o nudge ainda mostra um delta real).
  const summaryDays = summary?.days && summary.days > 0 ? summary.days : null;
  const upsellDays =
    summaryDays ??
    (initialFrom && initialTo
      ? Math.max(1, Math.ceil((initialTo.getTime() - initialFrom.getTime()) / 86_400_000))
      : 1);
  const { types: typePrices } = useLocationTypePrices({
    companySlug: params.operatorSlug,
    locationSlug: params.locationSlug,
    days: upsellDays,
  });

  React.useEffect(() => {
    const el = mobileCardRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => setShowStickyBar(!entry.isIntersecting),
      // rootMargin encolhe a base da viewport em 35%: o card de reserva só conta como
      // "à vista" quando sobe pro miolo da tela, não quando apenas espia no rodapé no
      // load. Assim a barra nasce visível (card ainda embaixo) e some só quando o card
      // está de fato na tela, onde o CTA próprio dele assume.
      { threshold: 0, rootMargin: "0px 0px -35% 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [listing]);

  // Título, H1 e descrição saem de @/lib/seo, que é onde mora a razão da forma. Resumo
  // curto: a marca da unidade abre o título (785 cliques do período vêm de consulta de
  // marca de parceiro) e o tipo de vaga fecha, que é o que faz as três páginas da mesma
  // unidade deixarem de disputar entre si.
  const seoArgs = listing
    ? {
        companyName: listing.company.name,
        parkingTypeName: listing.parking_type.name,
        destination: listing.location.destination,
        locationName: listing.location.name,
      }
    : null;
  const pageTitle = seoArgs ? listingTitle(seoArgs) : "Estacionamento | Movepark";
  const pageDesc =
    tldr?.summary ??
    (seoArgs && listing
      ? listingDescription({ ...seoArgs, city: listing.location.destination?.city ?? null })
      : "");
  const pageUrl = listing
    ? `https://hub.movepark.co/p/${listing.company.slug}/${listing.location.slug}/${listing.parking_type.code}`
    : "";
  const ogImage =
    listing && listing.location.photos[0]
      ? optimizedImageUrl(listing.location.photos[0], { width: 1200, height: 630, resize: "cover" })
      : undefined;

  // Mesma regra para a FAQ: um único FAQPage por página, com as respostas idênticas às
  // visíveis (ADR-002). Na unidade externa a global não aparece, então não pode ir no schema.
  const faqForSchema = getLocationCapabilities(listing?.location).globalFaq
    ? faqItems
    : (faqItems ?? []).filter((f) => f.scope !== "global");
  const faqSchemaData =
    faqForSchema && faqForSchema.length > 0
      ? faqSchema(faqForSchema.map((f) => ({ question: f.question, answer: f.answer })))
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
  // ADR-009: tudo que promete condição de transação passa por aqui. Fato da unidade (fotos,
  // endereço, amenidades, shuttle, distância) segue renderizando sempre.
  const caps = getLocationCapabilities(listing.location);
  // Só sobe: pickUpgradeTarget devolve o próximo tipo mais caro, ou null se já é o topo (E2.1.4).
  // Na unidade externa o upsell sai junto: ele empurra para outro tipo de vaga que também fecha
  // fora, com preço que o Hub não cobra.
  const upgradeTarget = caps.hubCheckout ? pickUpgradeTarget(listing.parking_type.code, typePrices) : null;
  const upgradeNudge = upgradeTarget ? (
    <UpgradeVagaNudge
      target={upgradeTarget}
      to={`/p/${params.operatorSlug}/${params.locationSlug}/${upgradeTarget.code}?${searchParams.toString()}`}
    />
  ) : null;
  const hasDescription = (listing.capacity ?? 0) > 0 || !!listing.parking_type.description;
  // A página é por tipo de vaga: descritores de tipo (Coberto, Valet…) saem da lista de amenidades,
  // senão contradizem o próprio tipo do card (86ajmwawc).
  const amenities = listing.amenities.filter((a) => !isTypeDescriptorAmenity(a.code));
  const hasAmenities = amenities.length > 0;
  const hasShuttle =
    listing.location.shuttle_to_terminal_minutes != null ||
    listing.location.shuttle_frequency_minutes != null;
  const shuttleMin = listing.location.shuttle_to_terminal_minutes;

  return (
    <>
      {/* Vaga garantida, cancelamento grátis e preço travado: as três são promessa de
          transação, e nenhuma é nossa quando a reserva fecha fora. */}
      {caps.guaranteedSpot && <ListingTrustBar />}
      {/* pb no mobile reserva a altura da barra fixa de preço (que agora nasce
          visível), pra o fim do conteúdo não ficar atrás dela. No desktop a barra
          não existe, então volta ao py-8. */}
      <div className="mx-auto w-full max-w-[1280px] px-4 pt-8 pb-[calc(5.5rem+var(--safe-bottom))] desktop:px-8 desktop:pb-8">
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
              { name: "House", url: "https://hub.movepark.co" },
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
          {/* Empresa · unidade, o mesmo título do card que trouxe o cliente até aqui e o
              mesmo do <title>/JSON-LD. Só a empresa deixava três unidades da Aerovalet
              com H1 idêntico. */}
          <h1 className="text-balance text-display-xl text-ink">
            {seoArgs ? listingHeading(seoArgs) : parkingTitle(listing.company.name, listing.location.name)}
          </h1>
          <p className="text-display-sm text-muted">{listing.parking_type.name}</p>

          {/* Social proof row */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {/* Sem reserva no Hub não há avaliação nossa. Renderizar o chip mostraria nota
                de um histórico que não se aplica mais a esta unidade. */}
            {caps.reviews && (
              <RatingBadge
                avg={listing.location.review_avg}
                count={listing.location.review_count}
                href="#avaliacoes"
              />
            )}

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
        {upgradeNudge && <div className="mb-3">{upgradeNudge}</div>}
        <ReservationCard
          listing={listing}
          initialFrom={initialFrom}
          initialTo={initialTo}
          onSummaryChange={setSummary}
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
                  <p data-testid="listing-type-description" className="text-body-md text-body">
                    {listing.parking_type.description}
                  </p>
                )}
              </section>
              <Separator />
            </>
          )}

          {/* O que essa vaga oferece: cards visuais */}
          {hasAmenities && (
            <>
              <section className="space-y-5">
                <h2 className="text-display-sm text-ink">O que essa vaga oferece</h2>
                <AmenityList amenities={amenities} />
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
              placeId={listing.location.google_place_id}
              notice={listing.location.notice}
              hasNotice={listing.location.has_notice}
              directionsText={listing.location.directions_text}
              shuttleFrequencyMinutes={listing.location.shuttle_frequency_minutes}
              shuttleToTerminalMinutes={listing.location.shuttle_to_terminal_minutes}
            />
            <TerminalDistances locationId={listing.location.id} />
          </section>

          {/* Avaliações: na unidade própria fica sempre visível, e o ReviewsBlock mostra o
              empty state quando count = 0. Na externa o bloco inteiro sai, inclusive quando
              existe avaliação histórica: ela veio de reserva feita no Hub, num arranjo que não
              vale mais para esta unidade. */}
          {caps.reviews && (
            <>
              <Separator />
              <ListingReviewsSection
                locationId={listing.location.id}
                reviewCount={listing.location.review_count}
                reviewAvg={listing.location.review_avg}
              />
            </>
          )}

          <Separator />

          {/* FAQ. Na unidade externa só o escopo dela: a global responde por cancelamento,
              pagamento e reserva pela Movepark, que não é o que acontece aqui. */}
          <ListingFaqSection
            items={faqItems}
            isLoading={faqLoading}
            includeGlobal={caps.globalFaq}
          />

          <Separator />

          {/* O que você deve saber, em 3 colunas: cancelamento + garantia + estacionamento */}
          <ListingKnowSection listing={listing} />
        </div>

        {/* Card lateral sticky */}
        <aside className="hidden desktop:block">
          <div className="sticky top-24 space-y-3">
            {upgradeNudge}
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

      {/* Sticky CTA mobile: espelha o total real da reserva (referência Airbnb) */}
      {showStickyBar && (
        <ListingStickyBar
          summary={summary}
          basePrice={listing.company_parking_type.base_price}
          onReserve={() =>
            mobileCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
        />
      )}
      </div>
    </>
  );
}

type ListingFaqSectionProps = {
  /** Falso na unidade externa: a FAQ global promete o que o Hub cumpre. */
  includeGlobal?: boolean;
  items: FaqCombinedItem[] | undefined;
  isLoading: boolean;
};

function ListingFaqSection({ items, isLoading, includeGlobal = true }: ListingFaqSectionProps) {
  const [allOpen, setAllOpen] = React.useState(false);

  const groupsAll = items ? groupFaqsByScope(items) : null;
  // Filtra antes de qualquer contagem: senão o "Ver todas as N perguntas" prometeria um
  // número que inclui as globais escondidas.
  const visibleItems = includeGlobal
    ? items
    : groupsAll
      ? [...groupsAll.location, ...groupsAll.destination]
      : items;

  if (!isLoading && (visibleItems ?? []).length === 0) return null;

  const groups = visibleItems ? groupFaqsByScope(visibleItems) : null;
  const inlineItems = groups ? [...groups.location, ...groups.destination] : undefined;
  const hasGlobal = (groups?.global.length ?? 0) > 0;
  const totalCount = (visibleItems ?? []).length;

  return (
    <section className="space-y-4" id="faq">
      <h2 className="text-display-sm text-ink">Perguntas frequentes</h2>

      {/* Só perguntas específicas do estacionamento/destino inline */}
      <FaqList
        items={isLoading ? undefined : (inlineItems?.length ? inlineItems : visibleItems)}
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
          <FaqList items={visibleItems} groupByScope />
        </DialogContent>
      </Dialog>
    </section>
  );
}

type ListingReviewsSectionProps = {
  locationId: string;
  reviewCount: number;
  reviewAvg: number | null;
};

function ListingReviewsSection({ locationId, reviewCount, reviewAvg }: ListingReviewsSectionProps) {
  if (reviewCount > 0) {
    return <ReviewsBlock locationId={locationId} totalCount={reviewCount} avg={reviewAvg} />;
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

/**
 * "O que você deve saber" (ADR-009).
 *
 * Na unidade externa as duas primeiras colunas saem, porque quem cumpre cancelamento e
 * garantia é o parceiro. A terceira, que já é sobre ele, assume a declaração de
 * responsabilidade: o bloco deixa de dizer "o que a Movepark garante" e passa a dizer "quem
 * responde por esta reserva", sem deixar buraco no grid.
 */
function ListingKnowSection({ listing }: { listing: ListingDetail }) {
  const caps = getLocationCapabilities(listing.location);
  const outras = listing.other_locations.length;

  const linhasParceiro = caps.hubCheckout
    ? [
        // O selo já diz "Verificado"; esta linha diz o que isso significa, sem prometer
        // transação. O tempo de casa saiu: não agrega confiança e deixava a coluna com
        // uma linha só na maioria das empresas, que tem unidade única.
        "Estacionamento aprovado pela Movepark antes de entrar na busca.",
        outras > 0
          ? `${outras} outra${outras > 1 ? "s" : ""} unidade${outras > 1 ? "s" : ""} disponível.`
          : null,
      ]
    : [
        `A reserva desta unidade é feita e administrada por ${listing.company.name}, no site do próprio estacionamento.`,
        "Cancelamento, alteração e atendimento durante a estadia seguem as condições do estacionamento.",
        "As garantias da Movepark não se aplicam a esta reserva.",
      ];

  const columns = [
    caps.cancellation
      ? {
          icon: <CalendarX className="h-7 w-7 text-ink" />,
          title: "Política de cancelamento",
          lines: CANCELLATION_POLICY_LINES_GENERIC,
          extra: listing.location.reservation_policy ?? null,
        }
      : null,
    caps.guaranteedSpot
      ? {
          icon: <ShieldCheck className="h-7 w-7 text-ink" />,
          title: "Garantia Movepark",
          lines: [
            GUARANTEE_PROMISE,
            "Se faltar vaga na chegada, realocamos e cobrimos a diferença, ou devolvemos 100% + crédito.",
          ],
          extra: null,
        }
      : null,
    {
      icon: <Buildings className="h-7 w-7 text-ink" />,
      title: listing.company.name,
      lines: linhasParceiro.filter((l): l is string => l != null),
      extra: null,
      badge: true,
    },
  ].filter((c): c is NonNullable<typeof c> => c != null);

  return (
    <section className="space-y-6">
      <h2 className="text-display-sm text-ink">O que você deve saber</h2>
      <div
        className={cn(
          "grid grid-cols-1 gap-8 tablet:divide-x tablet:divide-hairline",
          columns.length === 3 && "tablet:grid-cols-3",
          columns.length === 2 && "tablet:grid-cols-2",
          // Uma coluna só (unidade externa): largura de leitura, não a faixa inteira.
          columns.length === 1 && "max-w-[640px]",
        )}
      >
        {columns.map((col, i) => (
          <div key={i} className={cn("space-y-3", i > 0 && "tablet:pl-8")}>
            {col.icon}
            <div className="flex items-center gap-2">
              <p className="text-body-md font-semibold text-ink">{col.title}</p>
              {"badge" in col && col.badge && (
                <span className="inline-flex items-center gap-1 rounded-full bg-mp-pale px-2 py-0.5 text-caption-sm text-mp-indigo">
                  <SealCheck className="h-3 w-3" />
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
