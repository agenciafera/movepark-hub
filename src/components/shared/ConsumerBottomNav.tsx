import { NavLink } from "react-router-dom";
import { Calendar, MapPin, Question, SignIn, Storefront, User } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/context";

// `min-h-[44px]` mantém o alvo de toque no mínimo acessível mesmo com o rótulo menor.
const baseItem =
  "flex min-h-[44px] flex-col items-center justify-center gap-1 py-2 text-muted transition-colors";
const activeItem = "text-ink";

/**
 * O tamanho mora no span, não no item. No item ele passaria pelo `cn()`, e o
 * tailwind-merge trata `text-tab-label` e `text-muted` como conflito e descarta o
 * primeiro: era assim que o rótulo vinha herdando 16px em vez do tamanho do token.
 */
const labelClass = "text-tab-label";

export function ConsumerBottomNav() {
  const { session } = useAuth();
  return (
    // `pb` afasta os itens da borda de baixo. `max(0.5rem, safe-area)` garante uma
    // folga mínima mesmo em aparelho sem recorte (onde safe-area = 0) e respeita o
    // indicador de home onde ele existe, sem empilhar os dois. Sem isso o último toque
    // cai em cima da faixa do sistema e o dedo erra o alvo.
    <nav className="tablet:hidden fixed bottom-0 left-0 right-0 z-40 grid grid-cols-4 border-t border-hairline bg-canvas pb-[max(0.5rem,var(--safe-bottom))]">
      {/* Col 1: Destinos — sempre (a busca já vive no navbar/hero) */}
      <NavLink to="/destinos" className={({ isActive }) => cn(baseItem, isActive && activeItem)}>
        <MapPin className="h-5 w-5" />
        <span className={labelClass}>Destinos</span>
      </NavLink>

      {/* Col 2: Reservas (logado) | Entrar (anônimo) */}
      {session ? (
        <NavLink to="/bookings" className={({ isActive }) => cn(baseItem, isActive && activeItem)}>
          <Calendar className="h-5 w-5" />
          <span className={labelClass}>Reservas</span>
        </NavLink>
      ) : (
        <NavLink to="/login" className={({ isActive }) => cn(baseItem, isActive && activeItem)}>
          <SignIn className="h-5 w-5" />
          <span className={labelClass}>Entrar</span>
        </NavLink>
      )}

      {/* Col 3: Conta (logado) | Seja parceiro (anônimo) */}
      {session ? (
        <NavLink to="/account" className={({ isActive }) => cn(baseItem, isActive && activeItem)}>
          <User className="h-5 w-5" />
          <span className={labelClass}>Conta</span>
        </NavLink>
      ) : (
        <NavLink to="/seja-parceiro" className={({ isActive }) => cn(baseItem, isActive && activeItem)}>
          <Storefront className="h-5 w-5" />
          <span className={labelClass}>Parceiro</span>
        </NavLink>
      )}

      {/* Col 4: Ajuda — sempre */}
      <NavLink to="/ajuda" className={({ isActive }) => cn(baseItem, isActive && activeItem)}>
        <Question className="h-5 w-5" />
        <span className={labelClass}>Ajuda</span>
      </NavLink>
    </nav>
  );
}
