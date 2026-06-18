import { describe, expect, it } from "vitest";
import type { PayoutRecipientStatus } from "@/types/domain";
import { payoutStatusLabel, payoutStatusTone } from "./status";

const ALL: PayoutRecipientStatus[] = [
  "draft",
  "pending",
  "action_required",
  "active",
  "refused",
  "suspended",
];

describe("payouts/status", () => {
  it("tem label e tone para todos os estados", () => {
    for (const s of ALL) {
      expect(payoutStatusLabel[s]).toBeTruthy();
      expect(payoutStatusTone[s]).toBeTruthy();
    }
  });

  it("mapeia tons coerentes (apto=verde, recusado/suspenso=vermelho, draft=neutro)", () => {
    expect(payoutStatusTone.active).toBe("confirmed");
    expect(payoutStatusTone.refused).toBe("cancelled");
    expect(payoutStatusTone.suspended).toBe("cancelled");
    expect(payoutStatusTone.draft).toBe("neutral");
    expect(payoutStatusLabel.action_required).toMatch(/ação/i);
  });
});
