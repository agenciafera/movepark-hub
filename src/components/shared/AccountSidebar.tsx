import { NavLink, useNavigate } from "react-router-dom";
import { Bell, Car, CaretRight, CreditCard, Gift, Heart, Lock, MapPin, SignOut, Sparkle, Ticket, User } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/context";
import { userInitials } from "@/lib/initials";
import { ReferralShareCard } from "@/features/growth/ReferralShareCard";
import { useMembership } from "@/features/growth/api";
import { ReferralSidebarBanner } from "@/features/growth/ReferralSidebarBanner";
import { useMyBookings } from "@/features/bookings/customerApi";
import { useMyVehicles } from "@/features/vehicles/api";

/**
 * A conta em três grupos: o que o cliente veio fazer (viagens), o que ele
 * cadastra uma vez (dados) e o resto (conta). Lista corrida de dez itens não
 * dizia qual era qual.
 */
const sections = [
  {
    title: "Minhas viagens",
    items: [
      { to: "/account/reservas", icon: Ticket, label: "Minhas reservas" },
      { to: "/account/saved", icon: Heart, label: "Favoritos" },
      { to: "/account/clube", icon: Sparkle, label: "Movepark Clube" },
      { to: "/account/indicar", icon: Gift, label: "Indique e ganhe" },
    ],
  },
  {
    title: "Meus dados",
    items: [
      { to: "/account/profile", icon: User, label: "Perfil" },
      { to: "/account/vehicles", icon: Car, label: "Veículos" },
      { to: "/account/cards", icon: CreditCard, label: "Cartões" },
      { to: "/account/addresses", icon: MapPin, label: "Endereços" },
    ],
  },
  {
    title: "Conta",
    items: [
      { to: "/account/preferences", icon: Bell, label: "Preferências" },
      { to: "/account/security", icon: Lock, label: "Segurança" },
    ],
  },
];

/** A lista chapada ainda serve pro menu de mobile. */
const items = sections.flatMap((s) => s.items);

/** Sidebar — desktop fica à esquerda 240px. Mobile esconde (usa SidebarMobile). */
export function AccountSidebar() {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  const profileId = session?.userId;
  // Os contadores da sidebar são contagem real: badge com número inventado é
  // pior que badge nenhum.
  const upcoming = useMyBookings(profileId, "upcoming");
  const vehicles = useMyVehicles(profileId);
  const membership = useMembership(!!profileId);
  const tierName = membership.data?.tier_name ?? null;
  const badges: Record<string, number> = {
    "/account/reservas": upcoming.data?.length ?? 0,
    "/account/vehicles": vehicles.data?.length ?? 0,
  };

  const firstName = session?.firstName ?? session?.email ?? "";
  // Mesmas iniciais do avatar da topbar (helper compartilhado): "Diego Guedes" → "DG".
  const initials = userInitials(session?.fullName, session?.email);

  async function handleSignOut() {
    await signOut();
    navigate("/", { replace: true });
  }

  return (
    <aside className="sticky top-5 hidden h-fit w-72 shrink-0 flex-col gap-6 rounded-lg bg-mp-navy px-4 py-6 desktop:flex">
      {/* Sem wordmark: a topbar do consumer fica visível nesta área e já carrega a
          marca. Repetir aqui gastava o topo da sidebar com a mesma informação. */}
      <h2 className="px-2 text-caption font-medium text-white/45">Minha conta</h2>

      {/* De quem é a conta. O nível do Clube entra quando o cliente já tem um. */}
      <div className="flex items-center gap-3 rounded-md bg-white/[0.06] p-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mp-primary text-caption font-semibold text-white">
          {initials}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body-sm font-medium text-white" title={firstName}>
            {firstName}
          </span>
          {tierName && (
            <span className="mt-0.5 block truncate text-caption text-white/55">
              Clube · nível {tierName}
            </span>
          )}
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-6">
        {sections.map((section) => (
          <div key={section.title} className="flex flex-col gap-0.5">
            <span className="px-3 pb-2 text-[11px] font-bold uppercase tracking-[0.4px] text-white/40">
              {section.title}
            </span>
            {section.items.map((item) => {
              const badge = badges[item.to] ?? 0;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-sm px-3 py-2.5 text-body-sm font-medium text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white",
                      isActive && "bg-mp-primary font-semibold text-white",
                    )
                  }
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {badge > 0 && (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white/15 px-2 text-caption-sm font-bold text-white">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}

      </nav>

      {/* Indicação no rodapé, logo acima do Sair: some sozinho quando o cliente
          ainda não tem código. */}
      <ReferralSidebarBanner />

      <button
        type="button"
        onClick={handleSignOut}
        className="flex w-full items-center gap-3 rounded-sm px-3 py-2.5 text-body-sm font-medium text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white"
      >
        <SignOut className="h-4 w-4 shrink-0" />
        Sair
      </button>

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
    <div className="space-y-2 desktop:hidden">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className="flex items-center gap-3 rounded-md border border-hairline bg-canvas px-4 py-3 text-body-md text-ink no-underline hover:shadow-tier"
        >
          <item.icon className="h-5 w-5 text-mp-indigo" />
          <span className="flex-1">{item.label}</span>
          <CaretRight className="h-4 w-4 text-muted" />
        </NavLink>
      ))}

      <ReferralShareCard className="mt-4" />

      <button
        type="button"
        onClick={handleSignOut}
        className="mt-4 flex w-full items-center gap-3 rounded-md border border-hairline bg-canvas px-4 py-3 text-body-md text-error hover:shadow-tier"
      >
        <SignOut className="h-5 w-5" />
        Sair
      </button>
    </div>
  );
}
