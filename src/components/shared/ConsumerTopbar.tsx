import { Link, useLocation, useNavigate } from "react-router-dom";
import { Search, Heart, User2, LogOut, LayoutDashboard, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/auth/context";
import { Monogram, Wordmark } from "./Brand";

/**
 * Topbar pública do consumer.
 * - Wordmark à esquerda → vai pra `/`
 * - Pill de busca colapsada no centro (apenas placeholder visual; abrir busca em popover/sheet vem na Fase 2)
 * - Direita: logado → avatar dropdown; anônimo → botão "Entrar"
 */
export function ConsumerTopbar() {
  const { session, effectiveRole, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === "/";

  const initials = (session?.fullName ?? session?.email ?? "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="sticky top-0 z-40 flex h-20 items-center gap-4 border-b border-hairline bg-canvas px-4 desktop:px-8">
      <Link to="/" className="hidden tablet:block shrink-0" aria-label="Movepark — ir para a home">
        <Wordmark height={22} />
      </Link>
      <Link to="/" className="tablet:hidden shrink-0" aria-label="Movepark">
        <Monogram size={28} />
      </Link>

      <div className="flex flex-1 justify-center">
        {/* Pill placeholder — Fase 2 substitui pela SearchBarPill real */}
        {!isHome && (
          <button
            type="button"
            onClick={() => navigate("/")}
            className="flex h-12 items-center gap-3 rounded-full border border-hairline bg-canvas px-4 text-body-sm text-muted shadow-tier transition-shadow hover:shadow-tier tablet:max-w-md tablet:w-full"
          >
            <Search className="h-4 w-4" />
            <span className="truncate">Onde · Quando · Veículo</span>
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        {!session && (
          <>
            <Button variant="ghost" size="sm" className="hidden tablet:inline-flex" asChild>
              <Link to="/seja-parceiro">Seja parceiro</Link>
            </Button>
            <Button size="sm" variant="secondary" asChild>
              <Link to="/entrar">Entrar</Link>
            </Button>
          </>
        )}

        {session && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-2 rounded-full border border-hairline px-2 py-1 hover:shadow-tier"
                aria-label="Menu da conta"
              >
                <Avatar className="h-7 w-7">
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[220px]">
              <DropdownMenuLabel className="line-clamp-1">
                {session.fullName ?? session.email}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {effectiveRole === "customer" && (
                <>
                  <DropdownMenuItem onClick={() => navigate("/bookings")}>
                    <Calendar className="h-4 w-4" /> Minhas reservas
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/account")}>
                    <User2 className="h-4 w-4" /> Conta
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/account/saved")}>
                    <Heart className="h-4 w-4" /> Favoritos
                  </DropdownMenuItem>
                </>
              )}
              {effectiveRole === "hub_admin" && (
                <DropdownMenuItem onClick={() => navigate("/manager")}>
                  <LayoutDashboard className="h-4 w-4" /> Ir pro Manager
                </DropdownMenuItem>
              )}
              {effectiveRole === "company_operator" && (
                <DropdownMenuItem onClick={() => navigate("/operator")}>
                  <LayoutDashboard className="h-4 w-4" /> Ir pro Operator
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void signOut()}>
                <LogOut className="h-4 w-4" /> Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
