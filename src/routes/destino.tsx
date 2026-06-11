import * as React from "react";
import { Link, useLoaderData, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { MapPin } from "lucide-react";
import type { Destination } from "@/types/domain";
import { useDestinationBySlug } from "@/features/destinations/api";
import { useSearchResults } from "@/features/search/useSearchResults";
import { useFaqs } from "@/features/faqs/api";
import { ResultCard } from "@/features/search/ResultCard";
import { topRated } from "@/features/reviews/reviews.logic";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { breadcrumbSchema, destinationSchema, faqSchema } from "@/lib/jsonld";

const SITE_URL = "https://hub.movepark.co";

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
  const faqs = useFaqs({ scope: "global" });

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
  const results = search.data?.results ?? [];
  const topResults = topRated(topSearch.data?.results ?? []);
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
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonical} />
        {destination.hero_image_url && <meta property="og:image" content={destination.hero_image_url} />}
        <script type="application/ld+json">
          {JSON.stringify(destinationSchema({ ...destination, latitude: lat, longitude: lng }))}
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
        {/* Hero */}
        <header className="flex flex-col gap-3">
          <span className="text-[11px] font-bold uppercase tracking-[0.4px] text-muted-steel">
            {destination.city}
            {destination.state ? ` · ${destination.state}` : ""}
          </span>
          <h1 className="text-display-xl text-ink">
            Estacionamento em {destination.short_name ?? destination.name}
          </h1>
          {destination.intro ? (
            <div className="max-w-3xl space-y-3 text-body-md text-muted">
              {destination.intro.split(/\n{2,}/).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          ) : (
            <p className="max-w-3xl text-body-md text-muted">{description}</p>
          )}
        </header>

        {destination.hero_image_url && (
          <img
            src={destination.hero_image_url}
            alt={destination.name}
            className="mt-6 aspect-[21/9] w-full rounded-md object-cover"
            loading="lazy"
          />
        )}

        {/* Mais bem avaliados (curadoria) */}
        {topResults.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-4 text-display-md text-ink">
              Mais bem avaliados em {destination.short_name ?? destination.name}
            </h2>
            <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
              {topResults.map((item) => (
                <ResultCard
                  key={`top-${item.id}`}
                  item={item}
                  isSaved={false}
                  onToggleSave={() => {}}
                  searchParams={new URLSearchParams({ dest: destination.code, from: win.from, to: win.to })}
                />
              ))}
            </div>
          </section>
        )}

        {/* Estacionamentos */}
        <section className="mt-10">
          <h2 className="mb-4 text-display-md text-ink">Estacionamentos em {destination.short_name ?? destination.name}</h2>
          {search.isLoading ? (
            <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-44 w-full" />
              ))}
            </div>
          ) : results.length === 0 ? (
            <EmptyState title="Nenhum estacionamento disponível para esse destino ainda." />
          ) : (
            <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
              {results.map((item) => (
                <ResultCard
                  key={item.id}
                  item={item}
                  isSaved={false}
                  onToggleSave={() => {}}
                  searchParams={new URLSearchParams({ dest: destination.code, from: win.from, to: win.to })}
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

        {/* FAQ */}
        {faqItems.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-4 text-display-md text-ink">Perguntas frequentes</h2>
            <div className="flex flex-col divide-y divide-hairline rounded-md border border-hairline">
              {faqItems.map((f, i) => (
                <details key={i} className="group p-4">
                  <summary className="cursor-pointer list-none text-title-sm text-ink">{f.question}</summary>
                  <p className="mt-2 text-body-sm text-muted">{f.answer}</p>
                </details>
              ))}
            </div>
          </section>
        )}
      </article>
    </>
  );
}
