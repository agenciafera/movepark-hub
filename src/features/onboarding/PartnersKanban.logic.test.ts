import { describe, expect, it } from "vitest";
import {
  groupApplicationsByStatus,
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
