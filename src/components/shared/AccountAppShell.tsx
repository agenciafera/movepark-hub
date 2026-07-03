import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "@/lib/icons";
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

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
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
          <main className="min-w-0 flex-1 pb-16 tablet:pb-0">
            <Outlet />
          </main>
        </div>
      </div>

      <ConsumerFooter />
      <ConsumerBottomNav />
    </div>
  );
}
