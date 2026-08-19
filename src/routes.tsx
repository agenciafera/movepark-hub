import { Navigate, useLocation } from "react-router-dom";
import type { RouteRecord } from "vite-react-ssg";
import type { LoaderFunctionArgs } from "react-router-dom";

import { supabase } from "@/lib/supabase";
import {
  fetchDestinationPoints,
  fetchDestinationProspects,
  fetchDestinationUnits,
} from "@/features/destinations/api";
import { destinationFromPrice } from "@/routes/destino.logic";
import { fetchListing, fetchPriceShowcase } from "@/features/listing/api";
import { fetchGooglePlaceSnapshot } from "@/features/reviews/googleApi";
import { fetchFaqBySlug, fetchFaqCombined, fetchFaqIndex } from "@/features/faqs/api";
import type { FaqPrecoContexto } from "@/features/faqs/faqPagina.logic";
import { fetchPriceIndex } from "@/features/price-index/api";
import {
  INDEX_DURATIONS,
  destinationSummary,
  overallStats,
  type AirportMeta,
  type IndexProspect,
} from "@/features/price-index/priceIndex.logic";
import { maisBaratoPorDuracao } from "@/features/price-index/maisBarato.logic";
import { filterPosts, pageSlice, totalPages } from "@/features/blog/listing.logic";

import { AppProviders } from "@/components/shared/AppProviders";
import { RootErrorBoundary } from "@/components/shared/RootErrorBoundary";
import { ConsumerAppShell } from "@/components/shared/ConsumerAppShell";
import { AccountAppShell } from "@/components/shared/AccountAppShell";
import { CheckoutShell } from "@/components/shared/CheckoutShell";
import { RequireRole } from "@/auth/RequireRole";
import { RequireScope } from "@/auth/RequireScope";

import HomePage from "@/routes/home";
import SearchResultsPage from "@/routes/search";
import ListingPage from "@/routes/listing";
import CheckoutPage from "@/routes/checkout";
import FaqPage from "@/routes/faq";
import FaqPerguntaPage from "@/routes/faq-pergunta";
import DocsPage from "@/routes/docs";
import BookingsListPage from "@/routes/bookings-list";
import BookingDetailPage from "@/routes/bookings-detail";
import AuthCallbackPage from "@/routes/auth/callback";
import LoginPage from "@/routes/login";
import DesignSystemPage from "@/routes/design-system";
import MotorPreviewPage from "@/routes/motor-preview";
import UnitPreviewPage from "@/routes/operator/unit-preview";
import OperatorRecebimento from "@/routes/operator/recebimento";
import SejaParceiroPage from "@/routes/seja-parceiro";
import OnboardingPage from "@/routes/onboarding";
import VoucherValidatePage from "@/routes/voucher-validate";
import DestinoPage from "@/routes/destino";
import PrecosPage, { type PrecosIndexData } from "@/routes/precos";
import PrecosDestinoPage, { type PrecosDestinoData } from "@/routes/precos-destino";
import CalculadoraPage, { type CalculadoraData } from "@/routes/calculadora";
import EstacionamentoMapeadoPage from "@/routes/estacionamento-mapeado";
import DestinosPage from "@/routes/destinos";
import NotFoundPage from "@/routes/not-found";
import BlogListingPage, { type BlogListingData } from "@/routes/blog";
import BlogPostPage from "@/routes/blog-post";
import SobrePage from "@/routes/sobre";
import TermosPage from "@/routes/termos";
import PrivacidadePage from "@/routes/privacidade";
import ContatoPage from "@/routes/contato";
import AjudaPage from "@/routes/ajuda";
import CancelamentoPage from "@/routes/cancelamento";
import ComoFuncionaPage from "@/routes/como-funciona";
import MetodologiaPage from "@/routes/metodologia";
import EstacionamentoMaisBaratoPage from "@/routes/estacionamento-mais-barato";

import AccountIndexPage from "@/routes/account/index";
import AccountReservasPage from "@/routes/account/reservas";
import AccountReservaDetailPage from "@/routes/account/reserva-detail";
import AccountClubePage from "@/routes/account/clube";
import AccountIndicarPage from "@/routes/account/indicar";
import AccountProfilePage from "@/routes/account/profile";
import AccountVehiclesPage from "@/routes/account/vehicles";
import AccountAddressesPage from "@/routes/account/addresses";
import AccountCardsPage from "@/routes/account/cards";
import AccountSavedPage from "@/routes/account/saved";
import AccountPreferencesPage from "@/routes/account/preferences";
import AccountSecurityPage from "@/routes/account/security";
import CompleteProfilePage from "@/routes/account/complete-profile";

