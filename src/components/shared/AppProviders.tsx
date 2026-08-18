import * as React from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { IconContext } from "@phosphor-icons/react";
import { queryClient } from "@/lib/query-client";
import { AuthProvider } from "@/auth/AuthProvider";
import { hasSupabaseEnv } from "@/lib/supabase";
import { ScrollToTop } from "@/components/shared/ScrollToTop";
import { SavedListingsSync } from "@/features/search/SavedListingsSync";
import { initClarity } from "@/lib/clarity";
import { captureUtmFromSearch } from "@/lib/utm";
import { captureCouponFromSearch } from "@/lib/coupon";

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
  // Campanha de cupom: captura ?cupom=/?coupon= (persiste na sessão até o checkout).
  React.useEffect(() => {
    captureUtmFromSearch(location.search);
    captureCouponFromSearch(location.search);
  }, [location.search]);

  // Microsoft Clarity: injeta uma vez, no cliente. Fica antes do early return do
  // `hasSupabaseEnv` porque hook não pode ficar depois de retorno condicional, e fica em
  // efeito próprio porque não depende da rota (o Clarity acompanha a navegação sozinho).
  React.useEffect(() => {
    initClarity();
  }, []);

  if (!hasSupabaseEnv) {
    return location.pathname.startsWith("/design-system") ? <Outlet /> : <EnvMissing />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      {/* Padrão dos ícones num lugar só. Quase todo uso do projeto dimensiona por
          classe (`h-4 w-4`), que sobrepõe o `size`; o context serve pros que não
          passam nada e pra fixar o peso do traço. */}
      <IconContext.Provider value={{ size: 20, weight: "regular" }}>
        {/* Título-padrão (fallback). Páginas que definem o próprio <title> via Helmet
            sobrescrevem; assim cada página tem exatamente um <title>. */}
        <Helmet defaultTitle="Movepark Hub" />
        <AuthProvider>
          <ScrollToTop />
          <SavedListingsSync />
          <Toaster position="bottom-right" richColors />
          <Outlet />
        </AuthProvider>
      </IconContext.Provider>
    </QueryClientProvider>
  );
}
