import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { queryClient } from "@/lib/query-client";
import { hasSupabaseEnv } from "@/lib/supabase";
import { AuthProvider } from "@/auth/AuthProvider";
import { RequireRole } from "@/auth/RequireRole";

import RoleRedirect from "@/routes/index";
import LoginPage from "@/routes/login";
import DesignSystemPage from "@/routes/design-system";

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
            <Route path="/" element={<RoleRedirect />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/design-system" element={<DesignSystemPage />} />

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
