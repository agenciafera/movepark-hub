import { describe, expect, it } from "vitest";
import {
  canMoveToColumn,
  groupApplicationsByStatus,
  isDraggable,
  partnersKanbanColumns,
} from "./PartnersKanban.logic";
import type { OnboardingStatus, PartnerApplication } from "@/types/domain";

function app(id: string, status: OnboardingStatus | null): PartnerApplication {
  return {
    company_id: id,
    company: status === null ? null : ({ onboarding_status: status } as PartnerApplication["company"]),
  } as PartnerApplication;
}

describe("groupApplicationsByStatus", () => {
  it("mantém as 5 colunas na ordem do funil", () => {
    const cols = groupApplicationsByStatus([]);
    expect(cols.map((c) => c.status)).toEqual([
      "pending_review",
      "in_progress",
      "approved",
      "active",
      "rejected",
    ]);
  });

  it('rotula a coluna de rejected como "Perdido"', () => {
    const rejected = partnersKanbanColumns.find((c) => c.status === "rejected");
    expect(rejected?.label).toBe("Perdido");
  });

  it("distribui cada solicitação na coluna do seu status", () => {
    const cols = groupApplicationsByStatus([
      app("a", "pending_review"),
      app("b", "active"),
      app("c", "active"),
      app("d", "rejected"),
    ]);
    const byStatus = Object.fromEntries(cols.map((c) => [c.status, c.applications.map((a) => a.company_id)]));
    expect(byStatus.pending_review).toEqual(["a"]);
    expect(byStatus.active).toEqual(["b", "c"]);
    expect(byStatus.rejected).toEqual(["d"]);
    expect(byStatus.approved).toEqual([]);
  });

  it("trata company nula como pending_review", () => {
    const cols = groupApplicationsByStatus([app("x", null)]);
    const pending = cols.find((c) => c.status === "pending_review");
    expect(pending?.applications.map((a) => a.company_id)).toEqual(["x"]);
  });
});

describe("canMoveToColumn", () => {
  it("permite aprovar a partir de pending_review ou rejected", () => {
    expect(canMoveToColumn("pending_review", "approved")).toBe(true);
    expect(canMoveToColumn("rejected", "approved")).toBe(true);
  });

  it("permite arrastar Pendente para Em cadastro como atalho do approve", () => {
    expect(canMoveToColumn("pending_review", "in_progress")).toBe(true);
    // só a partir de Pendente; outros status não viram in_progress manualmente
    expect(canMoveToColumn("approved", "in_progress")).toBe(false);
    expect(canMoveToColumn("rejected", "in_progress")).toBe(false);
  });

  it("não aprova a partir de in_progress/active/approved", () => {
    expect(canMoveToColumn("in_progress", "approved")).toBe(false);
    expect(canMoveToColumn("active", "approved")).toBe(false);
    expect(canMoveToColumn("approved", "approved")).toBe(false);
  });

  it("permite recusar (Perdido) a partir de qualquer status menos active", () => {
    expect(canMoveToColumn("pending_review", "rejected")).toBe(true);
    expect(canMoveToColumn("in_progress", "rejected")).toBe(true);
    expect(canMoveToColumn("approved", "rejected")).toBe(true);
    expect(canMoveToColumn("active", "rejected")).toBe(false);
  });

  it("bloqueia destinos sem ação manual (pending, em cadastro, ativo)", () => {
    expect(canMoveToColumn("approved", "in_progress")).toBe(false);
    expect(canMoveToColumn("approved", "active")).toBe(false);
    expect(canMoveToColumn("in_progress", "pending_review")).toBe(false);
  });

  it("nunca move para a mesma coluna", () => {
    expect(canMoveToColumn("rejected", "rejected")).toBe(false);
  });
});

describe("isDraggable", () => {
  it("marca como arrastável quem tem ao menos um destino válido", () => {
    expect(isDraggable("pending_review")).toBe(true); // approve + reject
    expect(isDraggable("in_progress")).toBe(true); // reject
    expect(isDraggable("approved")).toBe(true); // reject
    expect(isDraggable("rejected")).toBe(true); // approve
  });

  it("active não é arrastável (sem ação manual)", () => {
    expect(isDraggable("active")).toBe(false);
  });
});
