import { describe, expect, it } from "vitest";
import { formatBRL } from "@/lib/format";
import { awaitingRealCheckout, checkoutPlan, flightNotice } from "./flightCheckout.logic";

const ext = { kind: "cancellation", flight_number: "LA3456", new_check_out_at: "2026-12-14T08:00:00Z", requested_check_out_at: "2026-12-15T09:00:00Z", overage_daily_cents: 2700, overage_cents: 5400, actual_check_out_at: null, overage_charged_cents: null };
const fmt = (iso: string) => `[${iso}]`;

describe("flightNotice", () => {
  it("diz motivo, voo, até quando sem custo e o preço por dia", () => {
    expect(flightNotice(ext, fmt)).toBe(`Proteção de voo acionada (cancelamento, voo LA3456): sai até [2026-12-14T08:00:00Z] sem custo. Depois disso, ${formatBRL(27)} por dia, a cobrar no balcão.`);
  });
  it("sem voo e por atraso", () => {
    expect(flightNotice({ ...ext, kind: "delay", flight_number: null }, fmt)).toContain("(atraso): sai até");
  });
});

describe("checkoutPlan e awaitingRealCheckout", () => {
  it("calcula dias e valor além da coberta", () => {
    expect(checkoutPlan(ext, "2026-12-15T09:00:00Z")).toEqual({ days: 2, forecastCents: 5400 });
    expect(checkoutPlan(ext, "2026-12-14T07:00:00Z")).toEqual({ days: 0, forecastCents: 0 });
  });
  it("aguarda a saída real até ela ser registrada", () => {
    expect(awaitingRealCheckout(ext)).toBe(true);
    expect(awaitingRealCheckout({ ...ext, actual_check_out_at: "2026-12-14T09:00:00Z" })).toBe(false);
    expect(awaitingRealCheckout(null)).toBe(false);
  });
});
