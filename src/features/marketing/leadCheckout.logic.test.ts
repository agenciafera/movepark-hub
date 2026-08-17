import { describe, expect, it } from "vitest";
import type { MarketingLeadRow } from "@/types/domain";
import { checkoutState, checkoutToneClasses, MINUTOS_URGENTE } from "./leadCheckout.logic";

const AGORA = new Date("2026-08-17T12:00:00Z");

function lead(patch: Partial<MarketingLeadRow>): MarketingLeadRow {
  return {
    id: "l1", pipeline_id: "p1", stage_id: "s1", stage_name: "Reserva iniciada",
    contact_id: "c1", contact_key: "a@b.com", display_name: "Fulano", email: "a@b.com",
    phone: null, location_id: "loc1", location_name: "Virapark", title: null, value_cents: 0,
    owner_id: null, source: "checkout", tags: [], custom: {}, sort_order: 0,
    stage_changed_at: AGORA.toISOString(), bookings_count: 0, total_spent: 0, avg_ticket: 0,
    days_since_last: null, cohort: null, growth_stage: null, subscription_candidate: false,
    vehicle_model: null, created_at: AGORA.toISOString(),
    booking_id: "b1", booking_code: "MP123", booking_status: "pending",
    booking_expires_at: null, booking_total: 99.9, auto_synced: true,
    ...patch,
  };
}

describe("checkoutState", () => {
  it("lead criado na mão não tem estado de checkout", () => {
    expect(checkoutState(lead({ booking_status: null, booking_id: null }), AGORA)).toBeNull();
  });

  it("pagou", () => {
    for (const s of ["confirmed", "checked_in", "completed"] as const) {
      const e = checkoutState(lead({ booking_status: s }), AGORA);
      expect(e).toMatchObject({ label: "Pagou", tone: "pago" });
    }
  });

  it("separa abandono de cancelamento e de falta", () => {
    expect(checkoutState(lead({ booking_status: "expired" }), AGORA)?.label).toBe(
      "Largou o checkout",
    );
    expect(checkoutState(lead({ booking_status: "cancelled" }), AGORA)?.label).toBe("Cancelou");
    expect(checkoutState(lead({ booking_status: "no_show" }), AGORA)?.label).toBe("Não apareceu");
  });

  it("hold correndo mostra o tempo que falta", () => {
    const e = checkoutState(
      lead({ booking_expires_at: "2026-08-17T12:30:00Z" }),
      AGORA,
    );
    expect(e).toMatchObject({ tone: "aberto", minutesLeft: 30 });
    expect(e?.label).toContain("30 min");
  });

  it("perto do fim vira urgente", () => {
    const e = checkoutState(lead({ booking_expires_at: "2026-08-17T12:05:00Z" }), AGORA);
    expect(e).toMatchObject({ tone: "urgente", minutesLeft: 5 });
    expect(e?.label).toBe("Expira em 5 min");
  });

  it("o corte do urgente é o documentado", () => {
    const noLimite = new Date(AGORA.getTime() + MINUTOS_URGENTE * 60_000).toISOString();
    expect(checkoutState(lead({ booking_expires_at: noLimite }), AGORA)?.tone).toBe("urgente");
  });

  it("hold vencido que o cron ainda não varreu não aparece como oportunidade", () => {
    // Regressão do que essa tela existe para evitar: a reserva continua `pending` no banco até o
    // cron passar, e sem essa conta o quadro mandaria alguém correr atrás do que já morreu.
    const e = checkoutState(lead({ booking_expires_at: "2026-08-17T11:59:00Z" }), AGORA);
    expect(e).toMatchObject({ label: "Hold vencido", tone: "vencido", minutesLeft: 0 });
  });

  it("mais de uma hora mostra em horas, não em minutos", () => {
    const e = checkoutState(lead({ booking_expires_at: "2026-08-17T15:00:00Z" }), AGORA);
    expect(e?.label).toContain("3h");
    expect(e?.label).not.toContain("180");
  });

  it("pendente sem prazo não inventa contagem", () => {
    const e = checkoutState(lead({ booking_expires_at: null }), AGORA);
    expect(e).toMatchObject({ label: "Checkout aberto", minutesLeft: null });
  });
});

describe("checkoutToneClasses", () => {
  it("dá uma classe para cada tom, e o urgente destoa do aberto", () => {
    const tons = ["aberto", "urgente", "vencido", "pago", "perdido"] as const;
    const classes = tons.map(checkoutToneClasses);
    expect(new Set(classes).size).toBe(tons.length);
    expect(checkoutToneClasses("urgente")).toContain("rose");
  });
});
