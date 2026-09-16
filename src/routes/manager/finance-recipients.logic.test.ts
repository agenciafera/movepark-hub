import { describe, expect, it } from "vitest";
import type { RawCompanyRecipient } from "@/features/payouts/api";
import {
  buildRecipientOverview,
  latestBalanceSync,
  mapRecipientRow,
  summarizeRecipients,
} from "./finance-recipients.logic";

function raw(over: Partial<RawCompanyRecipient> & { id: string; name: string }): RawCompanyRecipient {
  return { onboarding_status: "active", payout_recipient: null, company_payout_account: null, ...over };
}

describe("mapRecipientRow", () => {
  it("sem recebedor → draft, sem id, e (empresa ativa) precisa de atenção", () => {
    const row = mapRecipientRow(raw({ id: "c1", name: "Aeropark", onboarding_status: "active" }));
    expect(row.recipientStatus).toBe("draft");
    expect(row.hasRecipient).toBe(false);
    expect(row.hasKyc).toBe(false);
    expect(row.needsAttention).toBe(true);
  });

  it("hasKyc reflete company_payout_account não-deletado (array ou objeto)", () => {
    expect(mapRecipientRow(raw({ id: "k1", name: "A", company_payout_account: [{ deleted_at: null }] })).hasKyc).toBe(true);
    expect(mapRecipientRow(raw({ id: "k2", name: "B", company_payout_account: [{ deleted_at: "2026-01-01" }] })).hasKyc).toBe(false);
    expect(mapRecipientRow(raw({ id: "k3", name: "C", company_payout_account: null })).hasKyc).toBe(false);
    // PostgREST 1:1 → embed vem como OBJETO único (regressão do bug ".some is not a function")
    expect(mapRecipientRow(raw({ id: "k4", name: "D", company_payout_account: { deleted_at: null } })).hasKyc).toBe(true);
  });

  it("payout_recipient como objeto único (1:1) também é tolerado", () => {
    const row = mapRecipientRow(
      raw({
        id: "k5",
        name: "E",
        payout_recipient: { provider: "pagarme", status: "active", external_recipient_id: "rp", kyc_url: null, kyc_url_expires_at: null, requirements: [], deleted_at: null },
      }),
    );
    expect(row.recipientStatus).toBe("active");
    expect(row.hasRecipient).toBe(true);
  });

  it("recebedor ativo → não precisa de atenção", () => {
    const row = mapRecipientRow(
      raw({
        id: "c2",
        name: "Virapark",
        onboarding_status: "active",
        payout_recipient: [
          { provider: "pagarme", status: "active", external_recipient_id: "rp_1", kyc_url: null, kyc_url_expires_at: null, requirements: [], deleted_at: null },
        ],
      }),
    );
    expect(row.recipientStatus).toBe("active");
    expect(row.hasRecipient).toBe(true);
    expect(row.needsAttention).toBe(false);
  });

  it("empresa não-vendável (pending_review) sem recebedor → não acende atenção", () => {
    const row = mapRecipientRow(raw({ id: "c3", name: "Nova", onboarding_status: "pending_review" }));
    expect(row.needsAttention).toBe(false);
  });

  it("ignora recebedor deletado e de outro provider", () => {
    const row = mapRecipientRow(
      raw({
        id: "c4",
        name: "X",
        payout_recipient: [
          { provider: "pagarme", status: "active", external_recipient_id: "rp_old", kyc_url: null, kyc_url_expires_at: null, requirements: [], deleted_at: "2026-01-01" },
          { provider: "outro", status: "active", external_recipient_id: "rp_y", kyc_url: null, kyc_url_expires_at: null, requirements: [], deleted_at: null },
        ],
      }),
    );
    expect(row.hasRecipient).toBe(false);
    expect(row.recipientStatus).toBe("draft");
  });

  it("action_required mantém kyc_url e requirements", () => {
    const row = mapRecipientRow(
      raw({
        id: "c5",
        name: "Y",
        payout_recipient: [
          {
            provider: "pagarme",
            status: "action_required",
            external_recipient_id: "rp_2",
            kyc_url: "https://kyc", kyc_url_expires_at: null,
            requirements: [{ code: "doc", message: "Envie o documento" }],
            deleted_at: null,
          },
        ],
      }),
    );
    expect(row.recipientStatus).toBe("action_required");
    expect(row.kycUrl).toBe("https://kyc");
    expect(row.requirements).toEqual([{ code: "doc", message: "Envie o documento" }]);
    expect(row.needsAttention).toBe(true); // tem id mas não está 'active'
  });
});

describe("buildRecipientOverview", () => {
  it("ordena pendências primeiro, depois por nome", () => {
    const rows = buildRecipientOverview([
      raw({ id: "a", name: "Zeta", onboarding_status: "active", payout_recipient: [{ provider: "pagarme", status: "active", external_recipient_id: "rp", kyc_url: null, kyc_url_expires_at: null, requirements: [], deleted_at: null }] }),
      raw({ id: "b", name: "Beta", onboarding_status: "active" }), // sem recebedor → atenção
      raw({ id: "c", name: "Alfa", onboarding_status: "active" }), // sem recebedor → atenção
    ]);
    expect(rows.map((r) => r.companyName)).toEqual(["Alfa", "Beta", "Zeta"]);
    expect(rows[0].needsAttention).toBe(true);
    expect(rows[2].needsAttention).toBe(false);
  });
});

describe("summarizeRecipients", () => {
  it("conta total, aptos e pendentes", () => {
    const rows = buildRecipientOverview([
      raw({ id: "a", name: "A", payout_recipient: [{ provider: "pagarme", status: "active", external_recipient_id: "rp", kyc_url: null, kyc_url_expires_at: null, requirements: [], deleted_at: null }] }),
      raw({ id: "b", name: "B" }),
      raw({ id: "c", name: "C", onboarding_status: "pending_review" }),
    ]);
    expect(summarizeRecipients(rows)).toEqual({ total: 3, active: 1, needsAttention: 1 });
  });

  it("traz o saldo real do gateway quando houve leitura, e null sem ela", () => {
    const com = mapRecipientRow(
      raw({
        id: "c1",
        name: "Agência Fera",
        payout_recipient: {
          provider: "pagarme",
          status: "active",
          external_recipient_id: "re_1",
          kyc_url: null,
          kyc_url_expires_at: null,
          requirements: [],
          deleted_at: null,
          balance_available_cents: 11427,
          balance_waiting_cents: 0,
          balance_transferred_cents: 2000,
          balance_synced_at: "2026-09-16T17:11:06Z",
        },
      }),
    );
    expect(com.balance).toEqual({ availableCents: 11427, waitingCents: 0, transferredCents: 2000, syncedAt: "2026-09-16T17:11:06Z" });
    const sem = mapRecipientRow(raw({ id: "c2", name: "Sem leitura" }));
    expect(sem.balance).toBeNull();
    expect(latestBalanceSync([com, sem])).toBe("2026-09-16T17:11:06Z");
    expect(latestBalanceSync([sem])).toBeNull();
  });
});
