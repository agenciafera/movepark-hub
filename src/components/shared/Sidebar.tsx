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
  Tag,
  Star,
  CalendarRange,
  KeyRound,
  Receipt,
  PieChart,
  Landmark,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/context";
import { filterNavByScopes, type NavItem } from "./Sidebar.logic";
import { Monogram, Wordmark } from "./Brand";

type Item = NavItem<React.ComponentType<{ className?: string }>>;

const managerItems: Item[] = [
  { to: "/manager", label: "Dashboard", icon: LayoutDashboard },
  { to: "/manager/companies", label: "Empresas", icon: Building2 },
  { to: "/manager/partners", label: "Parceiros", icon: Handshake },
  { to: "/manager/destinations", label: "Destinos", icon: Plane },
  { to: "/manager/bookings", label: "Reservas", icon: Calendar },
  { to: "/manager/finance/billing", label: "Financeiro", icon: Wallet },
  { to: "/manager/finance/payouts", label: "Repasses", icon: Receipt },
  { to: "/manager/finance/recipients", label: "Recebedores", icon: Landmark },
  { to: "/manager/attribution", label: "Atribuição", icon: PieChart },
  { to: "/manager/reviews", label: "Avaliações", icon: Star },
  { to: "/manager/faq", label: "FAQ", icon: HelpCircle },
  { to: "/manager/users", label: "Usuários", icon: Users },
  { to: "/manager/settings", label: "Configurações", icon: Settings },
];

// `scope` filtra o item pelo papel do operador (ADR-005). Sem scope = sempre visível
// (a ação dentro da página é que é gateada). Manager (hub_admin) vê tudo.
const operatorItems: Item[] = [
  { to: "/operator", label: "Dashboard", icon: LayoutDashboard },
  { to: "/operator/bookings", label: "Reservas", icon: Calendar },
  { to: "/operator/locations", label: "Localizações", icon: MapPin },
  { to: "/operator/occupancy", label: "Ocupação", icon: CalendarRange, scope: "occupancy:read" },
  { to: "/operator/addons", label: "Serviços", icon: Sparkles, scope: "addons:write" },
  { to: "/operator/coupons", label: "Promoções", icon: Tag, scope: "coupons:write" },
  { to: "/operator/reviews", label: "Avaliações", icon: Star, scope: "reviews:read" },
  { to: "/operator/users", label: "Usuários", icon: Users, scope: "team:read" },
  { to: "/operator/faq", label: "FAQ", icon: HelpCircle },
  { to: "/operator/finance", label: "Repasses", icon: Receipt, scope: "finance:read" },
  { to: "/operator/reports", label: "Relatórios", icon: BarChart3 },
  { to: "/operator/api-keys", label: "API", icon: KeyRound, scope: "api-keys:write" },
  { to: "/operator/settings", label: "Configurações", icon: Settings },
];

export function Sidebar({
  variant,
  brandTitle,
}: {
  variant: "manager" | "operator";
  brandTitle?: string;
}) {
  const { hasScope } = useAuth();
  const items =
    variant === "manager" ? managerItems : filterNavByScopes(operatorItems, hasScope);
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
