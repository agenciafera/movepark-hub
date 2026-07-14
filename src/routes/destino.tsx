import * as React from "react";
import { Link, useLoaderData, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { MapPin } from "lucide-react";
import type { Destination } from "@/types/domain";
import { useDestinationBySlug, usePublishedDestinations } from "@/features/destinations/api";
import { useSearchResults } from "@/features/search/useSearchResults";
import { useFaqCombined } from "@/features/faqs/api";
import { FaqList } from "@/features/faqs/FaqList";
import { GroupedResultCard } from "@/features/search/GroupedResultCard";
import { groupResultsByLocation } from "@/features/search/useSearchResults";
import { computeGroupedResultBadges } from "@/features/search/searchBadges";
import { topRated } from "@/features/reviews/reviews.logic";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { breadcrumbSchema, destinationSchema, faqSchema } from "@/lib/jsonld";
import { imageSrcSet, optimizedImageUrl } from "@/lib/storage";
import { formatBRL } from "@/lib/format";
import { lowestPerDay, pickRelatedDestinations } from "./destino.logic";

const SITE_URL = "https://hub.movepark.co";

/** Skeleton espelhando o GroupedResultCard (mesma forma/altura) — evita salto de layout. */
function ParkingCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-hairline bg-canvas">
      <Skeleton className="aspect-[4/3] w-full rounded-none" />
      <div className="flex flex-col gap-3 p-5">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <div className="flex gap-1.5">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
        <Skeleton className="mt-1 h-7 w-24" />
      </div>
    </div>
  );
}

// Janela padrão (D+7 por 2 dias) só para listar preços "a partir de".
function defaultWindow() {
  const from = new Date();
  from.setDate(from.getDate() + 7);
  from.setHours(12, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 2);
  return { from: from.toISOString(), to: to.toISOString() };
}

