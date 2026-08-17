import { describe, expect, it } from "vitest";
import type { MarketingLeadRow } from "@/types/domain";
import {
  cellValue,
  columnDef,
  DEFAULT_LEAD_COLUMNS,
  LEAD_COLUMNS,
  resolveColumns,
  toggleColumn,
} from "./leadColumns.logic";

const lead: MarketingLeadRow = {
  id: "l1",
  pipeline_id: "p1",
  stage_id: "s1",
  stage_name: "Cliente",
  contact_id: "c1",
  contact_key: "maria@exemplo.com",
  display_name: "Maria Silva",
  email: "maria@exemplo.com",
  phone: null,
  location_id: "loc1",
  location_name: "Virapark",
  title: null,
  value_cents: 25000,
  owner_id: null,
  source: "booking",
  tags: [],
  custom: {},
  sort_order: 0,
  stage_changed_at: "2026-08-01T00:00:00Z",
  bookings_count: 4,
  total_spent: 351,
  avg_ticket: 87.75,
  days_since_last: 40,
  cohort: "campeao",
  growth_stage: "retencao",
  subscription_candidate: true,
  vehicle_model: "Honda Civic",
  created_at: "2026-07-01T00:00:00Z",
  booking_id: null,
  booking_code: null,
  booking_status: null,
  booking_expires_at: null,
  booking_total: null,
  auto_synced: false,
};

describe("resolveColumns", () => {
  it("usa o padrão quando não há preferência salva", () => {
    const cols = resolveColumns(null).map((c) => c.key);
    expect(cols).toEqual(DEFAULT_LEAD_COLUMNS);
  });

  it("usa o padrão quando a preferência salva está vazia", () => {
    // Tabela sem nenhuma coluna é uma tela quebrada, não uma escolha do usuário.
    expect(resolveColumns([]).map((c) => c.key)).toEqual(DEFAULT_LEAD_COLUMNS);
  });

  it("descarta chave que não existe mais", () => {
    const cols = resolveColumns(["display_name", "coluna_extinta", "total_spent"]);
    expect(cols.map((c) => c.key)).toEqual(["display_name", "total_spent"]);
  });

  it("mantém a coluna travada mesmo se ela não estiver na preferência", () => {
    const cols = resolveColumns(["total_spent", "email"]).map((c) => c.key);
    expect(cols[0]).toBe("display_name");
    expect(cols).toContain("total_spent");
  });

  it("não repete coluna salva duas vezes", () => {
    const cols = resolveColumns(["email", "email", "display_name"]).map((c) => c.key);
    expect(cols.filter((k) => k === "email")).toHaveLength(1);
    expect(cols.filter((k) => k === "display_name")).toHaveLength(1);
  });

  it("respeita a ordem escolhida pelo usuário depois da travada", () => {
    const cols = resolveColumns(["total_spent", "cohort", "email"]).map((c) => c.key);
    expect(cols).toEqual(["display_name", "total_spent", "cohort", "email"]);
  });
});

describe("toggleColumn", () => {
  it("adiciona e remove", () => {
    expect(toggleColumn(["email"], "cohort")).toEqual(["email", "cohort"]);
    expect(toggleColumn(["email", "cohort"], "cohort")).toEqual(["email"]);
  });

  it("não deixa remover coluna travada", () => {
    expect(toggleColumn(["display_name", "email"], "display_name")).toEqual([
      "display_name",
      "email",
    ]);
  });
});

describe("cellValue", () => {
  it("formata dinheiro em real", () => {
    expect(cellValue(lead, "total_spent")).toContain("351");
    expect(cellValue(lead, "value_cents")).toContain("250");
  });

  it("traduz coorte e estágio para o rótulo legível", () => {
    expect(cellValue(lead, "cohort")).toBe("Campeão");
    expect(cellValue(lead, "growth_stage")).toBe("Retenção");
  });

  it("cai no e-mail quando não há nome", () => {
    expect(cellValue({ ...lead, display_name: null }, "display_name")).toBe("maria@exemplo.com");
  });

  it("mostra traço em campo vazio em vez de 'null'", () => {
    expect(cellValue({ ...lead, phone: null }, "phone")).toBe("-");
    expect(cellValue({ ...lead, days_since_last: null }, "days_since_last")).toBe("-");
  });

  it("zero dias sem comprar não vira traço", () => {
    // Regressão: `lead.days_since_last || "-"` transformaria "comprou hoje" em "sem dados".
    expect(cellValue({ ...lead, days_since_last: 0 }, "days_since_last")).toBe("0");
  });

  it("booleano vira sim/não", () => {
    expect(cellValue(lead, "subscription_candidate")).toBe("Sim");
    expect(cellValue({ ...lead, subscription_candidate: false }, "subscription_candidate")).toBe(
      "Não",
    );
  });

  it("cobre todas as colunas do catálogo sem estourar", () => {
    for (const col of LEAD_COLUMNS) {
      expect(typeof cellValue(lead, col.key)).toBe("string");
    }
  });
});

describe("catálogo", () => {
  it("acha coluna por chave", () => {
    expect(columnDef("cohort")?.label).toBe("Perfil");
    expect(columnDef("inexistente")).toBeUndefined();
  });

  it("todo padrão existe no catálogo", () => {
    for (const key of DEFAULT_LEAD_COLUMNS) expect(columnDef(key)).toBeDefined();
  });
});