import ManagerLayout from "@/routes/manager/layout";
import ManagerDashboard from "@/routes/manager/dashboard";
import ManagerBookings from "@/routes/manager/bookings";
import ManagerCompanies from "@/routes/manager/companies";
import ManagerLocations from "@/routes/manager/locations";
import ManagerUsers from "@/routes/manager/users";
import ManagerFinanceBilling from "@/routes/manager/finance-billing";
import ManagerFinanceCommissions from "@/routes/manager/finance-commissions";
import ManagerFinancePayouts from "@/routes/manager/finance-payouts";
import ManagerFinanceRecipients from "@/routes/manager/finance-recipients";
import ManagerSettings from "@/routes/manager/settings";
import ManagerLegal from "@/routes/manager/legal";
import ManagerFaq from "@/routes/manager/faq";
import ManagerFaqCategorias from "@/routes/manager/faq-categorias";
import ManagerPartners from "@/routes/manager/partners";
import ManagerDestinations from "@/routes/manager/destinations";
import ManagerLotesMapeados from "@/routes/manager/lotes-mapeados";
import ManagerBlog from "@/routes/manager/blog";
import ManagerApiInterna from "@/routes/manager/api-interna";
import ManagerReviews from "@/routes/manager/reviews";
import ManagerAttribution from "@/routes/manager/attribution";
import DescadastroPage from "@/routes/descadastro";
import ManagerMarketing from "@/routes/manager/marketing";
import ManagerMarketingLeads from "@/routes/manager/marketing-leads";
import ManagerMarketingSegments from "@/routes/manager/marketing-segments";
import ManagerMarketingCampaigns from "@/routes/manager/marketing-campaigns";
import ManagerMarketingCampaign from "@/routes/manager/marketing-campaign";

import OperatorLayout from "@/routes/operator/layout";
import OperatorDashboard from "@/routes/operator/dashboard";
import OperatorBookings from "@/routes/operator/bookings";
import OperatorLocations from "@/routes/operator/locations";
import OperatorLocationEdit from "@/routes/operator/location-edit";
import OperatorOccupancy from "@/routes/operator/occupancy";
import OperatorReports from "@/routes/operator/reports";
import OperatorFinance from "@/routes/operator/finance";
import OperatorSettings from "@/routes/operator/settings";
import OperatorFaq from "@/routes/operator/faq";
import OperatorAddons from "@/routes/operator/addons";
import ManagerTarifas from "@/routes/manager/tarifas";
import OperatorPricing from "@/routes/operator/pricing";
import OperatorCoupons from "@/routes/operator/coupons";
import OperatorReviews from "@/routes/operator/reviews";
import OperatorUsers from "@/routes/operator/users";
import OperatorApiKeys from "@/routes/operator/api-keys";

import ParkingTypesPage from "@/routes/parking-types";

/** Redireciona rotas legadas de auth (/entrar, /signup) para o login universal,
 *  preservando a query (`?next=`). `<Navigate>` puro não carrega a search. */
function RedirectToLogin() {
  const location = useLocation();
  return <Navigate to={`/login${location.search}`} replace />;
}

async function listingLoader({ params }: LoaderFunctionArgs) {
  try {
    const listing = await fetchListing(
      params.operatorSlug!,
      params.locationSlug!,
      params.parkingTypeCode!,
    );
    if (!listing) return null;
    // FAQ no loader porque a página é pré-renderizada: as respostas e o FAQPage
    // (JSON-LD) precisam sair no HTML do build. Falha aqui não derruba a página;
    // o hook do cliente cobre quando `faqs` vem nulo.
    const faqs = await fetchFaqCombined({ locationId: listing.location.id }).catch(() => null);
    // A faixa de diária também no loader, e pelo mesmo motivo do FAQ: o "a partir de" do card e
    // o `AggregateOffer` do JSON-LD precisam sair no HTML do build. `base_price` não serve para
    // isso (é 0 em toda unidade espelhada), então o preço vem do motor.
    const showcase = await fetchPriceShowcase(
      params.operatorSlug!,
      params.locationSlug!,
      params.parkingTypeCode!,
    ).catch(() => null);
    return { listing, faqs, showcase };
  } catch {
    return null;
  }
}

async function fetchAllListingPaths(): Promise<string[]> {
  const { data } = await supabase
    .from("location_parking_type")
    .select(
      `
      location:location!inner(
        slug,
        company:company!inner(slug)
      ),
      company_parking_type:company_parking_type!inner(
        parking_type:parking_type!inner(code)
      )
    `,
    )
    .eq("is_active", true)
    // Só pré-renderiza páginas de unidades publicamente listadas (gate de recebedor ativo).
    // A RLS pública já exige location.is_listed; este filtro deixa explícito no build (SSG).
    .eq("location.is_listed", true);

  // deno-lint-ignore no-explicit-any
  return (data ?? []).map(
    (r: any) =>
      `/p/${r.location.company.slug as string}/${r.location.slug as string}/${r.company_parking_type.parking_type.code as string}`,
  );
}

/**
 * O destino, as unidades VENDÁVEIS, os lotes MAPEADOS (E0.17-d), o FAQ, a matriz de
 * preços e os destinos irmãos.
 *
 * Tudo carrega aqui, e não em hook do cliente, porque a página é pré-renderizada e
 * crawler de IA não executa JS. Cada item tem um motivo próprio:
 *
 * - **mapeados:** o selo "Sem reserva online" é a frase que explica por que aquele card
 *   não tem preço nem botão, e precisa estar no HTML do build.
 * - **FAQ:** as respostas e o `FAQPage` saem no build por ADR-002.
 * - **preços:** a tabela de 1/7/15/30 diárias é a resposta de "quanto custa", a consulta
 *   de maior intenção da página. `fetchPriceIndex` é single-flight com cache, então os 27
 *   destinos compartilham UMA chamada da RPC no build (o papel anon derruba a query por
 *   statement timeout se cada página abrir a sua).
 * - **irmãos:** o bloco de cross-link entre destinos dependia de `usePublishedDestinations`,
 *   um hook de cliente, e por isso não existia no HTML pré-renderizado. Eram 26 links
 *   internos por página que nenhum crawler via.
 */
