import { NavLink, useNavigate } from "react-router-dom";
import {
  User2,
  Ticket,
  Car,
  MapPin,
  CreditCard,
  Heart,
  Bell,
  Lock,
  LogOut,
  ChevronRight,
  Sparkles,
  Gift,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/context";
import { userInitials } from "@/lib/initials";
import { ReferralShareCard } from "@/features/growth/ReferralShareCard";

// Perfil vem primeiro (padrão de dashboard). Minhas reservas logo abaixo, por ser
// a ação mais frequente do cliente, e dentro do próprio shell da conta
// (`/account/reservas`) pra não perder a sidebar ao abrir as reservas.
const items = [
  { to: "/account/profile", icon: User2, label: "Perfil" },
  { to: "/account/reservas", icon: Ticket, label: "Minhas reservas" },
  { to: "/account/clube", icon: Sparkles, label: "Movepark Clube" },
  { to: "/account/indicar", icon: Gift, label: "Indique e ganhe" },
  { to: "/account/vehicles", icon: Car, label: "Veículos" },
  { to: "/account/addresses", icon: MapPin, label: "Endereços" },
  { to: "/account/cards", icon: CreditCard, label: "Cartões" },
  { to: "/account/saved", icon: Heart, label: "Favoritos" },
  { to: "/account/preferences", icon: Bell, label: "Preferências" },
  { to: "/account/security", icon: Lock, label: "Segurança" },
];

/** Sidebar — desktop fica à esquerda 240px. Mobile esconde (usa SidebarMobile). */
export function AccountSidebar() {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();

  const firstName = session?.firstName ?? session?.email ?? "";
  // Mesmas iniciais do avatar da topbar (helper compartilhado): "Diego Guedes" → "DG".
  const initials = userInitials(session?.fullName, session?.email);

  async function handleSignOut() {
    await signOut();
    navigate("/", { replace: true });
  }

  return (
    <aside className="hidden h-fit w-60 shrink-0 flex-col gap-4 sticky top-24 desktop:flex">
      {/* Card de saudação fixo no topo da sidebar: identifica de quem é a conta,
          separado da navegação. Avatar com a inicial + nome. */}
      <div className="flex items-center gap-3 rounded-md border border-hairline bg-canvas p-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mp-pale text-title-sm font-semibold text-mp-indigo">
          {initials}
        </span>
        <div className="min-w-0">
          <p className="text-caption-sm text-muted">Olá,</p>
          <p className="truncate text-title-sm text-ink">{firstName}</p>
        </div>
      </div>

      {/* Nav num card branco: sobre o fundo de painel cinza das áreas logadas, a
          sidebar precisa de superfície pra ler como sidebar (antes era lista solta). */}
      <nav className="flex flex-col gap-1 rounded-md border border-hairline bg-canvas p-2">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "group flex items-center gap-3 rounded-sm px-3 py-2 text-body-sm text-muted transition-colors hover:bg-surface-soft hover:text-ink",
                // Ativo = pílula pale com texto e ícone em indigo (acento da marca),
                // o mesmo idioma da sidebar de categorias da FAQ.
                isActive && "bg-mp-pale font-medium text-mp-indigo",
              )
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}

        <div className="mt-1 border-t border-hairline pt-1">
          <button
            type="button"
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-sm px-3 py-2 text-body-sm text-error hover:bg-surface-soft"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </nav>

      <ReferralShareCard />
    </aside>
  );
}

/** Lista de cards usada apenas no /account raiz em mobile. */
export function AccountMobileMenu() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate("/", { replace: true });
  }

  return (
    <div className="desktop:hidden space-y-2">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className="flex items-center gap-3 rounded-md border border-hairline bg-canvas px-4 py-3 text-body-md text-ink no-underline hover:shadow-tier"
        >
          <item.icon className="h-5 w-5 text-mp-indigo" />
          <span className="flex-1">{item.label}</span>
          <ChevronRight className="h-4 w-4 text-muted" />
        </NavLink>
      ))}

      <ReferralShareCard className="mt-4" />

      <button
        type="button"
        onClick={handleSignOut}
        className="mt-4 flex w-full items-center gap-3 rounded-md border border-hairline bg-canvas px-4 py-3 text-body-md text-error hover:shadow-tier"
      >
        <LogOut className="h-5 w-5" />
        Sair
      </button>
    </div>
  );
}
