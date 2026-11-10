import { describe, expect, it } from "vitest";
import {
  EMPTY_RULE_FORM,
  feeCoverageWarning,
  formFromRule,
  installmentsLabel,
  installmentsPreview,
  parseInstallmentsPair,
  parseUtmSources,
  ruleStatus,
  splitExample,
  trackedLink,
  validateRuleForm,
} from "./rule.logic";
import type { CommissionRule } from "@/types/domain";

describe("parseUtmSources", () => {
  it("normaliza igual ao trigger do banco: minúsculas, sem vazio, sem repetido, ordenado", () => {
    expect(parseUtmSources(" Abbapark, abbapark-insta\nABBAPARK;  site ")).toEqual(["abbapark", "abbapark-insta", "site"]);
    expect(parseUtmSources("  ")).toEqual([]);
  });
});

describe("validateRuleForm", () => {
  const ok = { ...EMPTY_RULE_FORM, name: "Site do parceiro", companyId: "c1", utmSourcesText: "abbapark", takeRatePct: "5" };

  it("monta o payload da tabela", () => {
    const v = validateRuleForm({ ...ok, feePayer: "partner", chargebackBearer: "partner", priority: "3" });
    expect(v).toEqual({
      ok: true,
      payload: {
        name: "Site do parceiro",
        company_id: "c1",
        utm_sources: ["abbapark"],
        match_white_label: false,
        take_rate_bps: 500,
        gateway_fee_payer: "partner",
        chargeback_bearer: "partner",
        priority: 3,
        attribution_window_days: null,
        is_active: true,
        valid_from: null,
        valid_until: null,
        installments_max: null,
        installments_interest_free: null,
      },
    });
  });

  it("empresa vazia vira regra global (company_id nulo)", () => {
    const v = validateRuleForm({ ...ok, companyId: "" });
    expect(v.ok && v.payload.company_id).toBeNull();
  });

  it("aceita vírgula na porcentagem e comissão zero", () => {
    const v = validateRuleForm({ ...ok, takeRatePct: "7,5" });
    expect(v.ok && v.payload.take_rate_bps).toBe(750);
    const z = validateRuleForm({ ...ok, takeRatePct: "0" });
    expect(z.ok && z.payload.take_rate_bps).toBe(0);
  });

  it("recusa o que o banco recusaria, com mensagem de gente", () => {
    expect(validateRuleForm({ ...ok, name: " " })).toMatchObject({ ok: false });
    expect(validateRuleForm({ ...ok, utmSourcesText: "" })).toMatchObject({ ok: false, error: expect.stringMatching(/utm_source/) });
    expect(validateRuleForm({ ...ok, companyId: "", matchWhiteLabel: true })).toMatchObject({ ok: false, error: expect.stringMatching(/empresa/) });
    expect(validateRuleForm({ ...ok, takeRatePct: "100" })).toMatchObject({ ok: false });
    expect(validateRuleForm({ ...ok, takeRatePct: "abc" })).toMatchObject({ ok: false });
    expect(validateRuleForm({ ...ok, priority: "1.5" })).toMatchObject({ ok: false });
    expect(validateRuleForm({ ...ok, windowDays: "0" })).toMatchObject({ ok: false, error: expect.stringMatching(/1 a 90/) });
    expect(validateRuleForm({ ...ok, windowDays: "91" })).toMatchObject({ ok: false });
    expect(validateRuleForm({ ...ok, validFrom: "2026-10-10", validUntil: "2026-10-01" })).toMatchObject({ ok: false });
  });

  it("janela por regra: vazio herda o global, número vira a janela da regra", () => {
    expect(validateRuleForm({ ...ok, windowDays: "" })).toMatchObject({ payload: { attribution_window_days: null } });
    expect(validateRuleForm({ ...ok, windowDays: " 30 " })).toMatchObject({ payload: { attribution_window_days: 30 } });
  });

  it("white-label sem UTM é regra válida", () => {
    const v = validateRuleForm({ ...ok, utmSourcesText: "", matchWhiteLabel: true });
    expect(v.ok && v.payload.utm_sources).toEqual([]);
  });

  it("vigência em dia de Brasília", () => {
    const v = validateRuleForm({ ...ok, validFrom: "2026-10-01", validUntil: "2026-11-01" });
    expect(v.ok && v.payload.valid_from).toBe("2026-10-01T03:00:00.000Z");
    expect(v.ok && v.payload.valid_until).toBe("2026-11-01T03:00:00.000Z");
  });
});