async function destinoLoader({ params }: LoaderFunctionArgs) {
  const { data } = await supabase
    .from("destination")
    .select("*")
    .eq("slug", params.slug!)
    .eq("is_published", true)
    .maybeSingle();
  if (!data) return null;
  // Falha em qualquer um não pode derrubar a página: sem lote mapeado a seção só não
  // existe, sem unidade vendável a lista volta a depender da busca no cliente, sem FAQ o
  // hook do cliente cobre e sem preço a tabela some. Em paralelo porque nenhuma depende
  // da outra.
  const [prospects, units, faqs, index, irmaos, points] = await Promise.all([
    fetchDestinationProspects(params.slug!).catch(() => []),
    fetchDestinationUnits(data).catch(() => []),
    fetchFaqCombined({ destinationId: data.id as string }).catch(() => null),
    fetchPriceIndex().catch(() => null),
    (async () => {
      const { data: irmaos } = await supabase
        .from("destination")
        .select("id, name, short_name, slug, is_popular, sort_order")
        .eq("is_published", true)
        .order("sort_order");
      return irmaos ?? [];
    })().catch(() => []),
    fetchDestinationPoints(data.id as string).catch(() => []),
  ]);
  // O "a partir de" do card de cada destino irmão sai do MESMO índice que a tabela
  // desta página, e não de uma segunda consulta: o cross-link vira comparação em vez
  // de uma lista de nomes, sem custar nenhuma chamada a mais no build.
  const menorDiaria = new Map(
    (index?.destinations ?? []).map((d) => [d.slug, destinationFromPrice(d)]),
  );
  return {
    destination: data,
    prospects,
    units,
    faqs,
    priceDestination:
      index?.destinations.find((d: { slug: string }) => d.slug === params.slug) ?? null,
    related: irmaos.map((d) => ({ ...d, from: menorDiaria.get(d.slug as string) ?? null })),
    points: points.map((p) => ({ id: p.id, name: p.name })),
    generatedAt: new Date().toISOString(),
  };
}

async function fetchAllDestinationPaths(): Promise<string[]> {
  const { data } = await supabase.from("destination").select("slug").eq("is_published", true);
  return (data ?? []).map((d) => `/destinos/${d.slug as string}`);
}

/** Página do lote MAPEADO (E0.17-e). Sem preço, sem reserva, sem caminho para uma. */
async function estacionamentoMapeadoLoader({ params }: LoaderFunctionArgs) {
  const { data: destination } = await supabase
    .from("destination")
    .select("*")
    .eq("slug", params.destino!)
    .eq("is_published", true)
    .maybeSingle();
  if (!destination) return null;

  // A RPC já aplica `is_published` e `converted_at is null`, e é `security invoker`: o
  // telefone não vem nem aqui, no build. Ficha convertida some da lista e a página deixa
  // de ser gerada, que é o comportamento certo enquanto a conversão (E0.17-g) não existe
  // para ter para onde redirecionar.
  const prospects = await fetchDestinationProspects(params.destino!).catch(() => []);
  const prospect = prospects.find((p) => p.slug === params.slug);
  if (!prospect) return null;

  // FAQ do AEROPORTO, nunca da unidade: lote mapeado não tem FAQ própria por
  // desenho (ADR-010), mas as perguntas do destino (traslado, segurança,
  // gabarito) são fato do aeroporto e valem aqui. Só escopo `destination`: a
  // global fala de reserva pela Movepark, que esta página não oferece.
  const faqs = await fetchFaqCombined({ destinationId: destination.id as string })
    .then((items) => items.filter((f) => f.scope === "destination"))
    .catch(() => null);

  // Avaliações do Google, a única prova social que este lote pode ter: nota Movepark exige
  // `booking`, e lote mapeado não gera nenhum. Buscado aqui, no loader, para o bloco sair no
  // HTML do build (§6 e §8 de avaliacoes-google.md). Falha não derruba a página: sem snapshot
  // a seção só não existe. O `google_place_id` vem da RPC porque o grant de coluna do Q-021
  // não deixa o front ler direto da tabela.
  const google = prospect.google_place_id
    ? await fetchGooglePlaceSnapshot(prospect.google_place_id).catch(() => null)
    : null;

  return { destination, prospect, faqs, google };
}

async function fetchAllProspectPaths(): Promise<string[]> {
  const { data } = await supabase
    .from("prospect_location")
    .select("slug, destination:destination(slug)")
    .eq("is_published", true)
    .is("converted_at", null);
  return (data ?? [])
    .map((p) => {
      // deno-lint-ignore no-explicit-any
      const destino = (p as any).destination?.slug as string | undefined;
      return destino ? `/estacionamentos/${destino}/${p.slug as string}` : null;
    })
    .filter((path): path is string => path !== null);
}

const BLOG_SELECT =
  "*, destination:destination(id, name, short_name, slug)," +
  " category:blog_category(id, name, slug)," +
  " author:blog_author(id, name, slug)," +
  " tags:blog_post_tag(tag:blog_tag(id, name, slug))";

