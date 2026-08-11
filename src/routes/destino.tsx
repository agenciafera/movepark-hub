import * as React from "react";
import { Link, useLoaderData, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { MapPin } from "@phosphor-icons/react";
import type { Destination, ProspectCard as ProspectCardData } from "@/types/domain";
import {
  useDestinationBySlug,
  useDestinationProspects,
  usePublishedDestinations,
} from "@/features/destinations/api";
import { ProspectCard } from "@/features/destinations/ProspectCard";
import { useSearchResults } from "@/features/search/useSearchResults";
import { useFaqCombined } from "@/features/faqs/api";
import { FaqList } from "@/features/faqs/FaqList";
import { ResultCard } from "@/features/search/ResultCard";
import { computeResultBadges } from "@/features/search/searchBadges";
import { topRated } from "@/features/reviews/reviews.logic";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { GoogleMapEmbed } from "@/components/shared/GoogleMapEmbed";
import { breadcrumbSchema, destinationSchema, faqSchema } from "@/lib/jsonld";
import { imageSrcSet, optimizedImageUrl } from "@/lib/storage";
import { formatBRL } from "@/lib/format";
import { lowestPerDay, pickRelatedDestinations } from "./destino.logic";

const SITE_URL = "https://hub.movepark.co";

/** Skeleton espelhando o ResultCard (mesma forma/altura) — evita salto de layout. */
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

/** O que `destinoLoader` entrega: o destino e os lotes mapeados, já no HTML do build. */
type DestinoLoaderData = { destination: Destination; prospects: ProspectCardData[] } | null;

export default function DestinoPage() {
  const params = useParams();
  const loaded = useLoaderData() as DestinoLoaderData;
  const loaderDest = loaded?.destination ?? null;
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
  // Lotes MAPEADOS (E0.17-d): seção própria, abaixo da vendável. Leitura separada de
  // propósito, porque o lado vendável vem da Edge `search`, com preço e disponibilidade,
  // e um `union all` em SQL teria que largar isso para caber na mesma linha.
  //
  // No SSG o loader já trouxe (o selo precisa estar no HTML do build); o hook cobre a
  // navegação no cliente, e por isso só dispara quando o loader não entregou.
  const prospects = useDestinationProspects(loaded ? undefined : destination?.slug);

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
  const prospectItems = loaded?.prospects ?? prospects.data ?? [];
  const fromPrice = lowestPerDay(results);
  const related = pickRelatedDestinations(allDestinations.data ?? [], destination.id, 6);
  const topResults = topRated(topSearch.data?.results ?? []);
  // Um card por tipo de vaga, o MESMO card da busca (ResultCard): um único modelo de card entre
  // home, busca e destino (E2.1.3).
  const searchWindowParams = new URLSearchParams({
    dest: destination.code,
    from: win.from,
    to: win.to,
  });
  const faqItems = (faqs.data ?? []).map((f) => ({ question: f.question, answer: f.answer }));
  // O JSON-LD pede número; o banco entrega `numeric`, que chega como string.
  const lat = Number(destination.latitude);
  const lng = Number(destination.longitude);

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
          <h1 className="text-balance text-display-xl text-ink">
            Estacionamento em {destination.short_name ?? destination.name}
          </h1>
          {destination.intro ? (
            <div className="space-y-3 text-pretty text-body-md text-muted">
              {destination.intro.split(/\n{2,}/).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          ) : (
            <p className="text-pretty text-body-md text-muted">{description}</p>
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
        {topResults.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-4 text-balance text-display-md text-ink">
              Mais bem avaliados em {destination.short_name ?? destination.name}
            </h2>
            <div className="grid grid-cols-1 gap-5 tablet:grid-cols-2 desktop:grid-cols-3">
              {topResults.map((r) => (
                <ResultCard
                  key={`top-${r.id}`}
                  item={r}
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
          <h2 className="mb-4 text-balance text-display-md text-ink">Estacionamentos em {destination.short_name ?? destination.name}</h2>
          {search.isLoading ? (
            <div className="grid grid-cols-1 gap-5 tablet:grid-cols-2 desktop:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <ParkingCardSkeleton key={i} />
              ))}
            </div>
          ) : results.length === 0 ? (
            // Em destino novo (REC, NVT, CNF, GIG, SDU) a seção vendável vazia é o caso
            // NORMAL, não a exceção: o texto aponta para a seção de baixo quando ela
            // existe, em vez de deixar a página parecendo quebrada.
            <EmptyState
              title={`Ainda não temos reserva online em ${destination.short_name ?? destination.name}`}
              description={
                prospectItems.length > 0
                  ? "Os estacionamentos que mapeamos na região estão logo abaixo."
                  : undefined
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-5 tablet:grid-cols-2 desktop:grid-cols-3">
              {results.map((r) => (
                <ResultCard
                  key={r.id}
                  item={r}
                  isSaved={false}
                  onToggleSave={() => {}}
                  searchParams={searchWindowParams}
                  source="destino"
                  badges={computeResultBadges(r, results)}
                />
              ))}
            </div>
          )}
          {/* O CTA fica mesmo com a lista vazia, e isso é decisão, não descuido:
              `results` vazio também é "o destino tem unidades, mas nenhuma livre na
              janela padrão de D+7". Esconder o link nessa hora tiraria justamente o
              "escolher datas" de quem precisa dele. Em destino sem nenhuma unidade (REC),
              o custo é uma busca vazia; no outro caso, o custo seria um beco. */}
          <div className="mt-4">
            <Link
              to={`/search?dest=${destination.code}`}
              className="text-body-sm font-medium text-mp-primary underline"
            >
              Ver todos os estacionamentos e escolher datas →
            </Link>
          </div>
        </section>

        {/* Lotes MAPEADOS (E0.17-d): seção própria, sempre ABAIXO da vendável.
            A separação e a ordem são o produto que o parceiro compra: presença é de
            graça, conversão é paga. Cada clique que um card mapeado rouba de um parceiro
            ativo no mesmo aeroporto é GMV que já era nossa, trocada por nada. Por isso as
            duas seções nunca se misturam numa lista só, e nunca paginam juntas: a
            proporção varia demais (em Confins vão ser 7 mapeados e 0 vendáveis, em GRU o
            inverso). */}
        {prospectItems.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-1 text-balance text-display-md text-ink">
              Outros estacionamentos na região
            </h2>
            <p className="mb-4 text-body-md text-muted">
              Mapeamos estes estacionamentos. Ainda não dá para reservar pela Movepark.
            </p>
            <ul className="grid grid-cols-1 gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
              {prospectItems.map((p) => (
                <ProspectCard key={p.id} item={p} destinationSlug={destination.slug} />
              ))}
            </ul>
          </section>
        )}

        {/* Como funciona o traslado (educativo, com ilustração da marca) */}
        <section className="mt-10">
          <div className="grid grid-cols-1 items-center gap-6 rounded-lg bg-mp-pale p-6 tablet:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] desktop:gap-10 desktop:p-8">
            <img
              src="/illustrations/il-traslado-shuttle.webp"
              alt=""
              className="mx-auto h-40 w-auto tablet:mx-0"
            />
            <div>
              <h2 className="text-balance text-display-md text-ink">Como funciona o traslado</h2>
              <p className="mt-3 text-body-md text-body">
                Você deixa o carro no estacionamento parceiro e um transfer leva você até o
                terminal. Na volta, é só avisar que ele passa te buscar. O tempo e a frequência
                ficam na página de cada estacionamento.
              </p>
            </div>
          </div>
        </section>

        {/* Mapa */}
        <section className="mt-10">
          <h2 className="mb-4 text-display-md text-ink">Localização</h2>
          <GoogleMapEmbed
            title={`Mapa de ${destination.name}`}
            target={{ latitude: destination.latitude, longitude: destination.longitude }}
            zoom={13}
            className="h-80 w-full rounded-md border border-hairline"
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
            <h2 className="mb-4 text-balance text-display-md text-ink">Estacionamento em outros destinos</h2>
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
