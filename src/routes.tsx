import { Navigate } from "react-router-dom";
import type { RouteRecord } from "vite-react-ssg";
import type { LoaderFunctionArgs } from "react-router-dom";

import { supabase } from "@/lib/supabase";
import { fetchListing } from "@/features/listing/api";

import { AppProviders } from "@/components/shared/AppProviders";
import { ConsumerAppShell } from "@/components/shared/ConsumerAppShell";
import { AccountAppShell } from "@/components/shared/AccountAppShell";
import { RequireRole } from "@/auth/RequireRole";

import HomePage from "@/routes/home";
import SearchResultsPage from "@/routes/search";
import ListingPage from "@/routes/listing";
import CheckoutPage from "@/routes/checkout";
import FaqPage from "@/routes/faq";
import BookingsListPage from "@/routes/bookings-list";
import BookingDetailPage from "@/routes/bookings-detail";
import EntrarPage from "@/routes/entrar";
import AuthCallbackPage from "@/routes/auth/callback";
import LoginPage from "@/routes/login";
import ForgotPasswordPage from "@/routes/forgot-password";
import DesignSystemPage from "@/routes/design-system";
import SejaParceiroPage from "@/routes/seja-parceiro";
import OnboardingPage from "@/routes/onboarding";
import VoucherValidatePage from "@/routes/voucher-validate";
import DestinoPage from "@/routes/destino";

import AccountIndexPage from "@/routes/account/index";
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
import ManagerSettings from "@/routes/manager/settings";
import ManagerFaq from "@/routes/manager/faq";
import ManagerFaqCategorias from "@/routes/manager/faq-categorias";
import ManagerPartners from "@/routes/manager/partners";
import ManagerDestinations from "@/routes/manager/destinations";
import ManagerReviews from "@/routes/manager/reviews";

import OperatorLayout from "@/routes/operator/layout";
import OperatorDashboard from "@/routes/operator/dashboard";
import OperatorBookings from "@/routes/operator/bookings";
import OperatorLocations from "@/routes/operator/locations";
import OperatorOccupancy from "@/routes/operator/occupancy";
import OperatorReports from "@/routes/operator/reports";
import OperatorSettings from "@/routes/operator/settings";
import OperatorFaq from "@/routes/operator/faq";
import OperatorAddons from "@/routes/operator/addons";
import OperatorCoupons from "@/routes/operator/coupons";
import OperatorReviews from "@/routes/operator/reviews";

import ParkingTypesPage from "@/routes/parking-types";

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
    .eq("is_active", true);

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

export const routes: RouteRecord[] = [
  {
    element: <AppProviders />,
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
          { path: "/checkout/:code", element: <CheckoutPage /> },
          { path: "/faq", element: <FaqPage /> },
          { path: "/seja-parceiro", element: <SejaParceiroPage /> },
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

      // Auth consumer (passwordless)
      { path: "/entrar", element: <EntrarPage /> },
      { path: "/signup", element: <Navigate to="/entrar" replace /> },
      { path: "/auth/callback", element: <AuthCallbackPage /> },

      // Validação de voucher / check-in por QR (público, conteúdo por papel)
      { path: "/voucher/validate", element: <VoucherValidatePage /> },

      // Auth backoffice
      { path: "/login", element: <LoginPage /> },
      { path: "/forgot-password", element: <ForgotPasswordPage /> },
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
              { path: "reviews", element: <ManagerReviews /> },
              { path: "faq", element: <ManagerFaq /> },
              { path: "faq/categorias", element: <ManagerFaqCategorias /> },
              { path: "settings", element: <ManagerSettings /> },
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
              { index: true, element: <OperatorDashboard /> },
              { path: "bookings", element: <OperatorBookings /> },
              { path: "locations", element: <OperatorLocations /> },
              { path: "occupancy", element: <OperatorOccupancy /> },
              {
                path: "locations/:locationId/parking-types",
                element: <ParkingTypesPage />,
              },
              { path: "addons", element: <OperatorAddons /> },
              { path: "coupons", element: <OperatorCoupons /> },
              { path: "reviews", element: <OperatorReviews /> },
              { path: "faq", element: <OperatorFaq /> },
              { path: "reports", element: <OperatorReports /> },
              { path: "settings", element: <OperatorSettings /> },
            ],
          },
        ],
      },

      // Onboarding do parceiro (Stage 2) — full-page, fora do shell do operador
      {
        element: <RequireRole roles={["company_operator"]} />,
        children: [{ path: "/onboarding", element: <OnboardingPage /> }],
      },

      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
];
