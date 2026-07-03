import { Link, Outlet, useNavigate } from "react-router-dom";
import { LogOut, User2, Calendar, Heart, LayoutDashboard } from "@/lib/icons";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth/context";
import { Wordmark } from "./Brand";

function CheckoutTopbar() {
  const { session, effectiveRole, signOut } = useAuth();
  const navigate = useNavigate();

  const initials = (session?.fullName ?? session?.email ?? "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-canvas">
      <div className="mx-auto flex h-16 w-full max-w-[1080px] items-center justify-between px-4 desktop:px-8">
        <Link to="/" aria-label="Voltar para a home">
          <Wordmark height={20} />
        </Link>

        <div>
          {!session && (
            <Button size="sm" variant="ghost" asChild>
              <Link to="/entrar">Entrar</Link>
            </Button>
          )}

          {session && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center gap-2 rounded-full border border-hairline px-2 py-1 hover:shadow-tier focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2"
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
      </div>
    </header>
  );
}

export function CheckoutShell() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <CheckoutTopbar />
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
