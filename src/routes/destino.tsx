import * as React from "react";
import { Link, useLoaderData, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { OgImage } from "@/lib/ogImage";
import {
  LANG_HTML,
  LOCALE_PADRAO,
  caminhoLocalizado,
  canonicalDoIdioma,
  LOCALES,
  OG_LOCALE,
  clusterHreflang,
  type Locale,
} from "@/lib/i18n";
import { headings } from "@/lib/i18nHeadings";
import { LocaleProvider } from "@/lib/LocaleContext";
import { textos } from "@/lib/i18nTextos";
import type { DestinoTraduzido, IdiomaDoDestino } from "@/features/destinations/i18nApi";
import { MapPin } from "@phosphor-icons/react";
import type {
  Destination,
  DestinationPoint,
  ProspectCard as ProspectCardData,
} from "@/types/domain";
import {
  useDestinationBySlug,
  useDestinationProspects,
  usePublishedDestinations,
} from "@/features/destinations/api";
import { useSearchResults, type SearchResultItem } from "@/features/search/useSearchResults";
import { useFaqCombined, type FaqCombinedItem } from "@/features/faqs/api";
import { FaqList } from "@/features/faqs/FaqList";
import { ResultCard } from "@/features/search/ResultCard";
import { useSavedListings } from "@/features/search/useSavedListings";
import { computeResultBadges } from "@/features/search/searchBadges";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { GoogleMapEmbed } from "@/components/shared/GoogleMapEmbed";
import {
  breadcrumbSchema,
  webPageSchema,
  destinationOffersSchema,
  destinationSchema,
  faqSchema,
} from "@/lib/jsonld";
import {
  destinationTitle,
  proximityAnchorLabel,
  seoLabelPrimary,
} from "@/lib/seo";
import { getLocationCapabilities } from "@/features/listing/capabilities";
import type { PriceDestination } from "@/features/price-index/priceIndex.logic";
import { carUnits } from "@/features/price-index/priceIndex.logic";
import { isSnapshotFresh, pickCardBadge } from "@/features/reviews/google.logic";
import {
  DestinationPriceTable,
  DestinationProximity,
} from "@/features/destinations/DestinationPrices";
import { DestinationKeyQuestions } from "@/features/destinations/DestinationKeyQuestions";
import { accordionQuestions, keyQuestions } from "@/features/destinations/keyQuestions.logic";
import { DestinationHero } from "@/features/destinations/DestinationHero";
import {
  buildDestinoPrices,
  destinationMetaDescription,
  pesquisadoRows,
  proximityRanking,
  type ProximityProspect,
} from "@/features/destinations/destinoPrices.logic";
import { optimizedImageUrl } from "@/lib/storage";
import { formatBRL } from "@/lib/format";
import {
  lowestMatrixDaily,
  lowestPerDay,
  pickRelatedDestinations,
  pointsSummary,
} from "./destino.logic";
import { SITE_URL } from "@/lib/site";
import { caminhoDestino, caminhoFicha } from "@/lib/urls";

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

/** Container da página. Uma largura só, a de app (1280), como manda a skill. */
const CALHA = "mx-auto w-full max-w-[1280px] px-4 desktop:px-8";

/** Uma linha da ficha do destino, ao lado do texto de abertura. */
function Ficha({ itens }: { itens: { rotulo: string; valor: React.ReactNode }[] }) {
  if (itens.length === 0) return null;
  return (
    <dl className="flex w-full flex-col rounded-md border border-hairline bg-canvas px-6 desktop:w-[320px] desktop:shrink-0">
      {itens.map((i) => (
        <div
          key={i.rotulo}
          className="flex items-baseline justify-between gap-4 border-b border-hairline-soft py-4 last:border-b-0"
        >
          <dt className="text-body-sm text-muted">{i.rotulo}</dt>
          <dd className="text-right text-title-md tabular-nums text-ink">{i.valor}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * O que `destinoLoader` entrega, tudo já no HTML do build: o destino, as unidades vendáveis,
 * os lotes mapeados e o FAQ mesclado (ADR-002). `units` é a semente da lista; a busca com
 * datas a substitui no cliente. `faqs` nulo significa que o fetch do build falhou e o hook
 * do cliente cobre.
 */
type RelatedDestination = {
  id: string;
  name: string;
  short_name: string | null;
  /** Necessário para o card do cross-link sair com "Aeroporto <X>", o bigrama da busca. */
  seo_label: string | null;
  type: string | null;
  slug: string;
  public_slug?: string | null;
  is_popular?: boolean | null;
  sort_order?: number | null;
};

type DestinoLoaderData = {
  destination: Destination;
  prospects: ProspectCardData[];
  units?: SearchResultItem[];
  faqs?: FaqCombinedItem[] | null;
  /** Matriz do motor de preços para este destino; null quando não há parceiro precificado. */
  priceDestination?: PriceDestination | null;
  /** Destinos publicados, para o cross-link sair no HTML do build. */
  related?: RelatedDestination[];
  /** Terminais/píeres do destino, para a ficha de abertura. */
  points?: Pick<DestinationPoint, "id" | "name">[];
  /** Posts publicados do destino, para o "leia também" sair no HTML do build. */
  posts?: { slug: string; title: string; excerpt: string | null }[];
  /**
   * Idiomas em que este destino já tem tradução publicada, COM o slug de cada um.
   *
   * O slug viaja junto porque o `hreflang` precisa da URL final. A primeira versão
   * carregava só o idioma e a página montava o caminho com o slug português para
   * todos, e o cluster foi ao ar apontando para URL inexistente.
   */
  idiomas?: IdiomaDoDestino[];
  /** Idioma desta URL. Vem do caminho, nunca de cabeçalho: a URL é o contrato. */
  locale?: Locale;
  /** A tradução desta página, quando a URL é de idioma traduzido. */
  traducao?: DestinoTraduzido | null;
  /** Momento em que o build consultou o motor. */
  generatedAt?: string;
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
  // O slug público é o que entra na URL; o antigo segue no banco como histórico.
  const destinoSlug = (destination?.public_slug ?? destination?.slug ?? "") as string;

  const win = React.useMemo(defaultWindow, []);
  // `price_mode: "from"` porque a janela aqui é nossa, não do cliente: sem ele, quem exige
  // estadia mínima maior que a janela some da vitrine, e um destino inteiro pode ficar vazio
  // com unidades ativas no catálogo (foi o caso de Abbapark e Nationpark em Afonso Pena).
  const search = useSearchResults(
    destination
      ? {
          dest: destination.code,
          from: win.from,
          to: win.to,
          sort: "price_asc",
          price_mode: "from",
          limit: 12,
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
  // Lotes MAPEADOS (E0.17-d): entram na lista de proximidade, marcados. Leitura separada
  // de propósito, porque o lado vendável vem da Edge `search`, com preço e disponibilidade,
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

  // Idioma desta URL e o texto da casca nele. `traducao` só existe em URL de idioma
  // traduzido, e só quando a linha está publicada (a RLS é o portão).
  const locale: Locale = loaded?.locale ?? LOCALE_PADRAO;
  const traducao = loaded?.traducao ?? null;
  // Em português os cabeçalhos vêm de `@/lib/seo`, onde cada variação é decisão medida
  // no Search Console; o dicionário serve aos idiomas traduzidos.
  const T = textos(locale);
  const H = headings(locale, destination, traducao?.seo_label ?? undefined);

  const title = traducao?.meta_title?.trim() || destination.meta_title || destinationTitle(destination);
  // O caminho público em português, nunca o slug interno: /destinos/<slug> responde 301
  // de volta pra cá, e canonical apontando pra URL que redireciona é loop que derruba a
  // indexação. Este é também o `x-default` e a âncora `pt-BR` do cluster.
  const canonicalPt = `${SITE_URL}${caminhoDestino(destinoSlug)}`;
  /*
    A canônica é a DA PRÓPRIA PÁGINA, sempre.

    Até 26/09/2026 esta linha devolvia o caminho português em qualquer idioma, então cada
    página traduzida declarava ser duplicata da portuguesa. Num cluster de `hreflang` o
    Google exige autocanonicalização: canônica cruzada diz "não indexe esta, indexe aquela",
    e o efeito seria apagar as 44 páginas traduzidas do índice. O defeito estava no ar desde
    a primeira delas, porque na época eu conferi o `hreflang` e não o canonical.
  */
  const canonical = canonicalDoIdioma({
    familia: "destino",
    locale,
    canonicalPt,
    slugTraduzido: traducao?.slug,
    origem: SITE_URL,
  });

  // Cluster de hreflang. Só entra idioma cuja tradução está publicada (a RLS filtra
  // na origem), e a lista sempre inclui a própria página mais o `x-default` no
  // português. Destino sem tradução não emite cluster nenhum: hreflang de um item só
  // é ruído, e apontar para tradução inexistente faz o buscador desconfiar do grupo
  // inteiro, inclusive do original.
  const idiomas = loaded?.idiomas ?? [];
  const hreflangs = clusterHreflang([
    { locale: LOCALE_PADRAO, caminho: canonicalPt },
    ...idiomas.map((l) => ({
      locale: l.locale,
      caminho: `${SITE_URL}${caminhoLocalizado({ familia: "destino", slug: l.slug, locale: l.locale })}`,
    })),
  ]);
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
  const points = loaded?.points ?? [];

  // Bloco de preço: a matriz 1/7/15/30 do motor, a mesma de /precos/<slug>.
  const priceDest = loaded?.priceDestination ?? null;
  const prices = priceDest ? buildDestinoPrices(priceDest) : null;
  const generatedAt = loaded?.generatedAt ?? null;

  // Lote mapeado com preço pesquisado entra na MESMA tabela, em grupo próprio. É o que
  // faz a seção "quanto custa" existir em destino sem parceiro (ADR-009/ADR-010).
  const pesquisados = pesquisadoRows(prospectItems, destinoSlug);

  // Endereço do parceiro vem da vitrine, não da matriz: o motor não carrega endereço.
  const addressByLocation = new Map(
    results.map((r) => [`${r.operator.slug}/${r.location.slug}`, r.location.address ?? null]),
  );

  // A nota do Google do lote mapeado só sobrevive 30 dias, e esta página é a única em
  // que ninguém mais confere: o loader roda no BUILD, então o HTML sai congelado com o
  // resultado do dia do deploy. Sem o filtro aqui, uma página construída no dia 0
  // continuaria mostrando nota do Google no dia 31.
  const prospectRows: ProximityProspect[] = prospectItems.map((p) => {
    const fresco = !!p.google_fetched_at && isSnapshotFresh(p.google_fetched_at);
    const badge = pickCardBadge(
      { avg: null, count: 0 },
      fresco ? { rating: p.google_rating, count: p.google_rating_count } : null,
    );
    return {
      name: p.name,
      slug: p.slug,
      // O caminho vem PRONTO da RPC. Sem estas duas linhas o ranking montava
      // `/estacionamentos/<slug legado do destino>/<slug legado do lote>`, que não é rota:
      // no clique dentro do app não há requisição HTTP, o 301 do Worker nunca roda e a
      // pessoa cai em "Vaga não encontrada". Eram os 131 links da lista de distância.
      public_path: p.public_path,
      public_slug: p.public_slug,
      address: p.address,
      distance_km: p.distance_km,
      reference_name: p.reference_name,
      rating: badge ? { avg: badge.avg, count: badge.count } : null,
    };
  });

  // Ranking de distância medido no banco (PostGIS, ADR-001), juntando parceiro e lote
  // mapeado. Sem matriz do motor não há distância de parceiro, e a lista fica só com os
  // mapeados, que é melhor do que sumir com a seção inteira.
  const proximity = proximityRanking({
    units: priceDest?.units ?? [],
    prospects: prospectRows,
    destinationSlug: destinoSlug,
    // Em idioma traduzido o sufixo vem do dicionário; em português, do `seo.ts`,
    // que distingue aeroporto de rodoviária.
    anchorLabel:
      locale === LOCALE_PADRAO
        ? proximityAnchorLabel(destination)
        : proximityAnchorLabel(destination)
          ? T.doTerminal
          : null,
    addressByLocation,
  });

  // Espelha exatamente o que está visível, na mesma ordem: unidades vendáveis primeiro,
  // lotes mapeados depois. A LISTA sai da vitrine (`results`), não da matriz de preço, para
  // o schema continuar descrevendo a tela mesmo quando o motor não respondeu no build.
  // A faixa de preço é opcional em cada item e só entra quando a matriz cobre aquela vaga,
  // que é a mesma que a tabela renderiza logo acima: nunca um cálculo paralelo.
  const matrixByKey = new Map(
    (priceDest ? carUnits(priceDest.units) : []).map((u) => [
      `${u.company_slug}/${u.location_slug}/${u.parking_type_code}`,
      u,
    ]),
  );
  const partnerOffers = results.map((r) => {
    const u = matrixByKey.get(`${r.operator.slug}/${r.location.slug}/${r.parking_type.code}`);
    const totais = (u?.prices ?? [])
      .map((p) => p.total)
      .filter((t): t is number => t != null && t > 0);
    return {
      name: r.operator.name,
      variant: r.parking_type.name,
      url: r.location.public_path ?? "",
      description: `Estacionamento perto do ${seoLabelPrimary(destination)}, em ${destination.city}.`,
      // A capa que o card ao lado já mostra. `image` é recomendado no Product, e sem ele o
      // Search Console acusa aviso em cada item da lista.
      image: r.location.cover_image,
      price:
        totais.length > 0
          ? {
              lowPrice: Math.min(...totais),
              highPrice: Math.max(...totais),
              offerCount: totais.length,
              // Vaga garantida depende de o Hub controlar o estoque (ADR-009). Em unidade
              // com checkout externo quem controla é o parceiro, então o schema cala sobre
              // disponibilidade em vez de afirmar InStock.
              guaranteedSpot: getLocationCapabilities({ checkout_mode: u?.checkout_mode })
                .guaranteedSpot,
            }
          : null,
    };
  });
  const offersSchema =
    partnerOffers.length > 0 || prospectItems.length > 0
      ? destinationOffersSchema({
          partners: partnerOffers,
          mapped: prospectItems.map((p) => ({
            name: p.name,
            url: p.public_path ?? caminhoFicha(destinoSlug, p.public_slug ?? p.slug),
          })),
          // O mesmo carimbo que a nota de procedência mostra na tela. Sem ele a oferta
          // sai sem validade, e quem lê só o JSON-LD não sabe a idade do número.
          generatedAt: generatedAt ?? undefined,
        })
      : null;

  // O "a partir de" do topo prefere a matriz do build: ela existe no HTML pré-renderizado
  // e a busca por janela só responde depois do JS. Sem preço na matriz, cai na busca. Nos dois
  // caminhos o número é a MENOR diária do destino, o mesmo que os cards mostram logo abaixo.
  const fromPriceMatrix = priceDest ? lowestMatrixDaily(carUnits(priceDest.units)) : null;
  const fromPrice = fromPriceMatrix ?? lowestPerDay(results);

  // Meta description: a abertura escrita à mão no banco (a geografia que dado nenhum sabe)
  // MAIS o menor preço do motor MAIS o CTA. A estrutura mora em `destinationMetaDescription`;
  // aqui só entram os insumos. O CTA depende da capacidade: onde nenhuma unidade fecha a
  // reserva no Hub, ele convida a comparar em vez de prometer um checkout que roda fora.
  const hubCheckout = (prices?.matrix.rows ?? []).some((r) => r.unit.checkout_mode === "hub");
  const description =
    traducao?.meta_description?.trim() ||
    destinationMetaDescription({
    label: seoLabelPrimary(destination),
    city: destination.city,
    authored: destination.meta_description,
    summary: prices?.summary ?? null,
    prospectCount: prospectItems.length,
    hubCheckout,
    fallback: `Estacionamento ${seoLabelPrimary(destination)}, em ${destination.city}. Compare os preços das opções perto do terminal e reserve pela Movepark.`,
  });

  // O cross-link entre destinos agora vem do loader: dependia de um hook de cliente e por
  // isso não existia no HTML do build, deixando 6 links internos por página invisíveis
  // para o crawler. O hook segue cobrindo a navegação no cliente.
  // O hook do cliente devolve a linha inteira do destino; o loader devolve só o que o
  // card usa. Normaliza antes de escolher os irmãos.
  const relatedSource: RelatedDestination[] =
    loaded?.related ??
    (allDestinations.data ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      short_name: d.short_name,
      seo_label: d.seo_label,
      type: d.type,
      slug: d.slug,
      is_popular: d.is_popular,
      sort_order: d.sort_order,
    }));
  const related = pickRelatedDestinations(relatedSource, destination.id, 6);
  // Um card por tipo de vaga, o MESMO card da busca (ResultCard): um único modelo de card entre
  // home, busca e destino (E2.1.3).
  // A janela só entra no href DEPOIS que a busca do cliente responde. `defaultWindow()`
  // roda no build, e assar um D+7 do dia do deploy dentro do link deixaria todo card
  // apontando para uma data vencida até o próximo build.
  const searchWindowParams = search.data
    ? new URLSearchParams({ dest: destination.code, from: win.from, to: win.to })
    : new URLSearchParams({ dest: destination.code });
  const faqItems = (faqData ?? []).map((f) => ({ question: f.question, answer: f.answer }));
  // Corte por escopo (ADR-002): a do aeroporto vira seção com H2 e prosa aberta, a de
  // plataforma continua no accordion. As duas listas são disjuntas de propósito, senão a
  // mesma pergunta sairia duas vezes na página e duas vezes no FAQPage.
  // Mesma regra dos FAQs: o loader já descartou post sem tradução no idioma da URL.
  const postsDoDestino = (loaded?.posts ?? []).slice(0, 6);
  // O gate por idioma saiu daqui: o loader já entrega a lista NO IDIOMA da URL, com
  // quem não tem tradução publicada descartado. A página só separa por escopo.
  const perguntasDoDestino = keyQuestions(faqData);
  const perguntasGerais = accordionQuestions(faqData);
  // O JSON-LD pede número; o banco entrega `numeric`, que chega como string.
  const lat = Number(destination.latitude);
  const lng = Number(destination.longitude);

  // ── O que a abertura e a ficha declaram ───────────────────────────────────
  // Duas fontes para a mesma pergunta, e as duas contam: a vitrine (Edge `search`) e a
  // matriz do motor. Elas falham de formas diferentes, e contar só a vitrine já apagou o
  // destino inteiro da abertura quando a semente do build voltou vazia com a matriz cheia.
  const locaisDaVitrine = new Set(results.map((r) => `${r.operator.slug}/${r.location.slug}`));
  const locaisDaMatriz = new Set(
    (priceDest ? carUnits(priceDest.units) : []).map((u) => `${u.company_slug}/${u.location_slug}`),
  );
  const parceiros = Math.max(locaisDaVitrine.size, locaisDaMatriz.size);
  const temParceiro = parceiros > 0;
  // A distância que a abertura anuncia é a do PARCEIRO mais perto, não a do lote mais
  // perto da região. Ela aparece ao lado de "N estacionamentos com reserva online", e ali
  // um número que pertence a um lote sem reserva se lê como se fosse de um parceiro. Onde
  // não há parceiro, o número volta a ser o da região, que é o que a página tem a dizer.
  const parceiroMaisPerto =
    proximity.find((p) => p.kind === "partner" && p.distanceLabel != null)?.distanceLabel ?? null;
  const regiaoMaisPerto = proximity.find((p) => p.distanceLabel != null)?.distanceLabel ?? null;
  const maisPerto = parceiroMaisPerto ?? regiaoMaisPerto;
  const nomeCurto = destination.short_name ?? destination.name;

  const highlights = temParceiro
    ? [
        T.comReservaOnline(parceiros),
        parceiroMaisPerto ? T.maisPerto(parceiroMaisPerto) : null,
        prospectItems.length > 0 ? T.mapeadosNaRegiao(prospectItems.length) : null,
      ].filter((h): h is string => h != null)
    : [
        prospectItems.length > 0 ? T.mapeadosNaRegiao(prospectItems.length) : null,
        T.semReservaPorAqui,
      ].filter((h): h is string => h != null);

  const destaque =
    temParceiro && fromPrice != null
      ? {
          rotulo: T.aPartirDeRotulo,
          valor: formatBRL(fromPrice),
          sufixo: T.sufixoDiaria,
          cta: { label: T.verVagas, href: "#parceiros" },
        }
      : prospectItems.length > 0
        ? {
            rotulo: T.mapeadosRotulo,
            valor: String(prospectItems.length),
            cta: { label: T.verALista, href: "#mapeados" },
          }
        : null;

  const ficha = [
    points.length > 0
      ? {
          rotulo: T.terminal(points.length),
          valor: pointsSummary(points.map((p) => p.name)),
        }
      : null,
    temParceiro ? { rotulo: T.comReservaOnlineRotulo, valor: String(parceiros) } : null,
    prospectItems.length > 0
      ? { rotulo: T.mapeadosRotulo, valor: String(prospectItems.length) }
      : null,
    maisPerto
      ? {
          rotulo: parceiroMaisPerto ? T.parceiroMaisPertoRotulo : T.maisPertoRotulo,
          valor: maisPerto,
        }
      : null,
    fromPrice != null ? { rotulo: T.diariaAPartirDeRotulo, valor: formatBRL(fromPrice) } : null,
  ].filter((i): i is { rotulo: string; valor: string } => i != null);

  return (
    <LocaleProvider locale={locale}>
      <Helmet htmlAttributes={{ lang: LANG_HTML[locale] }}>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonical} />
        {hreflangs.map((h) => (
          <link key={h.hreflang} rel="alternate" hrefLang={h.hreflang} href={h.href} />
        ))}
        {/* O idioma da página e os outros em que ela existe. Sem `og:locale` o
            compartilhamento e o agente que lê OG não sabem em que língua está o texto,
            e o `alternate` é a mesma informação do `hreflang` na linguagem do OG. */}
        <meta property="og:locale" content={OG_LOCALE[locale]} />
        {hreflangs
          .filter((h) => h.hreflang !== "x-default" && h.hreflang !== LANG_HTML[locale])
          .map((h) => (
            <meta
              key={`ogl-${h.hreflang}`}
              property="og:locale:alternate"
              content={OG_LOCALE[(LOCALES.find((l) => LANG_HTML[l] === h.hreflang) ?? locale)]}
            />
          ))}
        <meta property="og:type" content="website" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonical} />
        <meta name="twitter:card" content={ogImage ? "summary_large_image" : "summary"} />
        {ogImage && <meta property="og:image" content={ogImage} />}
        {ogImage && <meta property="og:image:type" content="image/jpeg" />}
        {ogImage && <meta property="og:image:width" content="1200" />}
        {ogImage && <meta property="og:image:height" content="630" />}
        {ogImage && (
          <meta property="og:image:alt" content={`Estacionamento em ${destination.name}`} />
        )}
        {ogImage && <meta name="twitter:image" content={ogImage} />}
        <script type="application/ld+json">
          {JSON.stringify(
            destinationSchema({
              ...destination,
              latitude: lat,
              longitude: lng,
              image: schemaImages,
            }),
          )}
        </script>
        {/* `WebPage` com a data REAL da tabela de preço desta página. É o sinal de
            frescor que desempata duas fontes que dizem o mesmo número, e sem tabela no ar
            o nó não sai: data inventada é pior que data ausente. */}
        {prices?.lastUpdated && (
          <script type="application/ld+json">
            {JSON.stringify(
              webPageSchema({
                url: canonical,
                name: title,
                dateModified: prices.lastUpdated,
              }),
            )}
          </script>
        )}
        <script type="application/ld+json">
          {JSON.stringify(
            breadcrumbSchema([
              { name: "Início", url: SITE_URL },
              { name: "Estacionamentos", url: `${SITE_URL}/estacionamentos` },
              { name: destination.name, url: canonical },
            ]),
          )}
        </script>
        {offersSchema && offersSchema.length > 0 && (
          <script type="application/ld+json">{JSON.stringify(offersSchema)}</script>
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

      <article className="flex flex-col">
        <DestinationHero
          trilha={[
            { label: T.trilhaInicio, to: "/" },
            { label: T.trilhaEstacionamentos, to: "/estacionamentos" },
            { label: nomeCurto },
          ]}
          eyebrow={`${destination.city}${destination.state ? ` · ${destination.state}` : ""}`}
          heading={H.h1}
          highlights={highlights}
          heroUrl={heroUrl}
          alt={destination.name}
          destaque={destaque}
        />

        {/* Abertura: o texto do destino ao lado da ficha de números. */}
        <section className={`${CALHA} flex flex-col gap-10 py-12 desktop:flex-row desktop:py-16`}>
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            {(traducao?.intro || destination.intro) ? (
              (traducao?.intro || destination.intro)!.split(/\n{2,}/).map((p, i) => (
                <p key={i} className="max-w-[68ch] text-pretty text-body-md text-body">
                  {p}
                </p>
              ))
            ) : (
              <p className="max-w-[68ch] text-pretty text-body-md text-body">{description}</p>
            )}
          </div>
          <Ficha itens={ficha} />
        </section>

        {/* Vagas com reserva online */}
        <section id="parceiros" className={`${CALHA} scroll-mt-24 pb-4`}>
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div className="flex flex-col gap-2">
              <h2 className="text-balance text-display-2xl text-ink">
                {H.lista}
              </h2>
              {/* Conta o que está na tela logo abaixo, então o gatilho é a vitrine e não
                  `temParceiro`: com a semente do build vazia e a matriz cheia, a frase
                  sairia anunciando "0 vagas". */}
              {results.length > 0 && (
                <p className="text-body-md text-body">
                  {T.vagasEmParceiros(results.length, locaisDaVitrine.size)}
                </p>
              )}
            </div>
            {/* O CTA fica mesmo com a lista vazia, e isso é decisão, não descuido:
                `results` vazio também é "o destino tem unidades, mas nenhuma livre na
                janela padrão de D+7". Esconder o link nessa hora tiraria justamente o
                "escolher datas" de quem precisa dele. */}
            <Link
              to={`/search?dest=${destination.code}`}
              className="text-body-sm font-medium text-mp-primary underline-offset-2 hover:underline"
            >
              {T.verTodosEDatas}
            </Link>
          </div>

          <div className="mt-6">
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
              // NORMAL, não a exceção: o texto aponta para a lista de baixo quando ela
              // existe, em vez de deixar a página parecendo quebrada.
              <EmptyState
                title={`Ainda não temos reserva online em ${nomeCurto}`}
                description={
                  prospectItems.length > 0
                    ? "Os estacionamentos que mapeamos na região estão logo abaixo, com endereço e distância medida."
                    : undefined
                }
                action={
                  prospectItems.length > 0 ? (
                    <a
                      href="#mapeados"
                      className="text-body-sm font-medium text-mp-primary underline-offset-2 hover:underline"
                    >
                      {T.verListaDaRegiao}
                    </a>
                  ) : undefined
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
          </div>
        </section>

        {/* Quanto custa: a matriz 1/7/15/30 do motor, em tabela, no HTML do build.
            Vem logo depois da vitrine porque é a mesma pergunta que os cards abrem
            ("a partir de R$ X") e que só a tabela fecha.

            A condição NÃO é mais "tem matriz do motor". Em 21 dos 26 destinos não existe
            unidade vendável, e até 29/08/2026 a seção inteira sumia neles: a página ficava
            muda justamente na consulta com intenção de compra. Com preço pesquisado do lote
            mapeado a tabela existe sem parceiro nenhum. */}
        {(prices || pesquisados.length > 0) && (
          <section className="mt-12 bg-surface-soft py-16 desktop:py-24">
            <div className={CALHA}>
              <DestinationPriceTable
                prices={prices}
                generatedAt={generatedAt}
                pesquisados={pesquisados}
                destinationSlug={destinoSlug}
                heading={H.preco}
              />
            </div>
          </section>
        )}

        {/* Todos os estacionamentos da região, por distância medida (PostGIS, ADR-001).
            Parceiro e lote mapeado na mesma régua, cada um com o seu selo: a ordem é
            por distância, e o mapeado pode muito bem ser o mais perto (ADR-010). */}
        {proximity.length > 0 && (
          <section id="mapeados" className={`${CALHA} scroll-mt-24 py-16 desktop:py-20`}>
            <DestinationProximity
              rows={proximity}
              heading={H.distancia}
              lead={T.distanciaIntroLonga}
            />
          </section>
        )}

        {/* Como funciona o traslado. Só entra onde existe parceiro: em destino que a
            Movepark ainda está mapeando, o bloco descreveria um serviço que a página não
            consegue entregar, e "você deixa o carro no estacionamento parceiro" não tem
            parceiro nenhum para apontar. Onde ele entra, descreve o modelo sem prometer
            preço nem inclusão na diária, porque isso varia por unidade (ADR-009). */}
        {temParceiro && (
          <section className="bg-surface-soft py-16 desktop:py-24">
            <div
              className={`${CALHA} grid grid-cols-1 items-center gap-10 desktop:grid-cols-2 desktop:gap-16`}
            >
              <div className="flex flex-col gap-4">
                <span className="text-badge uppercase tracking-[0.4px] text-mp-indigo">
                  {T.trasladoEyebrow}
                </span>
                <h2 className="text-balance text-display-2xl text-ink">
                  {H.traslado}
                </h2>
                {/* Quem oferece, e não "os parceiros oferecem": traslado é comodidade de
                    cada unidade, e a página do destino fala de todas elas. */}
                <p className="max-w-[56ch] text-pretty text-body-md text-body">
                  {T.trasladoIntro}
                </p>
                <ol className="mt-2 flex flex-col gap-5">
                  {T.trasladoPassos.map((p, i) => (
                    <li key={p.t} className="flex gap-4">
                      <span
                        aria-hidden
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mp-pale text-caption font-semibold text-mp-indigo"
                      >
                        {i + 1}
                      </span>
                      <span className="flex flex-col gap-1">
                        <span className="text-title-md text-ink">{p.t}</span>
                        <span className="max-w-[46ch] text-pretty text-body-sm text-body">
                          {p.d}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
              {/* Foto, não ilustração: o bloco descreve um serviço que existe no mundo
                  físico, e o desenho vetorial da van fazia a página parecer explicar um
                  app. A imagem mostra a parte que o texto não alcança, que é a equipe
                  pegando a mala da mão de quem chega. */}
              <img
                src="/images/traslado-embarque-van.webp"
                alt="Atendente do estacionamento recebe a mala de uma passageira ao lado da van do traslado"
                width={1400}
                height={1050}
                className="h-full w-full rounded-lg object-cover desktop:max-h-[400px]"
                loading="lazy"
                decoding="async"
              />
            </div>
          </section>
        )}

        {/* Mapa */}
        <section className={`${CALHA} py-16 desktop:py-20`}>
          <h2 className="mb-6 text-balance text-display-2xl text-ink">
            {H.ondeFica}
          </h2>
          <GoogleMapEmbed
            title={`Mapa de ${destination.name}`}
            target={{ latitude: destination.latitude, longitude: destination.longitude }}
            zoom={13}
            className="h-[360px] w-full rounded-lg border border-hairline desktop:h-[420px]"
          />
        </section>

        {/* FAQ em camadas (ADR-002), agora em DOIS formatos, por escopo.

            As perguntas do AEROPORTO viram seção, com H2 literal e a prosa aberta:
            é o que a auditoria de 08/09/2026 mostrou faltar contra os concorrentes
            da mesma praça, que respondem 10 e 7 perguntas em seção enquanto as
            nossas viviam num accordion com resposta de três linhas.

            As perguntas de PLATAFORMA (escopo global) seguem no accordion, porque
            se repetem em toda página e não merecem H2 próprio. O corte por escopo
            garante que nenhuma pergunta apareça nos dois lugares, o que duplicaria
            a página e o FAQPage. */}
        {(faqLoading || faqItems.length > 0) && (
          <section className="bg-surface-soft py-16 desktop:py-24">
            <div className={CALHA}>
              <h2 className="mb-6 text-balance text-display-2xl text-ink">
                {H.faq}
              </h2>
              <DestinationKeyQuestions items={perguntasDoDestino} />
              {perguntasGerais.length > 0 && (
                <h2 className="mb-6 mt-14 text-balance text-display-md text-ink">
                  {H.perguntasGerais}
                </h2>
              )}
              <FaqList
                items={faqLoading ? undefined : perguntasGerais}
                isLoading={faqLoading}
              />
              <Link
                to="/faq"
                className="mt-6 inline-block text-body-sm font-medium text-mp-primary underline-offset-2 hover:underline"
              >
                {T.verTodasPerguntas}
              </Link>
            </div>
          </section>
        )}

        {/* Leia também: os posts do aeroporto.

            Dependia de `useRelatedPosts`, um hook de cliente, então a página chegava ao
            crawler com UM link de blog, o do índice `/blog/`. Em Viracopos são 11 posts
            publicados sobre a praça, sete deles de 19 mil caracteres, e nenhum recebia
            link da página que rankeia para o aeroporto. */}
        {postsDoDestino.length > 0 && (
          <section className="bg-canvas py-16 desktop:py-24">
            <div className={CALHA}>
              <h2 className="mb-6 text-balance text-display-2xl text-ink">
                {H.leiaTambem}
              </h2>
              <ul className="grid grid-cols-1 gap-x-8 gap-y-6 tablet:grid-cols-2">
                {postsDoDestino.map((p) => (
                  <li key={p.slug}>
                    <Link
                      to={`/blog/${p.slug}/`}
                      className="text-title-md text-ink underline-offset-2 hover:text-mp-primary hover:underline"
                    >
                      {p.title}
                    </Link>
                    {p.excerpt && (
                      <p className="mt-1 text-pretty text-body-md text-muted">{p.excerpt}</p>
                    )}
                  </li>
                ))}
              </ul>
              <Link
                to="/blog/"
                className="mt-6 inline-block text-body-sm font-medium text-mp-primary underline-offset-2 hover:underline"
              >
                {T.verTodosArtigos}
              </Link>
            </div>
          </section>
        )}

        {/* Outros destinos: internal linking entre páginas de destino */}
        {related.length > 0 && (
          <section className={`${CALHA} py-16 desktop:py-20`}>
            <h2 className="mb-6 text-balance text-display-sm text-ink">
              {H.outrosDestinos}
            </h2>
            <ul className="grid grid-cols-2 gap-3 tablet:grid-cols-3 desktop:grid-cols-6">
              {related.map((d) => (
                <li key={d.id}>
                  {/* "Aeroporto Guarulhos", e não "Guarulhos (GRU)": o bigrama
                      "estacionamento aeroporto <X>" é 40,6% dos cliques da página, e o
                      cross-link é justamente onde ele vira link interno. Sem preço aqui,
                      porque o card é navegação e não comparação. */}
                  <Link
                    to={caminhoDestino(d.public_slug ?? d.slug)}
                    className="flex h-full items-center rounded-md border border-hairline p-4 text-title-md text-ink transition hover:border-mp-primary hover:shadow-tier"
                  >
                    {seoLabelPrimary(d)}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
    </LocaleProvider>
  );
}