/** O PostgREST devolve a N:N aninhada; a listagem e a página usam `tags: [...]`. */
// deno-lint-ignore no-explicit-any
function flattenTags(rows: any[]): any[] {
  return rows.map((row) => ({
    ...row,
    // deno-lint-ignore no-explicit-any
    tags: (row.tags ?? []).map((t: any) => t.tag).filter(Boolean),
  }));
}

async function blogPostLoader({ params }: LoaderFunctionArgs) {
  const { data } = await supabase
    .from("blog_post")
    .select(BLOG_SELECT)
    .eq("slug", params.slug!)
    .eq("is_published", true)
    .is("deleted_at", null)
    .maybeSingle();
  return data ? flattenTags([data])[0] : null;
}

/**
 * Os slugs vêm do WordPress e são contrato de URL: cada um destes paths é uma
 * página que o Google já conhece. Ver docs/specs/blog.md.
 */
async function fetchAllBlogPaths(): Promise<string[]> {
  const { data } = await supabase
    .from("blog_post")
    .select("slug")
    .eq("is_published", true)
    .is("deleted_at", null);
  return (data ?? []).map((p) => `/blog/${p.slug as string}`);
}

/**
 * Posts publicados para a listagem, SEM `body_md`.
 *
 * O `BLOG_SELECT` usa `*` porque a página do post precisa do corpo. Aqui não:
 * com o corpo, cada execução deste loader (e são 155 no build, mais uma a cada
 * primeira navegação para uma rota de listagem) baixava 593 KB em vez de 133 KB.
 */
const BLOG_LIST_SELECT =
  "id, slug, title, excerpt, cover_image_url, published_at," +
  " destination:destination(id, name, short_name, slug)," +
  " category:blog_category(id, name, slug)," +
  " author:blog_author(id, name, slug)," +
  " tags:blog_post_tag(tag:blog_tag(id, name, slug))";

async function fetchListablePosts() {
  const { data } = await supabase
    .from("blog_post")
    .select(BLOG_LIST_SELECT)
    .eq("is_published", true)
    .is("deleted_at", null)
    .order("published_at", { ascending: false });
  return flattenTags(data ?? []);
}

type BlogKind = "index" | "categoria" | "tag" | "autor" | "aeroporto";

/**
 * Loader único da listagem: índice, arquivo de taxonomia e paginação são a mesma
 * tela com um recorte diferente. `page` vem da URL e a fatia sai daqui, então o
 * HTML de cada página carrega 12 posts em vez dos 93.
 */
function blogListingLoader(kind: BlogKind) {
  return async ({ params }: LoaderFunctionArgs): Promise<BlogListingData> => {
    const page = Math.max(1, Number(params.page ?? 1) || 1);
    const slug = params.slug ?? null;
    const todos = await fetchListablePosts();

    const filtrados = slug ? filterPosts(todos, { [kind]: slug } as Record<string, string>) : todos;

    let name: string | null = null;
    let description: string | null = null;
    if (slug) {
      const primeiro = filtrados[0];
      if (kind === "categoria") {
        const { data } = await supabase
          .from("blog_category")
          .select("name, description")
          .eq("slug", slug)
          .maybeSingle();
        name = data?.name ?? slug;
        description = data?.description ?? null;
      } else if (kind === "tag") {
        name = primeiro?.tags?.find((t: { slug: string }) => t.slug === slug)?.name ?? slug;
      } else if (kind === "autor") {
        name = primeiro?.author?.name ?? slug;
      } else if (kind === "aeroporto") {
        name = primeiro?.destination?.name ?? slug;
      }
    }

    const base = slug ? `/blog/${kind}/${slug}` : "/blog";
    return {
      posts: pageSlice(filtrados, page),
      page,
      total: totalPages(filtrados.length),
      kind,
      slug,
      name,
      description,
      base,
    };
  };
}

/**
 * O loader da listagem só roda no build e no primeiro carregamento.
 *
 * Sem isto o router revalidava a rota a cada mudança de URL, inclusive a query
 * `?q=` da busca, e cada revalidação refazia a consulta inteira no servidor.
 * Depois do primeiro paint a listagem opera sobre o acervo em memória.
 */
const naoRevalidar = () => false;

/** Uma URL por fatia de página, para o crawler alcançar o post da última página. */
function blogListingPaths(kind: BlogKind, comPaginas: boolean) {
  return async (): Promise<string[]> => {
    const todos = await fetchListablePosts();

    if (kind === "index") {
      const total = totalPages(todos.length);
      return Array.from({ length: Math.max(0, total - 1) }, (_, i) => `/blog/page/${i + 2}`);
    }

    const chave = {
      categoria: (p: { category?: { slug: string } | null }) => p.category?.slug,
      autor: (p: { author?: { slug: string } | null }) => p.author?.slug,
      aeroporto: (p: { destination?: { slug: string } | null }) => p.destination?.slug,
    } as const;

    const slugs = new Map<string, number>();
    if (kind === "tag") {
      for (const p of todos) {
        for (const t of p.tags ?? []) slugs.set(t.slug, (slugs.get(t.slug) ?? 0) + 1);
      }
    } else {
      for (const p of todos) {
        const s = chave[kind](p);
        if (s) slugs.set(s, (slugs.get(s) ?? 0) + 1);
      }
    }

    const paths: string[] = [];
    for (const [slug, count] of slugs) {
      if (!comPaginas) {
        paths.push(`/blog/${kind}/${slug}`);
        continue;
      }
      for (let page = 2; page <= totalPages(count); page++) {
        paths.push(`/blog/${kind}/${slug}/page/${page}`);
      }
    }
    return paths;
  };
}

