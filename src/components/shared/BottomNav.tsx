import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  Calendar,
  Users,
  MapPin,
  BarChart3,
} from "@/lib/icons";
import { cn } from "@/lib/utils";

const managerItems = [
  { to: "/manager", label: "Início", icon: LayoutDashboard },
  { to: "/manager/companies", label: "Empresas", icon: Building2 },
  { to: "/manager/bookings", label: "Reservas", icon: Calendar },
  { to: "/manager/users", label: "Usuários", icon: Users },
];

const operatorItems = [
  { to: "/operator", label: "Início", icon: LayoutDashboard },
  { to: "/operator/bookings", label: "Reservas", icon: Calendar },
  { to: "/operator/locations", label: "Locais", icon: MapPin },
  { to: "/operator/reports", label: "Relatórios", icon: BarChart3 },
];

export function BottomNav({ variant }: { variant: "manager" | "operator" }) {
  const items = variant === "manager" ? managerItems : operatorItems;
  return (
    <nav className="tablet:hidden fixed bottom-0 left-0 right-0 z-40 grid grid-cols-4 border-t border-hairline bg-canvas">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/manager" || item.to === "/operator"}
          className={({ isActive }) =>
            cn(
              "flex flex-col items-center gap-1 py-2 text-caption-sm text-muted",
              isActive && "text-ink",
            )
          }
        >
          <item.icon className="h-4 w-4" />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
