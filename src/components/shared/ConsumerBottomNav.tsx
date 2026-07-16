import { NavLink } from "react-router-dom";
import { MapPin, Calendar, User2, HelpCircle, LogIn, Store } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/context";

const baseItem =
  "flex flex-col items-center gap-1 py-2 text-caption-sm text-muted transition-colors";
const activeItem = "text-ink";

export function ConsumerBottomNav() {
  const { session } = useAuth();
  return (
    <nav className="tablet:hidden fixed bottom-0 left-0 right-0 z-40 grid grid-cols-4 border-t border-hairline bg-canvas">
      {/* Col 1: Destinos — sempre (a busca já vive no navbar/hero) */}
      <NavLink to="/destinos" className={({ isActive }) => cn(baseItem, isActive && activeItem)}>
        <MapPin className="h-5 w-5" />
        <span>Destinos</span>
      </NavLink>

      {/* Col 2: Reservas (logado) | Entrar (anônimo) */}
      {session ? (
        <NavLink to="/bookings" className={({ isActive }) => cn(baseItem, isActive && activeItem)}>
          <Calendar className="h-5 w-5" />
          <span>Reservas</span>
        </NavLink>
      ) : (
        <NavLink to="/login" className={({ isActive }) => cn(baseItem, isActive && activeItem)}>
          <LogIn className="h-5 w-5" />
          <span>Entrar</span>
        </NavLink>
      )}

      {/* Col 3: Conta (logado) | Seja parceiro (anônimo) */}
      {session ? (
        <NavLink to="/account" className={({ isActive }) => cn(baseItem, isActive && activeItem)}>
          <User2 className="h-5 w-5" />
          <span>Conta</span>
        </NavLink>
      ) : (
        <NavLink to="/seja-parceiro" className={({ isActive }) => cn(baseItem, isActive && activeItem)}>
          <Store className="h-5 w-5" />
          <span>Parceiro</span>
        </NavLink>
      )}

      {/* Col 4: Ajuda — sempre */}
      <NavLink to="/ajuda" className={({ isActive }) => cn(baseItem, isActive && activeItem)}>
        <HelpCircle className="h-5 w-5" />
        <span>Ajuda</span>
      </NavLink>
    </nav>
  );
}
