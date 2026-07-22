import { describe, expect, it } from "vitest";
import { groupHits, hitUrl, navCommands } from "./palette.logic";
import type { SearchHit } from "./api";
import type { Section } from "@/components/shared/nav-items";

const hit = (over: Partial<SearchHit> = {}): SearchHit => ({
  kind: "booking",
  id: "id-1",
  title: "MP-290C7D",
  subtitle: "Ana",
  company_id: "empresa-1",
  ...over,
});

describe("hitUrl", () => {
  it("reserva abre a listagem já filtrada pelo código", () => {
    expect(hitUrl(hit(), "operator")).toBe("/operator/bookings?q=MP-290C7D");
    expect(hitUrl(hit(), "manager")).toBe("/manager/bookings?q=MP-290C7D");
  });

  it("escapa o código na query string", () => {
    expect(hitUrl(hit({ title: "MP 29&0C" }), "operator")).toBe(
      "/operator/bookings?q=MP%2029%260C",
    );
  });

  it("unidade no manager depende da empresa, porque a rota é aninhada nela", () => {
    expect(hitUrl(hit({ kind: "location", company_id: "empresa-9" }), "manager")).toBe(
      "/manager/companies/empresa-9/locations",
    );
    expect(hitUrl(hit({ kind: "location" }), "operator")).toBe("/operator/locations");
  });

  it("sem empresa, unidade no manager não tem para onde ir", () => {
    expect(hitUrl(hit({ kind: "location", company_id: null }), "manager")).toBeNull();
  });

  it("cupom não tem tela no manager", () => {
    expect(hitUrl(hit({ kind: "coupon" }), "operator")).toBe("/operator/coupons");
    expect(hitUrl(hit({ kind: "coupon" }), "manager")).toBeNull();
  });
});

describe("groupHits", () => {
  it("agrupa na ordem fixa e omite grupo vazio", () => {
    const grupos = groupHits(
      [
        hit({ kind: "coupon", id: "c1", title: "BEMVINDO" }),
        hit({ kind: "booking", id: "b1" }),
      ],
      "operator",
    );

    expect(grupos.map((g) => g.kind)).toEqual(["booking", "coupon"]);
    expect(grupos.map((g) => g.label)).toEqual(["Reservas", "Cupons"]);
  });

  /**
   * O ponto do filtro: o hub_admin enxerga cupom de todas as empresas pela RPC,
   * mas /manager não tem tela de cupom. Oferecer o resultado seria um link
   * morto, então ele não aparece.
   */
  it("descarta o resultado que o painel não sabe abrir", () => {
    const grupos = groupHits(
      [hit({ kind: "coupon", id: "c1" }), hit({ kind: "location", id: "l1" })],
      "manager",
    );

    expect(grupos.map((g) => g.kind)).toEqual(["location"]);
  });

  it("lista vazia devolve nenhum grupo", () => {
    expect(groupHits([], "operator")).toEqual([]);
  });
});

describe("navCommands", () => {
  const Icone = () => null;
  const sections: Section[] = [
    { title: "Preços", items: [{ to: "/operator/pricing", label: "Preços", icon: Icone }] },
    {
      title: "Financeiro",
      items: [{ to: "/operator/recebimento", label: "Repasses", icon: Icone }],
    },
  ];

  it("achata as seções mantendo o grupo como contexto", () => {
    expect(navCommands(sections).map((c) => `${c.group}/${c.label}`)).toEqual([
      "Preços/Preços",
      "Financeiro/Repasses",
    ]);
  });
});
