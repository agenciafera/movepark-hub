import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { SummaryCard } from "./SummaryCard";
import type { BookingForCheckout, PriceBreakdown } from "./api";

function booking(breakdown: PriceBreakdown | null, parkingSubtotal = 151.4): BookingForCheckout {
  return {
    id: "bk-1",
    code: "MP-A8K7P2",
    status: "pending",
    total_amount: parkingSubtotal,
    currency: "BRL",
    price_breakdown: breakdown,
    check_in_at: "2026-12-10T12:00:00Z",
    check_out_at: "2026-12-12T12:00:00Z",
    expires_at: null,
    passenger_count: null,
    has_pcd: false,
    vehicle_id: null,
    profile_id: "u1",
    location: { id: "l1", slug: "gru", name: "Guarulhos", address: null, company: { slug: "aero", name: "Aerovalet" } },
    items: [
      {
        id: "it1",
        item_type: "parking",
        quantity: 1,
        unit_price: parkingSubtotal,
        subtotal: parkingSubtotal,
        parking_type: { code: "covered", name: "Vaga coberta" },
        add_on_service: null,
      },
    ],
    payment: null,
    coupon: null,
  };
}

const fullBreakdown = (overrides?: Partial<PriceBreakdown>): PriceBreakdown => ({
  currency: "BRL",
  days: 2,
  strategy: "uniform_by_duration",
  base_price: 191.4,
  old_price: 191.4,
  subtotal: 151.4,
  auto_discount: { amount: 40, rule_id: "r1", label: "Promoção" },
  coupon: null,
  total: 151.4,
  line_items: [],
  ...overrides,
});

describe("SummaryCard", () => {
  it("mostra o old_price riscado quando há promoção no snapshot", () => {
    renderWithProviders(<SummaryCard booking={booking(fullBreakdown())} />);
    const old = screen.getByText("R$ 191,40");
    expect(old).toBeInTheDocument();
    expect(old.className).toContain("line-through");
    expect(screen.getAllByText("R$ 151,40").length).toBeGreaterThan(0);
  });

  it("sem snapshot (ou sem promoção) não rinca nada", () => {
    renderWithProviders(<SummaryCard booking={booking(null)} />);
    expect(screen.queryByText("R$ 191,40")).not.toBeInTheDocument();
  });

  it("não risca quando old_price <= subtotal", () => {
    renderWithProviders(
      <SummaryCard booking={booking(fullBreakdown({ old_price: 151.4 }))} />,
    );
    // só a linha de subtotal/total, nenhum valor riscado de 191,40
    expect(screen.queryByText("R$ 191,40")).not.toBeInTheDocument();
  });
});
