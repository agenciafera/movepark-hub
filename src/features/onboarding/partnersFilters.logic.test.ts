import { describe, expect, it } from "vitest";
import {
  activeAdvancedCount,
  applyPartnersFilters,
  distinctResponsaveis,
  emptyPartnersFilters,
  type PartnersFilters,
} from "./partnersFilters.logic";
import type { PartnerApplication } from "@/types/domain";

function app(over: Partial<PartnerApplication> & { id: string }): PartnerApplication {
  const { id, ...rest } = over;
  return {
    company_id: id,
    contact_name: "Fulano",
    city: "São Paulo",
    state: "SP",
    estimated_spots: 50,
    submitted_at: "2026-04-10T12:00:00Z",
    company: { id, name: "Empresa", slug: id, onboarding_status: "pending_review", status: "active" },
    ...rest,
  } as PartnerApplication;
}

const base = (over: Partial<PartnersFilters> = {}): PartnersFilters => ({
  ...emptyPartnersFilters,
  ...over,
});

describe("applyPartnersFilters", () => {
  it("sem filtros retorna tudo ordenado por mais recente", () => {
    const apps = [
      app({ id: "a", submitted_at: "2026-04-01T00:00:00Z" }),
      app({ id: "b", submitted_at: "2026-04-20T00:00:00Z" }),
    ];
    const out = applyPartnersFilters(apps, base());
    expect(out.map((a) => a.company_id)).toEqual(["b", "a"]);
  });

  it("filtra por responsável", () => {
    const apps = [app({ id: "a", contact_name: "Léo" }), app({ id: "b", contact_name: "Ana" })];
    const out = applyPartnersFilters(apps, base({ responsavel: "Ana" }));
    expect(out.map((a) => a.company_id)).toEqual(["b"]);
  });

  it("filtra por status", () => {
    const apps = [
      app({ id: "a", company: { onboarding_status: "active" } as PartnerApplication["company"] }),
      app({ id: "b", company: { onboarding_status: "rejected" } as PartnerApplication["company"] }),
    ];
    const out = applyPartnersFilters(apps, base({ status: "rejected" }));
    expect(out.map((a) => a.company_id)).toEqual(["b"]);
  });

  it("filtra por cidade (substring, case-insensitive)", () => {
    const apps = [app({ id: "a", city: "Campinas" }), app({ id: "b", city: "São Paulo" })];
    const out = applyPartnersFilters(apps, base({ city: "camp" }));
    expect(out.map((a) => a.company_id)).toEqual(["a"]);
  });

  it("filtra por vagas mínimas", () => {
    const apps = [app({ id: "a", estimated_spots: 30 }), app({ id: "b", estimated_spots: 100 })];
    const out = applyPartnersFilters(apps, base({ minSpots: 50 }));
    expect(out.map((a) => a.company_id)).toEqual(["b"]);
  });

  it("filtra por intervalo de datas (inclusivo)", () => {
    const apps = [
      app({ id: "a", submitted_at: "2026-03-31T23:00:00Z" }),
      app({ id: "b", submitted_at: "2026-04-15T10:00:00Z" }),
      app({ id: "c", submitted_at: "2026-05-01T10:00:00Z" }),
    ];
    const out = applyPartnersFilters(apps, base({ dateFrom: "2026-04-01", dateTo: "2026-04-30" }));
    expect(out.map((a) => a.company_id)).toEqual(["b"]);
  });

  it("ordena por mais vagas e por nome", () => {
    const apps = [
      app({ id: "a", estimated_spots: 10, company: { name: "Zeta" } as PartnerApplication["company"] }),
      app({ id: "b", estimated_spots: 90, company: { name: "Alfa" } as PartnerApplication["company"] }),
    ];
    expect(applyPartnersFilters(apps, base({ sort: "spots_desc" })).map((a) => a.company_id)).toEqual([
      "b",
      "a",
    ]);
    expect(applyPartnersFilters(apps, base({ sort: "name_asc" })).map((a) => a.company_id)).toEqual([
      "b",
      "a",
    ]);
  });
});

describe("distinctResponsaveis", () => {
  it("retorna nomes únicos ordenados", () => {
    const apps = [
      app({ id: "a", contact_name: "Léo" }),
      app({ id: "b", contact_name: "Ana" }),
      app({ id: "c", contact_name: "Léo" }),
    ];
    expect(distinctResponsaveis(apps)).toEqual(["Ana", "Léo"]);
  });
});

describe("activeAdvancedCount", () => {
  it("conta cidade, vagas e intervalo de data", () => {
    expect(activeAdvancedCount(base())).toBe(0);
    expect(activeAdvancedCount(base({ city: "SP" }))).toBe(1);
    expect(activeAdvancedCount(base({ city: "SP", minSpots: 10, dateFrom: "2026-04-01" }))).toBe(3);
  });
});
