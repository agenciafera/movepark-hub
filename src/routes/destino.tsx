import * as React from "react";
import { Link, useLoaderData, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { OgImage } from "@/lib/ogImage";
import { MapPin } from "@phosphor-icons/react";
import type { Destination, ProspectCard as ProspectCardData } from "@/types/domain";
import {
  useDestinationBySlug,
  useDestinationProspects,
  usePublishedDestinations,
} from "@/features/destinations/api";
import { ProspectCard } from "@/features/destinations/ProspectCard";
import { useSearchResults, type SearchResultItem } from "@/features/search/useSearchResults";
import { useFaqCombined, type FaqCombinedItem } from "@/features/faqs/api";
import { FaqList } from "@/features/faqs/FaqList";
import { ResultCard } from "@/features/search/ResultCard";
import { useSavedListings } from "@/features/search/useSavedListings";
import { computeResultBadges } from "@/features/search/searchBadges";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { GoogleMapEmbed } from "@/components/shared/GoogleMapEmbed";
import { breadcrumbSchema, destinationSchema, faqSchema, itemListSchema } from "@/lib/jsonld";
import {
  destinationHeading,
  destinationListHeading,
  destinationTitle,
  faqHeading,
  locationHeading,
  shuttleHeading,
  topRatedHeading,
} from "@/lib/seo";
import { imageSrcSet, optimizedImageUrl } from "@/lib/storage";
import { formatBRL } from "@/lib/format";
import { lowestPerDay, pickRelatedDestinations, pickTopRated } from "./destino.logic";

const SITE_URL = "https://hub.movepark.co";

/** Skeleton espelhando o ResultCard (mesma forma/altura), evita salto de layout. */
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

/**
 * O que `destinoLoader` entrega, tudo já no HTML do build: o destino, as unidades vendáveis,
 * os lotes mapeados e o FAQ mesclado (ADR-002). `units` é a semente da lista; a busca com
 * datas a substitui no cliente. `faqs` nulo significa que o fetch do build falhou e o hook
 * do cliente cobre.
 */
type DestinoLoaderData = {
  destination: Destination;
  prospects: ProspectCardData[];
  units?: SearchResultItem[];
  faqs?: FaqCombinedItem[] | null;
} | null;

export default function DestinoPage() {
  const params = useParams();
  const loaded = useLoaderData() as DestinoLoaderData;
  // Mesmo favorito da /search e da home: o coração aqui grava em `profile_saved` e leva o
  // anônimo pro login guardando a intenção. Sem isso o card do destino é o mesmo componente
  // com o coração inerte, e o visitante clica achando que salvou.
  const saved = useSavedListings();
  const loaderDest = loaded?.destination ?? null;
  // No SSG/loader já vem o destino; no client (nav) o hook cobre.
  const slug = params.slug;
  const query = useDestinationBySlug(loaderDest ? undefined : slug);
  const destination = loaderDest ?? query.data ?? null;

  const win = React.useMemo(defaultWindow, []);
  // `price_mode: "from"` porque a janela aqui é nossa, não do cliente: sem ele, quem exige
  // estadia mínima maior que a janela some da vitrine, e um destino inteiro pode ficar vazio
  // com unidades ativas no catálogo (foi o caso de Abbapark e Nationpark em Afonso Pena).
  const search = useSearchResults(
    destination
      ? { dest: destination.code, from: win.from, to: win.to, sort: "price_asc", price_mode: "from", limit: 12 }
      : null,
  );
  // Curadoria "Mais bem avaliados" (08.6): só unidades já avaliadas, por nota desc.
  const topSearch = useSearchResults(
    destination
      ? {
          dest: destination.code,
          from: win.from,
          to: win.to,
          sort: "rating_desc",
          min_rating: 1,
          price_mode: "from",
          limit: 4,
        }
      : null,
  );
  // FAQ em camadas (ADR-002): global + destination, mesclado/deduplicado no edge.
  // No SSG o loader já trouxe (as respostas têm que estar no HTML do build);
  // o hook cobre só quando o loader não entregou.
  const loadedFaqs = loaded?.faqs ?? null;
  const faqsQuery = useFaqCombined({
    destinationId: destination?.id,
    enabled: !loadedFaqs && !!destination,
  });
  const faqData = loadedFaqs ?? faqsQuery.data;
  const faqLoading = !loadedFaqs && faqsQuery.isLoading;
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

  const title = destination.meta_title ?? destinationTitle(destination);
  const description =
    destination.meta_description ??
    `Reserve estacionamento próximo a ${destination.name}, em ${destination.city}. Compare preços, comodidades e garanta sua vaga com antecedência.`;
  const canonical = `${SITE_URL}/destinos/${destination.slug}`;
  // Imagem otimizada (resize/transform do Supabase). O og:image é 1.91:1 (1200×630,
  // padrão de card social); pro JSON-LD damos também a versão quadrada (1:1), porque o
  // Google aceita múltiplas proporções e prefere ter 16:9/4:3/1:1. Tudo gerado on-the-fly
  // pelo endpoint de resize, sem precisar subir um asset quadrado separado.
  const heroUrl = destination.hero_image_url;
  const ogImage = optimizedImageUrl(heroUrl, { width: 1200, height: 630, resize: "cover" });
  const squareImage = optimizedImageUrl(heroUrl, { width: 1200, height: 1200, resize: "cover" });
  // 1ª imagem = original (canônica, full-res, sem /transform); seguida das versões
  // recortadas 1.91:1 e 1:1. O Google aceita múltiplas proporções e trata a 1ª como
  // principal, e por isso a original vem na frente.
  const schemaImages = heroUrl
    ? ([heroUrl, ogImage, squareImage].filter(Boolean) as string[])
    : undefined;
  // A busca com datas manda quando responde; até lá vale a semente do build. As duas usam
  // o id do location_parking_type como chave, então o React reaproveita o DOM em vez de
  // trocar o bloco inteiro na frente de quem está lendo.
  const results = search.data?.results ?? loaded?.units ?? [];
  const prospectItems = loaded?.prospects ?? prospects.data ?? [];
  // ItemList espelhando exatamente o que está visível, na mesma ordem: primeiro as unidades
  // vendáveis, depois os lotes mapeados. Espelhar importa porque dado estruturado que
  // descreve algo que a página não mostra é o que o Google trata como spam. Só nome e URL:
  // preço e disponibilidade dependem de data e não podem ser afirmados num HTML congelado
  // (ADR-009).
  const listaSchema = [
    ...results.map((r) => ({
      name: `${r.operator.name} · ${r.parking_type.name}`,
      url: `${SITE_URL}/p/${r.operator.slug}/${r.location.slug}/${r.parking_type.code}`,
    })),
    ...prospectItems.map((p) => ({
      name: p.name,
      url: `${SITE_URL}/estacionamentos/${destination.slug}/${p.slug}`,
    })),
  ];
  const fromPrice = lowestPerDay(results);
  const related = pickRelatedDestinations(allDestinations.data ?? [], destination.id, 6);
  // Mesma regra nas duas fontes: a busca já vem por nota, a semente do build vem por preço.
  const topResults = pickTopRated(topSearch.data?.results ?? loaded?.units ?? [], 4);
  // Um card por tipo de vaga, o MESMO card da busca (ResultCard): um único modelo de card entre
  // home, busca e destino (E2.1.3).
  // A janela só entra no href DEPOIS que a busca do cliente responde. `defaultWindow()`
  // roda no build, e assar um D+7 do dia do deploy dentro do link deixaria todo card
  // apontando para uma data vencida até o próximo build.
  const searchWindowParams = search.data
    ? new URLSearchParams({ dest: destination.code, from: win.from, to: win.to })
    : new URLSearchParams({ dest: destination.code });
  const faqItems = (faqData ?? []).map((f) => ({ question: f.question, answer: f.answer }));
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
        {listaSchema.length > 0 && (
          <script type="application/ld+json">{JSON.stringify(itemListSchema(listaSchema))}</script>
        )}
        {faqItems.length > 0 && (
          <script type="application/ld+json">{JSON.stringify(faqSchema(faqItems))}</script>
        )}
      </Helmet>
      {/* Destino sem hero cai na imagem da MARCA, nunca na de destinos.

          A de destinos é uma paisagem de aeroporto, e paisagem afirma geografia: a
          primeira versão tinha litoral, e o card de Goiânia (a 800 km do mar, e hoje
          o único destino sem hero) passou a mostrar praia. Foto de aeroporto que não
          é aquele aeroporto engana mesmo sendo genérica, então aqui vale a imagem que
          não afirma lugar nenhum. */}
      {!ogImage && <OgImage area="marca" />}

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
            {destinationHeading(destination)}
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
              {topRatedHeading(destination)}
            </h2>
            <div className="grid grid-cols-1 gap-5 tablet:grid-cols-2 desktop:grid-cols-3">
              {topResults.map((r) => (
                <ResultCard
                  key={`top-${r.id}`}
                  item={r}
                  isSaved={saved.isSaved(r.id)}
                  onToggleSave={() => saved.toggle(r.id)}
                  searchParams={searchWindowParams}
                  source="destino"
                />
              ))}
            </div>
          </section>
        )}

        {/* Estacionamentos */}
        <section className="mt-10">
          <h2 className="mb-4 text-balance text-display-md text-ink">
            {destinationListHeading(destination)}
          </h2>
          {/* Skeleton só quando de fato não se sabe nada ainda. No HTML do build o loader já
              respondeu: se ele trouxe zero unidade, o destino não tem reserva online e o
              certo é mandar a frase que explica isso, não 41 caixas cinzas. Sem loader
              (navegação no cliente) o skeleton continua valendo. */}
          {search.isLoading && results.length === 0 && !loaded?.units ? (
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
                  isSaved={saved.isSaved(r.id)}
                  onToggleSave={() => saved.toggle(r.id)}
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
              <h2 className="text-balance text-display-md text-ink">{shuttleHeading(destination)}</h2>
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
          <h2 className="mb-4 text-display-md text-ink">{locationHeading(destination)}</h2>
          <GoogleMapEmbed
            title={`Mapa de ${destination.name}`}
            target={{ latitude: destination.latitude, longitude: destination.longitude }}
            zoom={13}
            className="h-80 w-full rounded-md border border-hairline"
          />
        </section>

        {/* FAQ — camadas destino + global (ADR-002), mesmo componente de listing.tsx/faq.tsx */}
        {(faqLoading || faqItems.length > 0) && (
          <section className="mt-10">
            <h2 className="mb-4 text-display-md text-ink">{faqHeading(destination)}</h2>
            <FaqList
              items={faqLoading ? undefined : faqData}
              isLoading={faqLoading}
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
