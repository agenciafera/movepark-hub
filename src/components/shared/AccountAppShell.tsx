import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { ConsumerTopbar } from "./ConsumerTopbar";
import { ConsumerFooter } from "./ConsumerFooter";
import { ConsumerBottomNav } from "./ConsumerBottomNav";
import { AccountSidebar } from "./AccountSidebar";
import { Button } from "@/components/ui/button";

/**
 * Account shell — Topbar normal + sidebar desktop + Outlet + Footer + BottomNav.
 * Mobile: as sub-rotas (profile, vehicles, etc) ficam tela cheia com "Voltar".
 */
export function AccountAppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const isRoot = location.pathname === "/account" || location.pathname === "/account/";
  // Páginas ricas (Clube, Indique) trazem os próprios cards, então ficam direto
  // no painel cinza. Envolvê-las no card branco criaria card dentro de card e
  // achataria os cards internos (branco no branco). As telas de formulário sim
  // ganham a superfície branca, pra não ficarem soltas no cinza.
  const fullBleed =
    location.pathname.startsWith("/account/clube") ||
    location.pathname.startsWith("/account/indicar");

  return (
    <div className="flex min-h-screen flex-col bg-panel">
      <ConsumerTopbar />

      <div className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 desktop:px-8 desktop:py-10">
        {/* Header da seção em mobile (não-root) com botão voltar */}
        <div className="desktop:hidden mb-4">
          {!isRoot ? (
            <Button
              variant="ghost"
              size="sm"
              className="-ml-3"
              onClick={() => navigate("/account")}
            >
              <ArrowLeft className="h-4 w-4" />
              Conta
            </Button>
          ) : (
            <h1 className="text-display-lg text-ink">Conta</h1>
          )}
        </div>

        <div className="flex gap-10">
          <AccountSidebar />
          <main className="min-w-0 flex-1 pb-[var(--bottom-nav-space)] tablet:pb-0">
            {fullBleed ? (
              <Outlet />
            ) : (
              /* Painel de conteúdo branco: sobre o fundo cinza, dá superfície às páginas
                 da conta (perfil, veículos, etc.), que antes ficavam soltas no cinza. */
              <div className="rounded-md border border-hairline bg-canvas p-5 desktop:p-8">
                <Outlet />
              </div>
            )}
          </main>
        </div>
      </div>

      <ConsumerFooter />
      <ConsumerBottomNav />
    </div>
  );
}