/**
 * Página "mais barato" (/estacionamento-mais-barato/<slug>): vencedor e vice por
 * duração, do mesmo índice de preços de /precos. Uma página por consulta de
 * dinheiro, com dado compacto no loader (o índice inteiro não viaja no HTML).
 */
async function maisBaratoLoader({ params }: LoaderFunctionArgs) {
  const index = await fetchPriceIndex().catch(() => null);
  if (!index) return null;
  const dest = index.destinations.find((d) => d.slug === params.slug);
  if (!dest) return null;
  const linhas = maisBaratoPorDuracao(dest, index.days);
  if (linhas.length === 0) return null;
  const resumo = destinationSummary(dest, index.days);
  return {
    destino: { name: dest.name, short_name: dest.short_name, slug: dest.slug, code: dest.code },
    linhas,
    unitCount: resumo.unitCount,
  };
}

/** Uma URL de "mais barato" por destino que tem ao menos um preço no índice. */
async function fetchAllMaisBaratoPaths(): Promise<string[]> {
  const index = await fetchPriceIndex().catch(() => null);
  if (!index) return [];
  return index.destinations
    .filter((d) => maisBaratoPorDuracao(d, index.days).length > 0)
    .map((d) => `/estacionamento-mais-barato/${d.slug}`);
}

/**
 * FAQ do hub /faq: global + destination, no build (SSG). O acervo inteiro sai no
 * HTML com o FAQPage; a busca da página filtra em memória sobre este dado.
 */
async function faqIndexLoader() {
  return fetchFaqIndex().catch(() => []);
}

/**
 * Página da pergunta (/faq/<slug>). `null` vira estado de não encontrada.
 *
 * Junto da pergunta vai um contexto COMPACTO de preço (índice de preços do
 * motor): a página mostra "quanto custa estacionar no aeroporto X" com dado
 * real. Compacto porque o loader é serializado no HTML de cada uma das ~40
 * páginas; mandar o índice inteiro multiplicaria o peso à toa.
 */
async function faqPerguntaLoader({ params }: LoaderFunctionArgs) {
  const data = await fetchFaqBySlug(params.slug!).catch(() => null);
  if (!data) return null;

  const index = await fetchPriceIndex().catch(() => null);
  let precos: FaqPrecoContexto = null;
  if (index) {
    if (data.faq.destination?.slug) {
      const dest = index.destinations.find((d) => d.slug === data.faq.destination?.slug);
      if (dest) {
        const resumo = destinationSummary(dest, index.days);
        precos = {
          kind: "destino",
          destino: {
            slug: dest.slug,
            unitCount: resumo.unitCount,
            partnerCount: resumo.partnerCount,
            byDuration: resumo.byDuration.map((d) => ({
              days: d.days,
              from: d.from,
              fromPerDay: d.fromPerDay,
            })),
          },
        };
      }
    } else {
      const stats = overallStats(index);
      precos = {
        kind: "rede",
        rede: {
          destinationCount: stats.destinationCount,
          unitCount: stats.unitCount,
          minDailyFrom: stats.minDailyFrom,
        },
      };
    }
  }

  return { ...data, precos };
}

/** Uma URL por pergunta publicada com slug (global e destination). */
async function fetchAllFaqPaths(): Promise<string[]> {
  const { data } = await supabase
    .from("faq")
    .select("slug")
    .eq("is_published", true)
    .is("deleted_at", null)
    .not("slug", "is", null);
  return (data ?? []).map((f) => `/faq/${f.slug as string}`);
}

/**
 * Índice de preços (/precos): a matriz 1/7/15/30 dos destinos precificados sai
 * do motor numa chamada só (RPC destination_price_index), e o catálogo inteiro
 * de aeroportos publicados entra junto, com os lotes mapeados de cada um
 * (ADR-010) para a tabela não deixar aeroporto de fora. Os lotes vêm em série
 * por blocos pequenos: 24 RPCs simultâneas no build esbarram no statement
 * timeout do papel anon. O carimbo generatedAt é a data de "conferido em".
 */
