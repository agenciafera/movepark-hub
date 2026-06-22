import * as React from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { queryClient } from "@/lib/query-client";
import { AuthProvider } from "@/auth/AuthProvider";
import { hasSupabaseEnv } from "@/lib/supabase";
import { ScrollToTop } from "@/components/shared/ScrollToTop";
import { captureUtmFromSearch } from "@/lib/utm";

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

export function AppProviders() {
  const location = useLocation();

  // Atribuição (E2.4.1): captura UTMs da URL (last-touch) pra anexar na reserva.
  React.useEffect(() => {
    captureUtmFromSearch(location.search);
  }, [location.search]);

  if (!hasSupabaseEnv) {
    return location.pathname.startsWith("/design-system") ? <Outlet /> : <EnvMissing />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      {/* Título-padrão (fallback). Páginas que definem o próprio <title> via Helmet
          sobrescrevem; assim cada página tem exatamente um <title>. */}
      <Helmet defaultTitle="Movepark Hub" />
      <AuthProvider>
        <ScrollToTop />
        <Toaster position="bottom-right" richColors />
        <Outlet />
      </AuthProvider>
    </QueryClientProvider>
  );
}
