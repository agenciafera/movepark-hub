import type { ComponentType } from "react";
import { NavLink } from "react-router-dom";
import type { IconProps } from "@phosphor-icons/react";
import { Calendar, MapPin, Question, SignIn, Storefront, User } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/context";

type Icon = ComponentType<IconProps>;

// `min-h-[44px]` mantém o alvo de toque no mínimo acessível mesmo com o rótulo menor.
// `relative` ancora o traço do item selecionado.
const baseItem =
  "relative flex min-h-[44px] flex-col items-center justify-center gap-1 py-2 text-muted transition-colors";
const activeItem = "text-mp-primary";

/**
 * O tamanho mora no span, não no item. No item ele passaria pelo `cn()`, e o
 * tailwind-merge trata `text-tab-label` e `text-muted` como conflito e descarta o
 * primeiro: era assim que o rótulo vinha herdando 16px em vez do tamanho do token.
 */
const labelClass = "text-tab-label";

/**
 * Item da barra inferior.
 *
 * O selecionado ganha um traço violeta no topo, encostado na borda da barra
 * (`-top-px` cobre o hairline de 1px). Antes a única marca de seleção era o texto
 * passar de cinza pra preto, diferença fraca demais numa barra de 4 alvos vista
 * na mão, no sol. O traço é a mesma gramática do app do Facebook: barra em cima,
 * item na cor da marca, ícone preenchido.
 */
function TabItem({ to, icon: Icon, label }: { to: string; icon: Icon; label: string }) {
  return (
    <NavLink to={to} className={({ isActive }) => cn(baseItem, isActive && activeItem)}>
      {({ isActive }) => (
        <>
          {isActive && (
            <span
              className="absolute inset-x-0 -top-px h-[3px] bg-mp-primary"
              aria-hidden
              data-testid={`tab-indicator-${label}`}
            />
          )}
          <Icon className="h-5 w-5" weight={isActive ? "fill" : "regular"} />
          <span className={labelClass}>{label}</span>
        </>
      )}
    </NavLink>
  );
}

export function ConsumerBottomNav() {
  const { session } = useAuth();
  return (
    // `pb` afasta os itens da borda de baixo. `max(0.5rem, safe-area)` garante uma
    // folga mínima mesmo em aparelho sem recorte (onde safe-area = 0) e respeita o
    // indicador de home onde ele existe, sem empilhar os dois. Sem isso o último toque
    // cai em cima da faixa do sistema e o dedo erra o alvo.
    <nav className="tablet:hidden fixed bottom-0 left-0 right-0 z-40 grid grid-cols-4 border-t border-hairline bg-canvas pb-[max(0.5rem,var(--safe-bottom))]">
      {/* Col 1: Destinos — sempre (a busca já vive no navbar/hero) */}
      <TabItem to="/destinos" icon={MapPin} label="Destinos" />

      {/* Col 2: Reservas (logado) | Entrar (anônimo) */}
      {session ? (
        <TabItem to="/bookings" icon={Calendar} label="Reservas" />
      ) : (
        <TabItem to="/login" icon={SignIn} label="Entrar" />
      )}

      {/* Col 3: Conta (logado) | Seja parceiro (anônimo) */}
      {session ? (
        <TabItem to="/account" icon={User} label="Conta" />
      ) : (
        <TabItem to="/seja-parceiro" icon={Storefront} label="Parceiro" />
      )}

      {/* Col 4: Ajuda — sempre */}
      <TabItem to="/ajuda" icon={Question} label="Ajuda" />
    </nav>
  );
}