async function precosLoader(): Promise<PrecosIndexData | null> {
  const data = await fetchPriceIndex().catch(() => null);
  const { data: destinos } = await supabase
    .from("destination")
    .select("slug, code, name, short_name, city, state")
    .eq("is_published", true)
    .eq("type", "airport")
    .order("sort_order");
  const aeroportos = (destinos ?? []) as AirportMeta[];
  if (!data && aeroportos.length === 0) return null;

  const prospects: Record<string, IndexProspect[]> = {};
  const LOTE = 6;
  for (let i = 0; i < aeroportos.length; i += LOTE) {
    await Promise.all(
      aeroportos.slice(i, i + LOTE).map(async (a) => {
        const cards = await fetchDestinationProspects(a.slug).catch(() => []);
        prospects[a.slug] = cards.map((p) => ({
          name: p.name,
          slug: p.slug,
          distance_km: p.distance_km,
        }));
      }),
    );
  }

  return {
    data: data ?? { days: [...INDEX_DURATIONS], destinations: [] },
    aeroportos,
    prospects,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Página de preços do destino (/precos/<slug>). Busca o índice inteiro, e não
 * só o destino, porque o fim da página cruza com os preços dos demais.
 */
async function precosDestinoLoader({
  params,
}: LoaderFunctionArgs): Promise<PrecosDestinoData | null> {
  const data = await fetchPriceIndex().catch(() => null);
  const destination = data?.destinations.find((d) => d.slug === params.slug) ?? null;
  if (!data || !destination) return null;
  const others = data.destinations
    .filter((d) => d.slug !== destination.slug)
    .map((d) => ({ slug: d.slug, name: d.name, short_name: d.short_name }));
  return { days: data.days, destination, others, generatedAt: new Date().toISOString() };
}

/**
 * Calculadora: o índice inteiro (responde na hora nas durações padrão) mais os
 * lotes mapeados de cada destino, que fecham a lista sem preço (ADR-010).
 */
async function calculadoraLoader(): Promise<CalculadoraData | null> {
  const data = await fetchPriceIndex().catch(() => null);
  if (!data || data.destinations.length === 0) return null;
  // O select cobre TODOS os destinos publicados, com ou sem parceiro precificado.
  const { data: catalogoRaw } = await supabase
    .from("destination")
    .select("slug, name, short_name, state")
    .eq("is_published", true)
    .order("sort_order");
  const catalogo = (catalogoRaw ?? []) as CalculadoraData["catalogo"];
  // Lotes mapeados de cada destino, em blocos de 6 para não esbarrar no
  // statement timeout do papel anon durante o build.
  const prospects: CalculadoraData["prospects"] = {};
  const slugs = catalogo.map((c) => c.slug);
  for (let i = 0; i < slugs.length; i += 6) {
    const bloco = await Promise.all(
      slugs.slice(i, i + 6).map(async (s) => {
        const cards = await fetchDestinationProspects(s).catch(() => []);
        return [
          s,
          cards.map((p) => ({ name: p.name, slug: p.slug, distance_km: p.distance_km })),
        ] as const;
      }),
    );
    for (const [s, cards] of bloco) prospects[s] = cards;
  }
  return {
    data,
    catalogo,
    prospects,
    generatedAt: new Date().toISOString(),
  };
}

/** Uma URL por destino publicado com unidade precificada. */
async function fetchAllPrecosPaths(): Promise<string[]> {
  const data = await fetchPriceIndex().catch(() => null);
  return (data?.destinations ?? []).map((d) => `/precos/${d.slug}`);
}

// Índice de destinos: carrega os publicados no build (SSG) p/ o crawler ver os links.
async function destinosLoader() {
  const { data } = await supabase
    .from("destination")
    .select(
      "id, code, name, short_name, slug, type, city, state, country, latitude, longitude, is_popular, sort_order",
    )
    .eq("is_published", true)
    .order("sort_order");
  return data ?? [];
}

export const routes: RouteRecord[] = [
  {
    element: <AppProviders />,
    // Trata "build velho" (deploy novo invalidou assets com hash) recarregando 1x,
    // em vez de estourar "Unexpected Application Error!" no loader SSG. Ver stale-build.ts.
    errorElement: <RootErrorBoundary />,
    children: [
      // Rotas públicas com ConsumerAppShell
      {
        element: <ConsumerAppShell />,
        children: [
          { path: "/", element: <HomePage /> },
          { path: "/search", element: <SearchResultsPage /> },
          {
            path: "/p/:operatorSlug/:locationSlug/:parkingTypeCode",
            element: <ListingPage />,
            loader: listingLoader,
            getStaticPaths: fetchAllListingPaths,
          },
          { path: "/faq", element: <FaqPage />, loader: faqIndexLoader },
          {
            path: "/faq/:slug",
            element: <FaqPerguntaPage />,
            loader: faqPerguntaLoader,
            getStaticPaths: fetchAllFaqPaths,
          },
          { path: "/sobre", element: <SobrePage /> },
          { path: "/termos", element: <TermosPage /> },
          { path: "/privacidade", element: <PrivacidadePage /> },
          { path: "/contato", element: <ContatoPage /> },
          { path: "/ajuda", element: <AjudaPage /> },
          { path: "/cancelamento", element: <CancelamentoPage /> },
          // Descadastro de marketing pelo link do e-mail. Público e sem login de propósito.
          { path: "/descadastro", element: <DescadastroPage /> },
          { path: "/como-funciona", element: <ComoFuncionaPage /> },
          { path: "/metodologia", element: <MetodologiaPage /> },
          { path: "/docs", element: <DocsPage /> },
          { path: "/seja-parceiro", element: <SejaParceiroPage /> },
          { path: "/motor-preview", element: <MotorPreviewPage /> },
          { path: "/blog", element: <BlogListingPage />, loader: blogListingLoader("index") },
          {
            path: "/blog/page/:page",
            element: <BlogListingPage />,
            loader: blogListingLoader("index"),
            shouldRevalidate: naoRevalidar,
            getStaticPaths: blogListingPaths("index", false),
          },
          {
            path: "/blog/categoria/:slug",
            element: <BlogListingPage />,
            loader: blogListingLoader("categoria"),
            shouldRevalidate: naoRevalidar,
            getStaticPaths: blogListingPaths("categoria", false),
          },
          {
            path: "/blog/categoria/:slug/page/:page",
            element: <BlogListingPage />,
            loader: blogListingLoader("categoria"),
            shouldRevalidate: naoRevalidar,
            getStaticPaths: blogListingPaths("categoria", true),
          },
          {
            path: "/blog/tag/:slug",
            element: <BlogListingPage />,
            loader: blogListingLoader("tag"),
            shouldRevalidate: naoRevalidar,
            getStaticPaths: blogListingPaths("tag", false),
          },
          {
            path: "/blog/tag/:slug/page/:page",
            element: <BlogListingPage />,
            loader: blogListingLoader("tag"),
            shouldRevalidate: naoRevalidar,
            getStaticPaths: blogListingPaths("tag", true),
          },
          {
            path: "/blog/autor/:slug",
            element: <BlogListingPage />,
            loader: blogListingLoader("autor"),
            shouldRevalidate: naoRevalidar,
            getStaticPaths: blogListingPaths("autor", false),
          },
          {
            path: "/blog/autor/:slug/page/:page",
            element: <BlogListingPage />,
            loader: blogListingLoader("autor"),
            shouldRevalidate: naoRevalidar,
            getStaticPaths: blogListingPaths("autor", true),
          },
          {
            path: "/blog/aeroporto/:slug",
            element: <BlogListingPage />,
            loader: blogListingLoader("aeroporto"),
            shouldRevalidate: naoRevalidar,
            getStaticPaths: blogListingPaths("aeroporto", false),
          },
          {
            path: "/blog/aeroporto/:slug/page/:page",
            element: <BlogListingPage />,
            loader: blogListingLoader("aeroporto"),
            shouldRevalidate: naoRevalidar,
            getStaticPaths: blogListingPaths("aeroporto", true),
          },
          {
            path: "/blog/:slug",
            element: <BlogPostPage />,
            loader: blogPostLoader,
            getStaticPaths: fetchAllBlogPaths,
          },
          { path: "/precos", element: <PrecosPage />, loader: precosLoader },
          {
            path: "/calculadora-estacionamento-aeroporto",
            element: <CalculadoraPage />,
            loader: calculadoraLoader,
          },
          {
            // O comparador de app foi centralizado na calculadora (15/08/2026);
            // a URL antiga chegou a ir ao ar e redireciona para não virar 404.
            path: "/uber-ou-estacionamento-aeroporto",
            element: <Navigate to="/calculadora-estacionamento-aeroporto?modo=app" replace />,
          },
          {
            path: "/precos/:slug",
            element: <PrecosDestinoPage />,
            loader: precosDestinoLoader,
            getStaticPaths: fetchAllPrecosPaths,
          },
          { path: "/destinos", element: <DestinosPage />, loader: destinosLoader },
          {
            path: "/destinos/:slug",
            element: <DestinoPage />,
            loader: destinoLoader,
            getStaticPaths: fetchAllDestinationPaths,
          },
          {
            path: "/estacionamentos/:destino/:slug",
            element: <EstacionamentoMapeadoPage />,
            loader: estacionamentoMapeadoLoader,
            getStaticPaths: fetchAllProspectPaths,
          },
          {
            path: "/estacionamento-mais-barato/:slug",
            element: <EstacionamentoMaisBaratoPage />,
            loader: maisBaratoLoader,
            getStaticPaths: fetchAllMaisBaratoPaths,
          },
          {
            element: <RequireRole roles={["customer"]} />,
            children: [
              { path: "/bookings", element: <BookingsListPage /> },
              { path: "/bookings/:code", element: <BookingDetailPage /> },
            ],
          },
          // 404 de verdade, nas duas metades. `/404` existe como página para o build emitir
          // `dist/404.html`, que é o corpo que o worker serve com status 404; o catch-all
          // renderiza o MESMO componente na navegação interna. As duas moram aqui dentro, e
          // não fora do shell, porque precisam render a árvore idêntica: se o HTML servido
          // vier com header e a árvore hidratada não, o React reclama de mismatch.
          // Ver docs/specs/borda-cloudflare.md.
          { path: "/404", element: <NotFoundPage /> },
          { path: "*", element: <NotFoundPage /> },
        ],
      },

      // Checkout com shell minimalista (sem footer, sem nav, sem search)
      {
        element: <CheckoutShell />,
        children: [{ path: "/checkout/:code", element: <CheckoutPage /> }],
      },

      // Auth universal e passwordless (clientes + backoffice)
      { path: "/login", element: <LoginPage /> },
      { path: "/auth/callback", element: <AuthCallbackPage /> },
      // Rotas legadas → /login (preservam ?next=)
      { path: "/entrar", element: <RedirectToLogin /> },
      { path: "/signup", element: <RedirectToLogin /> },

      // Validação de voucher / check-in por QR (público, conteúdo por papel)
      { path: "/voucher/validate", element: <VoucherValidatePage /> },

      { path: "/design-system", element: <DesignSystemPage /> },

      // Área de conta (customer-only)
      {
        element: <RequireRole roles={["customer"]} />,
        children: [
          { path: "/account/complete-profile", element: <CompleteProfilePage /> },
          {
            path: "/account",
            element: <AccountAppShell />,
            children: [
              { index: true, element: <AccountIndexPage /> },
              { path: "reservas", element: <AccountReservasPage /> },
              { path: "reservas/:code", element: <AccountReservaDetailPage /> },
              { path: "clube", element: <AccountClubePage /> },
              { path: "indicar", element: <AccountIndicarPage /> },
              { path: "profile", element: <AccountProfilePage /> },
              { path: "vehicles", element: <AccountVehiclesPage /> },
              { path: "addresses", element: <AccountAddressesPage /> },
              { path: "cards", element: <AccountCardsPage /> },
              { path: "saved", element: <AccountSavedPage /> },
              { path: "preferences", element: <AccountPreferencesPage /> },
              { path: "security", element: <AccountSecurityPage /> },
            ],
          },
        ],
      },

      // Manager (hub_admin)
      {
        element: <RequireRole roles={["hub_admin"]} />,
        children: [
          {
            path: "/manager",
            element: <ManagerLayout />,
            children: [
              { index: true, element: <ManagerDashboard /> },
              { path: "bookings", element: <ManagerBookings /> },
              { path: "companies", element: <ManagerCompanies /> },
              { path: "partners", element: <ManagerPartners /> },
              { path: "destinations", element: <ManagerDestinations /> },
              { path: "lotes-mapeados", element: <ManagerLotesMapeados /> },
              { path: "blog", element: <ManagerBlog /> },
              { path: "api-interna", element: <ManagerApiInterna /> },
              { path: "companies/:id/locations", element: <ManagerLocations /> },
              {
                path: "companies/:companyId/locations/:locationId/parking-types",
                element: <ParkingTypesPage />,
              },
              { path: "users", element: <ManagerUsers /> },
              { path: "finance/billing", element: <ManagerFinanceBilling /> },
              { path: "finance/commissions", element: <ManagerFinanceCommissions /> },
              { path: "finance/payouts", element: <ManagerFinancePayouts /> },
              { path: "finance/recipients", element: <ManagerFinanceRecipients /> },
              { path: "attribution", element: <ManagerAttribution /> },
              { path: "marketing", element: <ManagerMarketing /> },
              { path: "marketing/leads", element: <ManagerMarketingLeads /> },
              { path: "marketing/segmentos", element: <ManagerMarketingSegments /> },
              { path: "marketing/campanhas", element: <ManagerMarketingCampaigns /> },
              { path: "marketing/campanhas/:id", element: <ManagerMarketingCampaign /> },
              { path: "reviews", element: <ManagerReviews /> },
              { path: "faq", element: <ManagerFaq /> },
              { path: "faq/categorias", element: <ManagerFaqCategorias /> },
              { path: "tarifas", element: <ManagerTarifas /> },
              { path: "settings", element: <ManagerSettings /> },
              { path: "legal", element: <ManagerLegal /> },
            ],
          },
        ],
      },

      // Operator (company_operator)
      {
        element: <RequireRole roles={["company_operator"]} />,
        children: [
          {
            path: "/operator",
            element: <OperatorLayout />,
            children: [
              // Sem escopo: visíveis a todos os papéis (a ação na página é gateada por RLS/RPC).
              { index: true, element: <OperatorDashboard /> },
              { path: "bookings", element: <OperatorBookings /> },
              { path: "locations", element: <OperatorLocations /> },
              { path: "locations/:locationId/editar", element: <OperatorLocationEdit /> },
              {
                path: "locations/:locationId/parking-types",
                element: <ParkingTypesPage />,
              },
              { path: "faq", element: <OperatorFaq /> },
              { path: "reports", element: <OperatorReports /> },
              { path: "settings", element: <OperatorSettings /> },
              // Gateadas por escopo (ADR-005) — espelham o filtro da sidebar e o gate do servidor.
              {
                element: <RequireScope scope="occupancy:read" />,
                children: [{ path: "occupancy", element: <OperatorOccupancy /> }],
              },
              {
                element: <RequireScope scope="addons:write" />,
                children: [{ path: "addons", element: <OperatorAddons /> }],
              },
              {
                element: <RequireScope scope="pricing:write" />,
                children: [{ path: "pricing", element: <OperatorPricing /> }],
              },
              {
                element: <RequireScope scope="coupons:write" />,
                children: [{ path: "coupons", element: <OperatorCoupons /> }],
              },
              {
                element: <RequireScope scope="reviews:read" />,
                children: [{ path: "reviews", element: <OperatorReviews /> }],
              },
              {
                element: <RequireScope scope="team:read" />,
                children: [{ path: "users", element: <OperatorUsers /> }],
              },
              {
                element: <RequireScope scope="finance:read" />,
                children: [{ path: "finance", element: <OperatorFinance /> }],
              },
              {
                element: <RequireScope scope="api-keys:write" />,
                children: [{ path: "api-keys", element: <OperatorApiKeys /> }],
              },
            ],
          },
        ],
      },

      // Onboarding do parceiro (Stage 2) — full-page, fora do shell do operador
      {
        element: <RequireRole roles={["company_operator"]} />,
        children: [
          { path: "/onboarding", element: <OnboardingPage /> },
          // Preview travado da unidade (E1.9) — dono vê a unidade via RLS da própria empresa,
          // independente de is_active/status (sem exigir foto/KYC). Ver preview-listing.md §6.4.
          { path: "/operator/preview/:locationId", element: <UnitPreviewPage /> },
          { path: "/operator/recebimento", element: <OperatorRecebimento /> },
        ],
      },
    ],
  },
];
