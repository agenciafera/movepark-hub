import { NavLink, useNavigate } from "react-router-dom";
import {
  User2,
  Car,
  MapPin,
  CreditCard,
  Heart,
  Bell,
  Lock,
  LogOut,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/context";
import { ReferralShareCard } from "@/features/growth/ReferralShareCard";

const items = [
  { to: "/account/clube", icon: Sparkles, label: "Movepark Clube" },
  { to: "/account/profile", icon: User2, label: "Perfil" },
  { to: "/account/vehicles", icon: Car, label: "Veículos" },
  { to: "/account/addresses", icon: MapPin, label: "Endereços" },
  { to: "/account/cards", icon: CreditCard, label: "Cartões" },
  { to: "/account/saved", icon: Heart, label: "Favoritos" },
  { to: "/account/preferences", icon: Bell, label: "Preferências" },
  { to: "/account/security", icon: Lock, label: "Segurança" },
];

/** Sidebar — desktop fica à esquerda 240px. Mobile esconde (usa SidebarMobile). */
export function AccountSidebar() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate("/", { replace: true });
  }

  return (
    <aside className="hidden desktop:flex h-fit w-60 shrink-0 flex-col gap-1 sticky top-24">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-sm px-3 py-2 text-body-sm text-muted transition-colors hover:bg-surface-soft hover:text-ink",
              isActive &&
                "bg-canvas font-medium text-ink shadow-tier",
            )
          }
        >
          <item.icon className="h-4 w-4" />
          {item.label}
        </NavLink>
      ))}

      <ReferralShareCard className="mt-4" />

      <div className="mt-3 border-t border-hairline pt-3">
        <button
          type="button"
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-sm px-3 py-2 text-body-sm text-error hover:bg-surface-soft"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </div>
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
