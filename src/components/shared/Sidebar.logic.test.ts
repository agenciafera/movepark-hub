import { describe, expect, it } from "vitest";
import {
  buildBottomNav,
  filterNavByScopes,
  filterSectionsByScopes,
  flattenSections,
  type NavItem,
  type NavSection,
} from "./Sidebar.logic";

const items: NavItem<null>[] = [
  { to: "/operator", label: "Dashboard", icon: null },
  { to: "/operator/coupons", label: "Promoções", icon: null, scope: "coupons:write" },
  { to: "/operator/finance", label: "Repasses", icon: null, scope: "finance:read" },
  { to: "/operator/faq", label: "FAQ", icon: null },
];

const sections: NavSection<null>[] = [
  {
    title: "Operação",
    items: [
      { to: "/operator", label: "Dashboard", shortLabel: "Início", icon: null },
      { to: "/operator/bookings", label: "Reservas", icon: null },
    ],
  },
  {
    title: "Preços",
    items: [
      { to: "/operator/pricing", label: "Preços", icon: null, scope: "pricing:write" },
      {
        to: "/operator/fares",
        label: "Planos de cancelamento",
        icon: null,
        scope: "pricing:write",
      },
      { to: "/operator/coupons", label: "Promoções", icon: null, scope: "coupons:write" },
    ],
  },
  {
    title: "Financeiro",
    items: [{ to: "/operator/finance", label: "Repasses", icon: null, scope: "finance:read" }],
  },
];

describe("filterNavByScopes", () => {
  it("mantém itens sem escopo e os com escopo concedido", () => {
    const has = (s: string) => s === "coupons:write";
    const out = filterNavByScopes(items, has).map((i) => i.label);
    expect(out).toEqual(["Dashboard", "Promoções", "FAQ"]); // Repasses (finance:read) escondido
  });

  it("sem nenhum escopo, sobram só os itens livres", () => {
    const out = filterNavByScopes(items, () => false).map((i) => i.label);
    expect(out).toEqual(["Dashboard", "FAQ"]);
  });

  it("com todos os escopos, mostra tudo", () => {
    const out = filterNavByScopes(items, () => true).map((i) => i.label);
    expect(out).toHaveLength(4);
  });
});

describe("filterSectionsByScopes", () => {
  it("filtra item por escopo e descarta seção que ficou vazia", () => {
    const out = filterSectionsByScopes(sections, (s) => s === "pricing:write");
    expect(out.map((s) => s.title)).toEqual(["Operação", "Preços"]); // Financeiro sumiu
    expect(out[1].items.map((i) => i.label)).toEqual(["Preços", "Planos de cancelamento"]);
  });

  it("com todos os escopos, mantém as seções na ordem", () => {
    const out = filterSectionsByScopes(sections, () => true);
    expect(out.map((s) => s.title)).toEqual(["Operação", "Preços", "Financeiro"]);
    expect(flattenSections(out)).toHaveLength(6);
  });
});

describe("buildBottomNav", () => {
  const primaryPaths = ["/operator", "/operator/bookings", "/operator/pricing", "/operator/finance"];

  it("todo item permitido está ou nos diretos ou no Mais", () => {
    const { primary, more } = buildBottomNav(sections, () => true, primaryPaths);
    const all = [...primary.map((i) => i.to), ...flattenSections(more).map((i) => i.to)];
    expect(all.sort()).toEqual(
      flattenSections(sections)
        .map((i) => i.to)
        .sort(),
    );
  });

  it("no máximo 4 destinos diretos, na ordem pedida", () => {
    const { primary } = buildBottomNav(sections, () => true, [
      ...primaryPaths,
      "/operator/coupons",
    ]);
    expect(primary.map((i) => i.to)).toEqual(primaryPaths);
  });

  it("item sem escopo não entra nem nos diretos nem no Mais", () => {
    const { primary, more } = buildBottomNav(sections, () => false, primaryPaths);
    expect(primary.map((i) => i.to)).toEqual(["/operator", "/operator/bookings"]);
    expect(flattenSections(more).map((i) => i.to)).toEqual([]);
  });

  it("promove o próximo caminho disponível quando um primário fica sem escopo", () => {
    const { primary, more } = buildBottomNav(
      sections,
      (s) => s === "coupons:write",
      [...primaryPaths, "/operator/coupons"],
    );
    // /operator/pricing e /operator/finance sumiram por escopo; Promoções assume a vaga.
    expect(primary.map((i) => i.to)).toEqual([
      "/operator",
      "/operator/bookings",
      "/operator/coupons",
    ]);
    expect(flattenSections(more)).toHaveLength(0);
  });
});
