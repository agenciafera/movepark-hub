import { describe, expect, it } from "vitest";
import {
  cancelWindowLabel,
  fareCancelDeadline,
  fareReais,
  fareUpgradeDeltaCents,
  FARE_BENEFIT_LABELS,
  FARE_TIER_ORDER,
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
