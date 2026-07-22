import { Navigate, useLocation } from "react-router-dom";
import type { RouteRecord } from "vite-react-ssg";
import type { LoaderFunctionArgs } from "react-router-dom";

import { supabase } from "@/lib/supabase";
import { fetchListing } from "@/features/listing/api";

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
import DestinosPage from "@/routes/destinos";
import SobrePage from "@/routes/sobre";
import TermosPage from "@/routes/termos";
import PrivacidadePage from "@/routes/privacidade";
import ContatoPage from "@/routes/contato";
import AjudaPage from "@/routes/ajuda";
import CancelamentoPage from "@/routes/cancelamento";
import ComoFuncionaPage from "@/routes/como-funciona";

import AccountIndexPage from "@/routes/account/index";
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
import ManagerReviews from "@/routes/manager/reviews";
import ManagerAttribution from "@/routes/manager/attribution";

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
import OperatorFares from "@/routes/operator/fares";
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
    return await fetchListing(
      params.operatorSlug!,
      params.locationSlug!,
      params.parkingTypeCode!,
    );
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

async function destinoLoader({ params }: LoaderFunctionArgs) {
  const { data } = await supabase
    .from("destination")
    .select("*")
    .eq("slug", params.slug!)
    .eq("is_published", true)
    .maybeSingle();
  return data ?? null;
}

async function fetchAllDestinationPaths(): Promise<string[]> {
  const { data } = await supabase
    .from("destination")
    .select("slug")
    .eq("is_published", true);
  return (data ?? []).map((d) => `/destinos/${d.slug as string}`);
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
          { path: "/faq", element: <FaqPage /> },
          { path: "/sobre", element: <SobrePage /> },
          { path: "/termos", element: <TermosPage /> },
          { path: "/privacidade", element: <PrivacidadePage /> },
          { path: "/contato", element: <ContatoPage /> },
          { path: "/ajuda", element: <AjudaPage /> },
          { path: "/cancelamento", element: <CancelamentoPage /> },
          { path: "/como-funciona", element: <ComoFuncionaPage /> },
          { path: "/docs", element: <DocsPage /> },
          { path: "/seja-parceiro", element: <SejaParceiroPage /> },
          { path: "/motor-preview", element: <MotorPreviewPage /> },
          { path: "/destinos", element: <DestinosPage />, loader: destinosLoader },
          {
            path: "/destinos/:slug",
            element: <DestinoPage />,
            loader: destinoLoader,
            getStaticPaths: fetchAllDestinationPaths,
          },
          {
            element: <RequireRole roles={["customer"]} />,
            children: [
              { path: "/bookings", element: <BookingsListPage /> },
              { path: "/bookings/:code", element: <BookingDetailPage /> },
            ],
          },
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
              { path: "reviews", element: <ManagerReviews /> },
              { path: "faq", element: <ManagerFaq /> },
              { path: "faq/categorias", element: <ManagerFaqCategorias /> },
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
                // Plano de cancelamento é produto da Movepark: `fares:write` é
                // escopo de plataforma, então nenhum membro de empresa alcança
                // a rota, nem digitando a URL.
                element: <RequireScope scope="fares:write" />,
                children: [{ path: "fares", element: <OperatorFares /> }],
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

      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
];
