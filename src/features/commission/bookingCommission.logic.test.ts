import { describe, expect, it } from "vitest";
import { canFixChannel, commissionView, rulesForCompany } from "./bookingCommission.logic";

const fmt = (iso: string) => `em ${iso.slice(0, 10)}`;

describe("commissionView", () => {
  it("reserva antiga, sem pacote gravado: canal Movepark e nada inventado", () => {
    expect(commissionView({}, fmt)).toMatchObject({
      legacy: true,
      channel: "Movepark (busca e site)",
      fromRule: false,
      takeRatePct: null,
      feePayer: null,
      chargeback: null,
      proof: [],
    });
  });

  it("padrão do Hub gravado: mostra o pacote, mas o canal continua sendo a Movepark", () => {
    const v = commissionView(
      { commission_channel: "hub", commission_take_rate_bps: 2000, commission_fee_payer: "movepark", commission_chargeback_bearer: "each" },
      fmt,
    );
    expect(v).toMatchObject({
      legacy: false,
      fromRule: false,
      channel: "Movepark (busca e site)",
      takeRatePct: 20,
      feePayer: "Movepark paga",
      chargeback: "Cada um com a sua parte",
    });
  });

  it("regra que casou: nome do canal, pacote e a prova da origem", () => {
    const v = commissionView(
      {
        commission_channel: "Site do Abbapark",
        commission_rule_id: "r1",
        commission_take_rate_bps: 500,
        commission_fee_payer: "partner",
        commission_chargeback_bearer: "partner",
        commission_locked: true,
        attribution: {
          utm_source: "abbapark",
          utm_medium: "site",
          clicked_at: "2026-09-10T12:00:00Z",
          landing_url: "/p/abbapark?utm_source=abbapark",
          referrer: "https://abbapark.com.br/",
        },
      },
      fmt,
    );
    expect(v.channel).toBe("Site do Abbapark");
    expect(v.fromRule).toBe(true);
    expect(v.takeRatePct).toBe(5);
    expect(v.locked).toBe(true);
    expect(v.proof).toEqual([
      { label: "utm_source", value: "abbapark" },
      { label: "utm_medium", value: "site" },
      { label: "Chegou pelo link em", value: "em 2026-09-10" },
      { label: "Página de entrada", value: "/p/abbapark?utm_source=abbapark" },
      { label: "Veio de", value: "https://abbapark.com.br/" },
    ]);
  });

  it("white-label sem UTM ainda tem prova: onde reservou", () => {
    const v = commissionView({ origin: "white_label" }, fmt);
    expect(v.proof).toEqual([{ label: "Onde reservou", value: "Site white-label do estacionamento" }]);
  });

  it("data ilegível na prova é ignorada", () => {
    expect(commissionView({ attribution: { utm_source: "x", clicked_at: "ontem" } }, fmt).proof).toEqual([
      { label: "utm_source", value: "x" },
    ]);
  });
});

describe("canFixChannel", () => {
  it("só antes de pagar", () => {
    expect(canFixChannel([])).toBe(true);
    expect(canFixChannel(null)).toBe(true);
    expect(canFixChannel([{ status: "pending" }, { status: "failed" }])).toBe(true);
    expect(canFixChannel([{ status: "paid" }])).toBe(false);
    expect(canFixChannel([{ status: "refunded" }])).toBe(false);
  });
});

describe("rulesForCompany", () => {
  it("as da empresa e as globais, sem as removidas nem as de outra empresa", () => {
    const rules = [
      { id: "a", company_id: "c1" },
      { id: "b", company_id: null },
      { id: "c", company_id: "c2" },
      { id: "d", company_id: "c1", deleted_at: "2026-01-01" },
    ];
    expect(rulesForCompany(rules, "c1").map((r) => r.id)).toEqual(["a", "b"]);
  });
});
