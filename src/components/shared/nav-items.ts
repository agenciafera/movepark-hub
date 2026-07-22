// Itens de navegação do Hub. Fonte única para a Sidebar (desktop/tablet) e a BottomNav (mobile),
// pra que nada que o usuário pode acessar fique fora de um dos dois.
//
// Nomes importam: "Preços" é o preço da diária (o que o parceiro cobra). "Planos de cancelamento"
// são os planos Básica/Flex/Superflex da Movepark (a rota /operator/fares segue a mesma, só o
// rótulo mudou). Cada item tem um ícone próprio: em tablet a sidebar é só-ícone.

import {
  BarChart3,
  Building2,
  Calendar,
  CalendarRange,
  CircleDollarSign,
  Handshake,
  HelpCircle,
  KeyRound,
  Landmark,
  LayoutDashboard,
  MapPin,
  Percent,
  PieChart,
  Plane,
  Receipt,
  ScrollText,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Tag,
  Users,
  Wallet,
} from "lucide-react";
import type { NavItem, NavSection } from "./Sidebar.logic";

export type NavIcon = React.ComponentType<{ className?: string }>;
export type Item = NavItem<NavIcon>;
export type Section = NavSection<NavIcon>;

export const managerSections: Section[] = [
  {
    title: "Operação",
    items: [
      { to: "/manager", label: "Dashboard", shortLabel: "Início", icon: LayoutDashboard },
      { to: "/manager/companies", label: "Empresas", icon: Building2 },
      { to: "/manager/partners", label: "Parceiros", icon: Handshake },
      { to: "/manager/destinations", label: "Destinos", icon: Plane },
      { to: "/manager/bookings", label: "Reservas", icon: Calendar },
    ],
  },
  {
    title: "Financeiro",
    items: [
      { to: "/manager/finance/billing", label: "Financeiro", icon: Wallet },
      { to: "/manager/finance/payouts", label: "Repasses", icon: Receipt },
      { to: "/manager/finance/commissions", label: "Comissões", icon: Percent },
      { to: "/manager/finance/recipients", label: "Recebedores", icon: Landmark },
      { to: "/manager/attribution", label: "Atribuição", icon: PieChart },
    ],
  },
  {
    title: "Conta",
    items: [
      { to: "/manager/reviews", label: "Avaliações", icon: Star },
      { to: "/manager/faq", label: "FAQ", icon: HelpCircle },
      { to: "/manager/users", label: "Usuários", icon: Users },
      { to: "/manager/legal", label: "Documentos legais", icon: ScrollText },
      { to: "/manager/settings", label: "Configurações", icon: Settings },
    ],
  },
];

// `scope` filtra o item pelo papel do operador (ADR-005). Sem scope = sempre visível
// (a ação dentro da página é que é gateada). Manager (hub_admin) vê tudo.
export const operatorSections: Section[] = [
  {
    title: "Operação",
    items: [
      { to: "/operator", label: "Dashboard", shortLabel: "Início", icon: LayoutDashboard },
      { to: "/operator/bookings", label: "Reservas", icon: Calendar },
      {
        to: "/operator/occupancy",
        label: "Ocupação",
        icon: CalendarRange,
        scope: "occupancy:read",
      },
      { to: "/operator/locations", label: "Localizações", shortLabel: "Locais", icon: MapPin },
      { to: "/operator/addons", label: "Serviços", icon: Sparkles, scope: "addons:write" },
      { to: "/operator/reviews", label: "Avaliações", icon: Star, scope: "reviews:read" },
    ],
  },
  {
    title: "Preços",
    items: [
      {
        to: "/operator/pricing",
        label: "Preços",
        icon: CircleDollarSign,
        scope: "pricing:write",
      },
      {
        to: "/operator/fares",
        label: "Planos de cancelamento",
        shortLabel: "Planos",
        icon: ShieldCheck,
        // `fares:write` é escopo de PLATAFORMA (ADR-005): pertence à Movepark, e
        // um trigger recusa concedê-lo a papel de empresa. Efeito: o item some
        // do menu do parceiro, e o hub_admin continua vendo (o `hasScope` dele é
        // sempre true, inclusive impersonando, que é como ele chega aqui).
        // Antes era `pricing:write`, que é preço de diária e não tem relação
        // com plano de cancelamento.
        scope: "fares:write",
      },
      { to: "/operator/coupons", label: "Promoções", icon: Tag, scope: "coupons:write" },
    ],
  },
  {
    title: "Financeiro",
    items: [
      { to: "/operator/finance", label: "Repasses", icon: Receipt, scope: "finance:read" },
      { to: "/operator/reports", label: "Relatórios", icon: BarChart3 },
    ],
  },
  {
    title: "Conta",
    items: [
      { to: "/operator/users", label: "Usuários", icon: Users, scope: "team:read" },
      { to: "/operator/faq", label: "FAQ", icon: HelpCircle },
      { to: "/operator/api-keys", label: "API", icon: KeyRound, scope: "api-keys:write" },
      { to: "/operator/settings", label: "Configurações", icon: Settings },
    ],
  },
];

/** Destinos diretos da barra inferior do mobile. O resto vive no menu "Mais". */
export const managerPrimaryPaths = [
  "/manager",
  "/manager/companies",
  "/manager/bookings",
  "/manager/users",
];

export const operatorPrimaryPaths = [
  "/operator",
  "/operator/bookings",
  "/operator/occupancy",
  "/operator/pricing",
  "/operator/locations",
  "/operator/reports",
];
