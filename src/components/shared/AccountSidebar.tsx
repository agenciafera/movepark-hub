import { NavLink, useNavigate } from "react-router-dom";
import {
  Bell,
  Car,
  CaretRight,
  CreditCard,
  Gift,
  Heart,
  Lock,
  MapPin,
  SignOut,
  Sparkle,
  Ticket,
  User,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/context";
import { userInitials } from "@/lib/initials";
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

/** Sidebar do desktop, 240px à esquerda. No mobile quem responde é o AccountMobileMenu. */
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

const LINHA =
  "flex min-h-12 w-full items-center gap-3 rounded-sm px-1 py-3 text-body-md no-underline transition-colors hover:bg-surface-soft";

/**
 * Menu do /account no mobile.
 *
 * Cada item era um retângulo com borda e sombra no hover. Dez botões empilhados
 * viravam dez caixas: a moldura ficava com o peso visual que deveria ser do
 * rótulo, e a lista parecia um formulário. Agora é linha corrida, com ícone à
 * esquerda e seta à direita, que é o que a própria seta já prometia.
 *
 * Os grupos vieram do desktop. A lista corrida de dez itens não dizia qual era
 * qual, e essa foi a razão de agrupar lá; no mobile o problema era o mesmo e a
 * solução tinha ficado de fora.
 */
export function AccountMobileMenu() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate("/", { replace: true });
  }

  return (
    <div className="desktop:hidden">
      {sections.map((section) => (
        <div key={section.title} className="mb-6">
          <span className="mb-1 block px-1 text-[11px] font-bold uppercase tracking-[0.4px] text-mp-indigo">
            {section.title}
          </span>
          {section.items.map((item) => (
            <NavLink key={item.to} to={item.to} className={cn(LINHA, "text-ink")}>
              <item.icon className="h-5 w-5 shrink-0 text-mp-indigo" />
              <span className="flex-1">{item.label}</span>
              <CaretRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
            </NavLink>
          ))}
        </div>
      ))}

      {/* O mesmo banner do rodapé da sidebar do desktop. O card antigo daqui
          tinha outro layout, e a mesma oferta com duas caras em duas telas faz
          parecer que são duas ofertas. */}
      <ReferralSidebarBanner />

      <button type="button" onClick={handleSignOut} className={cn(LINHA, "mt-6 text-error")}>
        <SignOut className="h-5 w-5 shrink-0" />
        Sair
      </button>
    </div>
  );
}
