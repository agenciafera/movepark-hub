import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "@phosphor-icons/react";
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
  // Telas já redesenhadas compõem os próprios cards (design "Minha Conta Cliente")
  // e saem do painel branco: dentro dele ficavam card branco sobre painel branco.
  // As que ainda não passaram pelo redesenho continuam no painel, senão ficariam
  // soltas no cinza. Ao redesenhar uma, acrescente o prefixo aqui.
  const REDESENHADAS = [
    "/account/profile",
    "/account/vehicles",
    "/account/addresses",
    "/account/saved",
    "/account/reservas",
    "/account/cards",
  ];
  const ownsSurface = REDESENHADAS.some((p) => location.pathname.startsWith(p));

  return (
    <div className="flex min-h-screen flex-col bg-panel">
      <ConsumerTopbar />

      {/* Enquadramento do design: sidebar navy flutuante com 20px de respiro e o
          conteúdo ocupando o que sobra. Sem trava de largura, igual aos painéis. */}
      <div className="flex flex-1 gap-5 px-4 py-6 desktop:p-5">
        <AccountSidebar />
        <main className="flex min-w-0 flex-1 flex-col pb-[var(--bottom-nav-space)] tablet:pb-0">
          {/* Header da seção em mobile (não-root) com botão voltar */}
          <div className="mb-4 desktop:hidden">
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
          {ownsSurface ? (
            <Outlet />
          ) : (
            <div className="rounded-lg border border-hairline bg-canvas p-5 desktop:p-8">
              <Outlet />
            </div>
          )}
        </main>
      </div>

      <ConsumerFooter />
      <ConsumerBottomNav />
    </div>
  );
}
