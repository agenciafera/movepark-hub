import { describe, expect, it } from "vitest";
import { FARE_ACTION_BENEFIT, type FareBenefits, type FareTier } from "@/lib/fares";
import {
  canCustomerChangeDates,
  canCustomerChangePaidDates,
  canCustomerChangeVehicle,
  customerSelfCancel,
} from "./booking-modifications.logic";

// Matriz canônica dos 3 tiers, espelhando o seed da tabela `fare` (fonte da verdade travada pelo
// pgTAP fare_action_matrix.test.sql). Se o seed mudar, o pgTAP falha; se um gate ler a flag errada,
// este teste falha. Ver docs/specs/booking-modifications.md.
const TIERS: Record<
  FareTier,
  { cancelWindowMinutes: number; benefits: FareBenefits }
> = {
  basica: {
    cancelWindowMinutes: 1440,
    benefits: { date_change: false, plate_change: false, free_cancellation: true },
  },
  flex: {
    cancelWindowMinutes: 1440,
    benefits: { date_change: true, plate_change: true, free_cancellation: true },
  },
  superflex: {
    cancelWindowMinutes: 1,
    benefits: { date_change: true, plate_change: true, free_cancellation: true },
  },
};

const NOW = new Date("2026-07-10T00:00:00.000Z");
const CHECK_IN = "2026-07-12T00:00:00.000Z"; // 48h à frente de NOW (fora da janela de 1 min, dentro da de 24h)
const cancelUntil = (windowMinutes: number) =>
  new Date(new Date(CHECK_IN).getTime() - windowMinutes * 60_000).toISOString();

describe("FARE_ACTION_BENEFIT (mapa ação → benefício)", () => {
  it("cada ação de troca aponta pro benefício booleano certo", () => {
    expect(FARE_ACTION_BENEFIT.change_dates).toBe("date_change");
    expect(FARE_ACTION_BENEFIT.change_vehicle).toBe("plate_change");
  });
});

describe("canCustomerChangeDates — por tier (gate date_change, só pending, antes do check-in)", () => {
  it("Básica não permite; Flex e Superflex permitem (pending + futuro)", () => {
    expect(canCustomerChangeDates(TIERS.basica.benefits, "pending", CHECK_IN, NOW)).toBe(false);
    expect(canCustomerChangeDates(TIERS.flex.benefits, "pending", CHECK_IN, NOW)).toBe(true);
    expect(canCustomerChangeDates(TIERS.superflex.benefits, "pending", CHECK_IN, NOW)).toBe(true);
  });

  it("confirmada (paga) não permite trocar datas nem no Flex (RPC exige pending)", () => {
    expect(canCustomerChangeDates(TIERS.flex.benefits, "confirmed", CHECK_IN, NOW)).toBe(false);
  });

  it("depois do check-in não permite", () => {
    const past = "2026-07-09T00:00:00.000Z";
    expect(canCustomerChangeDates(TIERS.flex.benefits, "pending", past, NOW)).toBe(false);
  });
});

describe("canCustomerChangePaidDates — reserva paga (E2.8-h)", () => {
  it("confirmada + benefício + antes do check-in → permite (Flex/Superflex); Básica não", () => {
    expect(canCustomerChangePaidDates(TIERS.basica.benefits, "confirmed", CHECK_IN, NOW)).toBe(false);
    expect(canCustomerChangePaidDates(TIERS.flex.benefits, "confirmed", CHECK_IN, NOW)).toBe(true);
    expect(canCustomerChangePaidDates(TIERS.superflex.benefits, "confirmed", CHECK_IN, NOW)).toBe(true);
  });

  it("pending usa o outro fluxo (aqui é só confirmed)", () => {
    expect(canCustomerChangePaidDates(TIERS.flex.benefits, "pending", CHECK_IN, NOW)).toBe(false);
  });

  it("depois do check-in não permite", () => {
    const past = "2026-07-09T00:00:00.000Z";
    expect(canCustomerChangePaidDates(TIERS.flex.benefits, "confirmed", past, NOW)).toBe(false);
  });
});

describe("canCustomerChangeVehicle — por tier (gate plate_change, pending/confirmed, antes do check-in)", () => {
  it("Básica não permite; Flex e Superflex permitem (confirmada + futuro)", () => {
    expect(canCustomerChangeVehicle(TIERS.basica.benefits, "confirmed", CHECK_IN, NOW)).toBe(false);
    expect(canCustomerChangeVehicle(TIERS.flex.benefits, "confirmed", CHECK_IN, NOW)).toBe(true);
    expect(canCustomerChangeVehicle(TIERS.superflex.benefits, "confirmed", CHECK_IN, NOW)).toBe(true);
  });

  it("pending também permite (Flex)", () => {
    expect(canCustomerChangeVehicle(TIERS.flex.benefits, "pending", CHECK_IN, NOW)).toBe(true);
  });

  it("estado terminal (checked_in) e pós-check-in não permitem", () => {
    expect(canCustomerChangeVehicle(TIERS.flex.benefits, "checked_in", CHECK_IN, NOW)).toBe(false);
    const past = "2026-07-09T00:00:00.000Z";
    expect(canCustomerChangeVehicle(TIERS.flex.benefits, "confirmed", past, NOW)).toBe(false);
  });
});

describe("customerSelfCancel — por tier (gate por JANELA de tempo)", () => {
  it("dentro da janela de cada tier → cancela com estorno", () => {
    // NOW está a 48h do check-in: dentro da janela de 24h (Básica/Flex) e da de 1 min (Superflex).
    for (const tier of ["basica", "flex", "superflex"] as FareTier[]) {
      const until = cancelUntil(TIERS[tier].cancelWindowMinutes);
      expect(customerSelfCancel("confirmed", CHECK_IN, NOW, until)).toEqual({
        allowed: true,
        free: true,
      });
    }
  });

  it("fora da janela de cada tier → BLOQUEADO", () => {
    for (const tier of ["basica", "flex", "superflex"] as FareTier[]) {
      const until = cancelUntil(TIERS[tier].cancelWindowMinutes);
      // logo após o prazo de cada tier
      const afterDeadline = new Date(new Date(until).getTime() + 60_000);
      expect(customerSelfCancel("confirmed", CHECK_IN, afterDeadline, until)).toEqual({
        allowed: false,
        reason: "window_closed",
      });
    }
  });

  it("Superflex ainda cancela a 30 min do check-in (janela 1 min), onde Flex já estaria bloqueado", () => {
    const closeToCheckIn = new Date(new Date(CHECK_IN).getTime() - 30 * 60_000); // 30 min antes
    expect(
      customerSelfCancel("confirmed", CHECK_IN, closeToCheckIn, cancelUntil(1)),
    ).toEqual({ allowed: true, free: true });
    expect(
      customerSelfCancel("confirmed", CHECK_IN, closeToCheckIn, cancelUntil(1440)),
    ).toEqual({ allowed: false, reason: "window_closed" });
  });

  it("pending (hold não pago) cancela em qualquer tier e qualquer hora", () => {
    for (const tier of ["basica", "flex", "superflex"] as FareTier[]) {
      const until = cancelUntil(TIERS[tier].cancelWindowMinutes);
      expect(customerSelfCancel("pending", CHECK_IN, NOW, until)).toEqual({
        allowed: true,
        free: false,
      });
    }
  });
});