export default function DestinoPage() {
  const params = useParams();
  const loaderDest = useLoaderData() as Destination | null;
  // No SSG/loader já vem o destino; no client (nav) o hook cobre.
  const slug = params.slug;
  const query = useDestinationBySlug(loaderDest ? undefined : slug);
  const destination = loaderDest ?? query.data ?? null;

  const win = React.useMemo(defaultWindow, []);
  const search = useSearchResults(
    destination ? { dest: destination.code, from: win.from, to: win.to, sort: "price_asc", limit: 12 } : null,
  );
  // Curadoria "Mais bem avaliados" (08.6): só unidades já avaliadas, por nota desc.
  const topSearch = useSearchResults(
    destination
      ? { dest: destination.code, from: win.from, to: win.to, sort: "rating_desc", min_rating: 1, limit: 4 }
      : null,
  );
  // FAQ em camadas (ADR-002): global + destination, mesclado/deduplicado no edge.
  const faqs = useFaqCombined({ destinationId: destination?.id, enabled: !!destination });
  // Destinos publicados p/ cross-link (internal linking entre /destinos).
  const allDestinations = usePublishedDestinations();

  if (!destination) {
    if (query.isLoading) {
      return (
        <div className="mx-auto w-full max-w-5xl px-4 py-10">
          <Skeleton className="h-48 w-full" />
        </div>
      );
    }
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16">
        <EmptyState
          icon={<MapPin className="h-10 w-10" />}
          title="Destino não encontrado"
          description="Esse destino não existe ou não está publicado."
          action={
            <Link to="/search" className="text-mp-primary underline">
              Buscar estacionamentos
            </Link>
          }
        />
      </div>
    );
  }

  const title = destination.meta_title ?? `Estacionamento em ${destination.name} | Movepark`;
  const description =
    destination.meta_description ??
    `Reserve estacionamento próximo a ${destination.name}, em ${destination.city}. Compare preços, comodidades e garanta sua vaga com antecedência.`;
  const canonical = `${SITE_URL}/destinos/${destination.slug}`;
  // Imagem otimizada (resize/transform do Supabase). O og:image é 1.91:1 (1200×630,
  // padrão de card social); pro JSON-LD damos também a versão quadrada (1:1), porque o
  // Google aceita múltiplas proporções e prefere ter 16:9/4:3/1:1. Tudo gerado on-the-fly
  // pelo endpoint de resize — não precisa subir um asset quadrado separado.
  const heroUrl = destination.hero_image_url;
  const ogImage = optimizedImageUrl(heroUrl, { width: 1200, height: 630, resize: "cover" });
  const squareImage = optimizedImageUrl(heroUrl, { width: 1200, height: 1200, resize: "cover" });
  // 1ª imagem = original (canônica, full-res, sem /transform); seguida das versões
  // recortadas 1.91:1 e 1:1. O Google aceita múltiplas proporções e trata a 1ª como
  // principal — por isso a original vem na frente.
  const schemaImages = heroUrl
    ? ([heroUrl, ogImage, squareImage].filter(Boolean) as string[])
    : undefined;
  const results = search.data?.results ?? [];
  const fromPrice = lowestPerDay(results);
  const related = pickRelatedDestinations(allDestinations.data ?? [], destination.id, 6);
  const topResults = topRated(topSearch.data?.results ?? []);
  // Agrupa por localização e usa o MESMO card da busca (GroupedResultCard) — um único
  // modelo de card entre home, busca e destino.
  const grouped = groupResultsByLocation(results);
  const topGrouped = groupResultsByLocation(topResults);
  const searchWindowParams = new URLSearchParams({
    dest: destination.code,
    from: win.from,
    to: win.to,
  });
  const faqItems = (faqs.data ?? []).map((f) => ({ question: f.question, answer: f.answer }));
  const lat = Number(destination.latitude);
  const lng = Number(destination.longitude);
  const bboxD = 0.03;
  const osm = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - bboxD}%2C${lat - bboxD}%2C${lng + bboxD}%2C${lat + bboxD}&layer=mapnik&marker=${lat}%2C${lng}`;

  return (
    <>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonical} />
        <meta name="twitter:card" content={ogImage ? "summary_large_image" : "summary"} />
        {ogImage && <meta property="og:image" content={ogImage} />}
        {ogImage && <meta property="og:image:type" content="image/jpeg" />}
        {ogImage && <meta property="og:image:width" content="1200" />}
        {ogImage && <meta property="og:image:height" content="630" />}
        {ogImage && <meta property="og:image:alt" content={`Estacionamento em ${destination.name}`} />}
        {ogImage && <meta name="twitter:image" content={ogImage} />}
        <script type="application/ld+json">
          {JSON.stringify(
            destinationSchema({ ...destination, latitude: lat, longitude: lng, image: schemaImages }),
          )}
        </script>
        <script type="application/ld+json">
          {JSON.stringify(
            breadcrumbSchema([
              { name: "Início", url: SITE_URL },
              { name: "Destinos", url: `${SITE_URL}/destinos` },
              { name: destination.name, url: canonical },
            ]),
          )}
        </script>
        {faqItems.length > 0 && (
          <script type="application/ld+json">{JSON.stringify(faqSchema(faqItems))}</script>
        )}
      </Helmet>

      <article className="mx-auto w-full max-w-5xl px-4 py-8 tablet:py-12">
        {/* Breadcrumb (espelha o BreadcrumbList do JSON-LD, agora visível) */}
        <nav aria-label="Trilha de navegação" className="mb-4">
          <ol className="flex flex-wrap items-center gap-1.5 text-body-sm text-muted">
            <li>
              <Link to="/" className="hover:text-ink">
                Início
              </Link>
            </li>
            <li aria-hidden className="text-muted-steel">
              ›
            </li>
            <li>
              <Link to="/destinos" className="hover:text-ink">
                Destinos
              </Link>
            </li>
            <li aria-hidden className="text-muted-steel">
              ›
            </li>
            <li aria-current="page" className="text-ink">
              {destination.short_name ?? destination.name}
            </li>
          </ol>
        </nav>

        {/* Hero */}
        <header className="flex flex-col gap-3">
          <span className="text-badge uppercase text-muted-steel">
            {destination.city}
            {destination.state ? ` · ${destination.state}` : ""}
          </span>
          <h1 className="text-display-xl text-ink">
            Estacionamento em {destination.short_name ?? destination.name}
          </h1>
          {destination.intro ? (
            <div className="space-y-3 text-body-md text-muted">
              {destination.intro.split(/\n{2,}/).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          ) : (
            <p className="text-body-md text-muted">{description}</p>
          )}
          {fromPrice != null && (
            <p className="text-body-md text-ink">
              A partir de <strong className="text-display-sm">{formatBRL(fromPrice)}</strong>
              <span className="text-muted"> / diária</span>
            </p>
          )}
        </header>

        {heroUrl && (
          <img
            src={optimizedImageUrl(heroUrl, { width: 1024 })}
            srcSet={imageSrcSet(heroUrl, [640, 1024, 1536])}
            sizes="(min-width: 1024px) 1024px, 100vw"
            alt={destination.name}
            width={1024}
            height={439}
            className="mt-6 aspect-[21/9] w-full rounded-md object-cover"
            loading="eager"
            fetchPriority="high"
            decoding="async"
          />
        )}

        {/* Mais bem avaliados (curadoria) */}
        {topGrouped.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-4 text-display-md text-ink">
              Mais bem avaliados em {destination.short_name ?? destination.name}
            </h2>
            <div className="grid grid-cols-1 gap-5 tablet:grid-cols-2 desktop:grid-cols-3">
              {topGrouped.map((g) => (
                <GroupedResultCard
                  key={`top-${g.location_id}`}
                  item={g}
                  isSaved={false}
                  onToggleSave={() => {}}
                  searchParams={searchWindowParams}
                  source="destino"
                />
              ))}
            </div>
          </section>
        )}

        {/* Estacionamentos */}
        <section className="mt-10">
          <h2 className="mb-4 text-display-md text-ink">Estacionamentos em {destination.short_name ?? destination.name}</h2>
          {search.isLoading ? (
            <div className="grid grid-cols-1 gap-5 tablet:grid-cols-2 desktop:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <ParkingCardSkeleton key={i} />
              ))}
            </div>
          ) : grouped.length === 0 ? (
            <EmptyState title="Nenhum estacionamento disponível para esse destino ainda." />
          ) : (
            <div className="grid grid-cols-1 gap-5 tablet:grid-cols-2 desktop:grid-cols-3">
              {grouped.map((g) => (
                <GroupedResultCard
                  key={g.location_id}
                  item={g}
                  isSaved={false}
                  onToggleSave={() => {}}
                  searchParams={searchWindowParams}
                  source="destino"
                  badges={computeGroupedResultBadges(g, grouped)}
                />
              ))}
            </div>
          )}
          <div className="mt-4">
            <Link
              to={`/search?dest=${destination.code}`}
              className="text-body-sm font-medium text-mp-primary underline"
            >
              Ver todos os estacionamentos e escolher datas →
            </Link>
          </div>
        </section>

        {/* Mapa */}
        <section className="mt-10">
          <h2 className="mb-4 text-display-md text-ink">Localização</h2>
          <iframe
            title={`Mapa de ${destination.name}`}
            src={osm}
            className="h-80 w-full rounded-md border border-hairline"
            loading="lazy"
          />
        </section>

        {/* FAQ — camadas destino + global (ADR-002), mesmo componente de listing.tsx/faq.tsx */}
        {(faqs.isLoading || faqItems.length > 0) && (
          <section className="mt-10">
            <h2 className="mb-4 text-display-md text-ink">Perguntas frequentes</h2>
            <FaqList
              items={faqs.isLoading ? undefined : faqs.data}
              isLoading={faqs.isLoading}
              groupByScope
              destinationLabel={`Sobre ${destination.short_name ?? destination.name}`}
            />
          </section>
        )}

        {/* Outros destinos — internal linking entre páginas de destino */}
        {related.length > 0 && (
          <section className="mt-12 border-t border-hairline pt-8">
            <h2 className="mb-4 text-display-md text-ink">Estacionamento em outros destinos</h2>
            <ul className="flex flex-wrap gap-2">
              {related.map((d) => (
                <li key={d.id}>
                  <Link
                    to={`/destinos/${d.slug}`}
                    className="inline-flex items-center rounded-full border border-hairline px-3 py-1.5 text-body-sm text-ink transition hover:border-mp-primary hover:text-mp-primary"
                  >
                    {d.short_name ?? d.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
    </>
  );
}
