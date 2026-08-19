// Itens de navegação do Hub. Fonte única para a Sidebar (desktop/tablet) e a BottomNav (mobile),
// pra que nada que o usuário pode acessar fique fora de um dos dois.
//
// Nomes importam: "Preços" é o preço da diária (o que o parceiro cobra). "Tarifas" são as tarifas
// de flexibilidade Básica/Flex/Superflex da Movepark, editadas só pelo Super Admin no /manager
// (a unidade não toca nelas). Cada item tem um ícone próprio: em tablet a sidebar é só-ícone.

import { Airplane, Article, Bank, Buildings, Calendar, CalendarBlank, ChartBar, ChartPie, CurrencyCircleDollar, Gear, Handshake, Kanban, Key, LockKey, MapPin, MapTrifold, Megaphone, PaperPlaneTilt, Percent, Question, Receipt, Scroll, ShieldCheck, Sparkle, SquaresFour, Star, Tag, Users, UsersThree, Wallet } from "@phosphor-icons/react";
import type { NavItem, NavSection } from "./Sidebar.logic";

export type NavIcon = React.ComponentType<{ className?: string }>;
export type Item = NavItem<NavIcon>;
export type Section = NavSection<NavIcon>;

export const managerSections: Section[] = [
  {
    title: "Operação",
    items: [
      { to: "/manager", label: "Dashboard", shortLabel: "Início", icon: SquaresFour },
      { to: "/manager/companies", label: "Empresas", icon: Buildings },
      { to: "/manager/partners", label: "Parceiros", icon: Handshake },
      { to: "/manager/destinations", label: "Destinos", icon: Airplane },
      { to: "/manager/lotes-mapeados", label: "Lotes mapeados", icon: MapTrifold },
      { to: "/manager/bookings", label: "Reservas", icon: Calendar },
    ],
  },
  {
    title: "Financeiro",
    items: [
      { to: "/manager/finance/billing", label: "Financeiro", icon: Wallet },
      { to: "/manager/finance/payouts", label: "Repasses", icon: Receipt },
      { to: "/manager/finance/commissions", label: "Comissões", icon: Percent },
      { to: "/manager/finance/recipients", label: "Recebedores", icon: Bank },
      { to: "/manager/tarifas", label: "Tarifas", icon: ShieldCheck },
      { to: "/manager/attribution", label: "Atribuição", icon: ChartPie },
    ],
  },
  {
    // Seção sem título: o próprio item já nomeia a área, e um cabeçalho "Marketing" em cima de
    // um item só seria a mesma palavra duas vezes.
    items: [
      {
        to: "/manager/marketing",
        label: "Automação",
        icon: Megaphone,
        children: [
          { to: "/manager/marketing", label: "Perfis e funil", icon: ChartPie },
          { to: "/manager/marketing/leads", label: "Leads", icon: Kanban },
          { to: "/manager/marketing/segmentos", label: "Segmentos", icon: UsersThree },
          { to: "/manager/marketing/campanhas", label: "Campanhas", icon: PaperPlaneTilt },
        ],
      },
    ],
  },
  {
    title: "Conta",
    items: [
      { to: "/manager/destaques", label: "Destaques da home", icon: Sparkle },
      { to: "/manager/reviews", label: "Avaliações", icon: Star },
      { to: "/manager/blog", label: "Blog", icon: Article },
      { to: "/manager/faq", label: "FAQ", icon: Question },
      { to: "/manager/users", label: "Usuários", icon: Users },
      { to: "/manager/legal", label: "Documentos legais", icon: Scroll },
      { to: "/manager/api-interna", label: "API interna", icon: LockKey },
      { to: "/manager/settings", label: "Configurações", icon: Gear },
    ],
  },
];

// `scope` filtra o item pelo papel do operador (ADR-005). Sem scope = sempre visível
// (a ação dentro da página é que é gateada). Manager (hub_admin) vê tudo.
export const operatorSections: Section[] = [
  {
    title: "Operação",
    items: [
      { to: "/operator", label: "Dashboard", shortLabel: "Início", icon: SquaresFour },
      { to: "/operator/bookings", label: "Reservas", icon: Calendar },
      {
        to: "/operator/occupancy",
        label: "Ocupação",
        icon: CalendarBlank,
        scope: "occupancy:read",
      },
      { to: "/operator/locations", label: "Unidades", shortLabel: "Unidades", icon: MapPin },
      { to: "/operator/addons", label: "Serviços", icon: Sparkle, scope: "addons:write" },
      { to: "/operator/reviews", label: "Avaliações", icon: Star, scope: "reviews:read" },
    ],
  },
  {
    title: "Preços",
    items: [
      {
        to: "/operator/pricing",
        label: "Preços",
        icon: CurrencyCircleDollar,
        scope: "pricing:write",
      },
      { to: "/operator/coupons", label: "Promoções", icon: Tag, scope: "coupons:write" },
    ],
  },
  {
    title: "Financeiro",
    items: [
      { to: "/operator/finance", label: "Repasses", icon: Receipt, scope: "finance:read" },
      { to: "/operator/reports", label: "Relatórios", icon: ChartBar },
    ],
  },
  {
    title: "Conta",
    items: [
      { to: "/operator/users", label: "Usuários", icon: Users, scope: "team:read" },
      { to: "/operator/faq", label: "FAQ", icon: Question },
      { to: "/operator/api-keys", label: "API", icon: Key, scope: "api-keys:write" },
      { to: "/operator/settings", label: "Configurações", icon: Gear },
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