describe("formFromRule", () => {
  it("ida e volta: o que sai do banco entra no formulário e valida no mesmo payload", () => {
    const rule = {
      id: "r1", company_id: "c1", name: "Site", utm_sources: ["abbapark", "abbapark-insta"], match_white_label: true,
      take_rate_bps: 750, gateway_fee_payer: "partner", chargeback_bearer: "movepark", priority: 2, attribution_window_days: 14, is_active: true,
      valid_from: "2026-10-01T03:00:00.000Z", valid_until: null,
      installments_max: null, installments_interest_free: null,
      created_at: "", updated_at: "", created_by: null, deleted_at: null,
    } satisfies CommissionRule;
    const v = validateRuleForm(formFromRule(rule));
    expect(v.ok && v.payload).toMatchObject({
      id: "r1", company_id: "c1", utm_sources: ["abbapark", "abbapark-insta"], take_rate_bps: 750,
      gateway_fee_payer: "partner", chargeback_bearer: "movepark", priority: 2, attribution_window_days: 14, valid_from: "2026-10-01T03:00:00.000Z",
    });
  });
});

describe("ruleStatus", () => {
  const now = new Date("2026-09-18T12:00:00Z");
  it("desligada, vencida, agendada, ativa", () => {
    expect(ruleStatus({ is_active: false, valid_from: null, valid_until: null }, now)).toBe("inactive");
    expect(ruleStatus({ is_active: true, valid_from: null, valid_until: "2026-09-01T00:00:00Z" }, now)).toBe("expired");
    expect(ruleStatus({ is_active: true, valid_from: "2026-10-01T00:00:00Z", valid_until: null }, now)).toBe("scheduled");
    expect(ruleStatus({ is_active: true, valid_from: "2026-09-01T00:00:00Z", valid_until: null }, now)).toBe("active");
  });
});

describe("feeCoverageWarning", () => {
  it("avisa quando a comissão não cobre a taxa que a Movepark prometeu pagar", () => {
    expect(feeCoverageWarning(2000, "movepark")).toBeNull();
    expect(feeCoverageWarning(600, "movepark")).toBeNull();
    expect(feeCoverageWarning(500, "movepark")).toMatch(/cartão/);
    expect(feeCoverageWarning(100, "movepark")).toMatch(/nem no PIX/);
  });
  it("com o estacionamento pagando não há o que avisar", () => {
    expect(feeCoverageWarning(0, "partner")).toBeNull();
  });
});

describe("splitExample e trackedLink", () => {
  it("R$ 100 com 5%: 95 para o estacionamento, 5 para a Movepark", () => {
    expect(splitExample(500)).toEqual({ partnerCents: 9500, moveparkCents: 500 });
  });
  it("link rastreado preserva o que a URL já tinha", () => {
    expect(trackedLink("https://movepark.co/p/abbapark?dest=GRU", "abbapark")).toBe(
      "https://movepark.co/p/abbapark?dest=GRU&utm_source=abbapark&utm_medium=parceiro",
    );
  });
});

describe("parcelamento na regra (09/11/2026)", () => {
  it("os dois vazios herdam", () => {
    expect(parseInstallmentsPair("", " ")).toEqual({ max: null, interestFree: null });
  });
  it("só um preenchido é recusado, como no banco", () => {
    expect(parseInstallmentsPair("6", "")).toHaveProperty("error");
  });
  it("sem juros não passa do máximo e o máximo vai até 24", () => {
    expect(parseInstallmentsPair("2", "3")).toHaveProperty("error");
    expect(parseInstallmentsPair("25", "1")).toHaveProperty("error");
    expect(parseInstallmentsPair("12", "1")).toEqual({ max: 12, interestFree: 1 });
  });
  it("o rótulo diz o que o cliente vai ver", () => {
    expect(installmentsLabel(null, null)).toBe("Herda");
    expect(installmentsLabel(1, 1)).toBe("Só à vista");
    expect(installmentsLabel(12, 1)).toBe("Até 12x, juros desde a 2ª");
    expect(installmentsLabel(12, 3)).toBe("Até 12x, 3x sem juros");
    expect(installmentsLabel(6, 6)).toBe("Até 6x sem juros");
  });
  it("a prévia do formulário", () => {
    expect(installmentsPreview("", "")).toBe("vale o padrão da empresa.");
    expect(installmentsPreview("1", "1")).toBe("só à vista.");
    expect(installmentsPreview("6", "")).toBe("confira os dois números.");
  });
  it("o formulário leva o par ao payload", () => {
    const r = validateRuleForm({ ...EMPTY_RULE_FORM, name: "Site", utmSourcesText: "x", takeRatePct: "10", installmentsMax: "6", installmentsInterestFree: "1" });
    expect(r.ok && r.payload).toMatchObject({ installments_max: 6, installments_interest_free: 1 });
  });
});
