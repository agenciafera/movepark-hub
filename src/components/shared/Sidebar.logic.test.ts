import { describe, expect, it } from "vitest";
import { filterNavByScopes, type NavItem } from "./Sidebar.logic";

const items: NavItem<null>[] = [
  { to: "/operator", label: "Dashboard", icon: null },
  { to: "/operator/coupons", label: "Promoções", icon: null, scope: "coupons:write" },
  { to: "/operator/finance", label: "Repasses", icon: null, scope: "finance:read" },
  { to: "/operator/faq", label: "FAQ", icon: null },
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
