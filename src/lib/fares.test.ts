import { describe, expect, it } from "vitest";
import {
  benefitLabelWithWindow,
  bookingCancelWindowMinutes,
  cancelWindowLabel,
  fareCancelDeadline,
  fareReais,
  fareUpgradeDeltaCents,
  FARE_BENEFIT_LABELS,
  FARE_TIER_ORDER,
  fareBenefitLabel,
  isWithinFareCancelWindow,
} from "./fares";

describe("cancelWindowLabel", () => {
  it("formata janelas comuns", () => {
    expect(cancelWindowLabel(1440)).toBe("até 24h antes");
    expect(cancelWindowLabel(1)).toBe("até 1 min antes");
    expect(cancelWindowLabel(60)).toBe("até 1h antes");
    expect(cancelWindowLabel(2880)).toBe("até 2 dias antes");
    expect(cancelWindowLabel(0)).toBe("até a entrada");
  });
  it("sem janela → null", () => {
    expect(cancelWindowLabel(null)).toBeNull();
    expect(cancelWindowLabel(undefined)).toBeNull();
  });
});

describe("fareReais", () => {
  it("converte centavos em reais", () => {
    expect(fareReais(0)).toBe(0);
    expect(fareReais(1290)).toBe(12.9);
    expect(fareReais(2490)).toBe(24.9);
  });
});

describe("FARE_TIER_ORDER", () => {
  it("segue good-better-best", () => {
    expect(FARE_TIER_ORDER).toEqual(["basica", "flex", "superflex"]);
  });
});

describe("FARE_BENEFIT_LABELS", () => {
  it("cobre os 8 benefícios sem chave duplicada", () => {
    const keys = FARE_BENEFIT_LABELS.map((b) => b.key);
    expect(keys.length).toBe(8);
    expect(new Set(keys).size).toBe(8);
  });

  // Regressão: a Movepark avisa só por WhatsApp. A chave `notifications_sms` é técnica e fica;
  // a promessa que o cliente lê não pode voltar a citar SMS.
  it("nenhum rótulo promete SMS", () => {
    for (const b of FARE_BENEFIT_LABELS) expect(b.label).not.toMatch(/sms/i);
    expect(fareBenefitLabel("notifications_sms")).toBe("Avisos por WhatsApp");
  });

  it("fareBenefitLabel devolve o rótulo da lista", () => {
    expect(fareBenefitLabel("guaranteed_spot")).toBe("Vaga garantida");
  });
});

describe("fareCancelDeadline", () => {
  const checkIn = "2026-07-10T12:00:00.000Z";

  it("sem janela → null", () => {
    expect(fareCancelDeadline(checkIn, null)).toBeNull();
    expect(fareCancelDeadline(checkIn, undefined)).toBeNull();
  });

  it("24h (1440 min) antes do check-in — Básica/Flex", () => {
    expect(fareCancelDeadline(checkIn, 1440)?.toISOString()).toBe("2026-07-09T12:00:00.000Z");
  });

  it("1 min antes do check-in — Superflex", () => {
    expect(fareCancelDeadline(checkIn, 1)?.toISOString()).toBe("2026-07-10T11:59:00.000Z");
  });
});

describe("isWithinFareCancelWindow", () => {
  const checkIn = "2026-07-10T12:00:00.000Z";

  it("Flex (24h): dentro com 2 dias de antecedência, fora com 2h", () => {
    expect(isWithinFareCancelWindow(checkIn, 1440, new Date("2026-07-08T12:00:00.000Z"))).toBe(true);
    expect(isWithinFareCancelWindow(checkIn, 1440, new Date("2026-07-10T10:00:00.000Z"))).toBe(false);
  });

  it("Superflex (1 min): ainda dá 30 min antes; passou de 1 min antes → não", () => {
    expect(isWithinFareCancelWindow(checkIn, 1, new Date("2026-07-10T11:30:00.000Z"))).toBe(true);
    expect(isWithinFareCancelWindow(checkIn, 1, new Date("2026-07-10T11:59:30.000Z"))).toBe(false);
  });

  it("sem janela (null) → sempre false", () => {
    expect(isWithinFareCancelWindow(checkIn, null, new Date("2026-07-01T00:00:00.000Z"))).toBe(false);
  });
});

describe("fareUpgradeDeltaCents", () => {
  it("cobra a diferença (Flex → Superflex)", () => {
    expect(fareUpgradeDeltaCents(1290, 2490)).toBe(1200);
  });
  it("Básica → Flex", () => {
    expect(fareUpgradeDeltaCents(0, 1290)).toBe(1290);
  });
  it("sem downgrade: alvo mais barato → 0", () => {
    expect(fareUpgradeDeltaCents(2490, 1290)).toBe(0);
  });
});

describe("benefitLabelWithWindow (26/11/2026: o cancelamento grátis diz até quando)", () => {
  it("Básica com 24h: o rótulo leva o prazo, não fica genérico", () => {
    const min = bookingCancelWindowMinutes("2026-12-01T21:00:00-03:00", "2026-11-30T21:00:00-03:00");
    expect(min).toBe(1440);
    expect(benefitLabelWithWindow("free_cancellation", min)).toBe("Cancelamento grátis até 24h antes da entrada");
  });
  it("Superflex com 1 min antes", () => {
    expect(benefitLabelWithWindow("free_cancellation", 1)).toBe("Cancelamento grátis até 1 min antes da entrada");
  });
  it("janela zero: até a entrada", () => {
    expect(benefitLabelWithWindow("free_cancellation", 0)).toBe("Cancelamento grátis até a entrada");
  });
  it("sem prazo conhecido: o rótulo curto", () => {
    expect(bookingCancelWindowMinutes("2026-12-01T21:00:00Z", null)).toBeNull();
    expect(benefitLabelWithWindow("free_cancellation", null)).toBe("Cancelamento grátis");
  });
  it("os outros benefícios não mudam", () => {
    expect(benefitLabelWithWindow("date_change", 1440)).toBe("Alteração de data/horário");
  });
});
