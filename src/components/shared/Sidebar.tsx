import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  Calendar,
  BarChart3,
  Users,
  Settings,
  MapPin,
  Wallet,
  HelpCircle,
  Handshake,
  Plane,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Monogram, Wordmark } from "./Brand";

type Item = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const managerItems: Item[] = [
  { to: "/manager", label: "Dashboard", icon: LayoutDashboard },
  { to: "/manager/companies", label: "Empresas", icon: Building2 },
  { to: "/manager/partners", label: "Parceiros", icon: Handshake },
  { to: "/manager/destinations", label: "Destinos", icon: Plane },
  { to: "/manager/bookings", label: "Reservas", icon: Calendar },
  { to: "/manager/finance/billing", label: "Financeiro", icon: Wallet },
  { to: "/manager/faq", label: "FAQ", icon: HelpCircle },
  { to: "/manager/users", label: "Usuários", icon: Users },
  { to: "/manager/settings", label: "Configurações", icon: Settings },
];

const operatorItems: Item[] = [
  { to: "/operator", label: "Dashboard", icon: LayoutDashboard },
  { to: "/operator/bookings", label: "Reservas", icon: Calendar },
  { to: "/operator/locations", label: "Localizações", icon: MapPin },
  { to: "/operator/addons", label: "Serviços", icon: Sparkles },
  { to: "/operator/faq", label: "FAQ", icon: HelpCircle },
  { to: "/operator/reports", label: "Relatórios", icon: BarChart3 },
  { to: "/operator/settings", label: "Configurações", icon: Settings },
];

export function Sidebar({
  variant,
  brandTitle,
}: {
  variant: "manager" | "operator";
  brandTitle?: string;
}) {
  const items = variant === "manager" ? managerItems : operatorItems;
  return (
    <aside className="hidden tablet:flex h-full w-[64px] desktop:w-[240px] shrink-0 flex-col border-r border-hairline bg-surface-soft px-3 py-6">
      <div className="hidden desktop:flex flex-col gap-1 px-3 pb-8">
        <Wordmark height={22} />
        {brandTitle && (
          <span className="pl-px text-[11px] font-bold uppercase tracking-[0.4px] text-muted-steel">
            {brandTitle}
          </span>
        )}
      </div>
      <div className="flex desktop:hidden justify-center pb-8">
        <Monogram size={28} />
      </div>

      <nav className="flex flex-col gap-1">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/manager" || item.to === "/operator"}
            className={({ isActive }) =>
              cn(
                "relative flex items-center gap-3 rounded-sm px-3 py-2 text-body-sm text-muted transition-colors hover:bg-canvas hover:text-ink",
                isActive &&
                  "bg-canvas font-medium text-ink shadow-tier before:absolute before:inset-y-2 before:left-0 before:w-[2px] before:rounded-full before:bg-mp-navy",
              )
            }
            title={item.label}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="hidden desktop:inline">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
