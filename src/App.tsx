import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { queryClient } from "@/lib/query-client";
import { hasSupabaseEnv } from "@/lib/supabase";
import { AuthProvider } from "@/auth/AuthProvider";
import { RequireRole } from "@/auth/RequireRole";

import LoginPage from "@/routes/login";
import DesignSystemPage from "@/routes/design-system";
import HomePage from "@/routes/home";
import SearchResultsPage from "@/routes/search";
import ListingPage from "@/routes/listing";
import CheckoutPage from "@/routes/checkout";
import ForgotPasswordPage from "@/routes/forgot-password";
import EntrarPage from "@/routes/entrar";
import BookingsListPage from "@/routes/bookings-list";
import BookingDetailPage from "@/routes/bookings-detail";
import AuthCallbackPage from "@/routes/auth/callback";
import { ConsumerAppShell } from "@/components/shared/ConsumerAppShell";
import { AccountAppShell } from "@/components/shared/AccountAppShell";
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

import OperatorLayout from "@/routes/operator/layout";
import OperatorDashboard from "@/routes/operator/dashboard";
import OperatorBookings from "@/routes/operator/bookings";
import OperatorLocations from "@/routes/operator/locations";
import OperatorReports from "@/routes/operator/reports";
import OperatorSettings from "@/routes/operator/settings";

import ParkingTypesPage from "@/routes/parking-types";

function EnvMissing() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-soft px-4">
      <div className="max-w-lg space-y-4 rounded-md border border-hairline bg-canvas p-8 shadow-tier">
        <h1 className="text-display-md text-ink">Configuração faltando</h1>
        <p className="text-body-md text-body">
          Defina <code className="rounded bg-surface-strong px-1">VITE_SUPABASE_URL</code> e{" "}
          <code className="rounded bg-surface-strong px-1">VITE_SUPABASE_ANON_KEY</code> no
          arquivo <code className="rounded bg-surface-strong px-1">.env.local</code> na raiz do
          projeto.
        </p>
        <p className="text-body-sm text-muted">
          Use <code>.env.local.example</code> como referência e reinicie{" "}
          <code>npm run dev</code> após salvar.
        </p>
        <p className="text-body-sm text-muted">
          O{" "}
          <a className="text-info underline" href="/design-system">
            design system
          </a>{" "}
          continua acessível sem configuração.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  if (!hasSupabaseEnv) {
    return (
      <BrowserRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/design-system" element={<DesignSystemPage />} />
          <Route path="*" element={<EnvMissing />} />
        </Routes>
      </BrowserRouter>
    );
  }
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <AuthProvider>
          <Toaster position="bottom-right" richColors />
          <Routes>
            {/* Rotas públicas do consumer (sem auth obrigatório) */}
            <Route element={<ConsumerAppShell />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/search" element={<SearchResultsPage />} />
              <Route
                path="/p/:operatorSlug/:locationSlug/:parkingTypeCode"
                element={<ListingPage />}
              />
              <Route path="/checkout/:code" element={<CheckoutPage />} />

              {/* Customer-only — RequireRole protege dentro */}
              <Route element={<RequireRole roles={["customer"]} />}>
                <Route path="/bookings" element={<BookingsListPage />} />
                <Route path="/bookings/:code" element={<BookingDetailPage />} />
              </Route>
            </Route>

            {/* Auth customer (passwordless) */}
            <Route path="/entrar" element={<EntrarPage />} />
            <Route path="/signup" element={<Navigate to="/entrar" replace />} />
            <Route path="/auth/callback" element={<AuthCallbackPage />} />

            {/* Auth backoffice (e-mail+senha) */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/design-system" element={<DesignSystemPage />} />

            {/* Área de conta (customer-only) */}
            <Route element={<RequireRole roles={["customer"]} />}>
              <Route
                path="/account/complete-profile"
                element={<CompleteProfilePage />}
              />
              <Route path="/account" element={<AccountAppShell />}>
                <Route index element={<AccountIndexPage />} />
                <Route path="profile" element={<AccountProfilePage />} />
                <Route path="vehicles" element={<AccountVehiclesPage />} />
                <Route path="addresses" element={<AccountAddressesPage />} />
                <Route path="cards" element={<AccountCardsPage />} />
                <Route path="saved" element={<AccountSavedPage />} />
                <Route path="preferences" element={<AccountPreferencesPage />} />
                <Route path="security" element={<AccountSecurityPage />} />
              </Route>
            </Route>

            <Route element={<RequireRole roles={["hub_admin"]} />}>
              <Route path="/manager" element={<ManagerLayout />}>
                <Route index element={<ManagerDashboard />} />
                <Route path="bookings" element={<ManagerBookings />} />
                <Route path="companies" element={<ManagerCompanies />} />
                <Route path="companies/:id/locations" element={<ManagerLocations />} />
                <Route
                  path="companies/:companyId/locations/:locationId/parking-types"
                  element={<ParkingTypesPage />}
                />
                <Route path="users" element={<ManagerUsers />} />
                <Route path="finance/billing" element={<ManagerFinanceBilling />} />
                <Route path="finance/commissions" element={<ManagerFinanceCommissions />} />
                <Route path="settings" element={<ManagerSettings />} />
              </Route>
            </Route>

            <Route element={<RequireRole roles={["company_operator"]} />}>
              <Route path="/operator" element={<OperatorLayout />}>
                <Route index element={<OperatorDashboard />} />
                <Route path="bookings" element={<OperatorBookings />} />
                <Route path="locations" element={<OperatorLocations />} />
                <Route
                  path="locations/:locationId/parking-types"
                  element={<ParkingTypesPage />}
                />
                <Route path="reports" element={<OperatorReports />} />
                <Route path="settings" element={<OperatorSettings />} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
