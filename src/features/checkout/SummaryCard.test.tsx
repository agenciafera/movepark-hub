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
    fare_cancel_until: null,
    expires_at: null,
    created_at: "2026-12-10T11:30:00Z",
    passenger_count: null,
    has_pcd: false,
    vehicle_id: null,
    profile_id: "u1",
    customer_name: null,
    customer_first_name: null,
    customer_last_name: null,
    customer_phone: null,
    customer_email: null,
    customer_tax_id: null,
    passenger_first_name: null,
    passenger_last_name: null,
    passenger_phone: null,
    location: {
      id: "l1",
      slug: "gru",
      name: "Guarulhos",
      address: null,
      photos: [],
      company: { slug: "aero", name: "Aerovalet" },
    },
    items: [
      {
        id: "it1",
        item_type: "parking",
        quantity: 1,
        unit_price: parkingSubtotal,
        subtotal: parkingSubtotal,
        parking_type: { code: "covered", name: "Vaga coberta" },
        add_on_service_id: null,
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

  /**
   * O merge com o design do Claude Design deixou o resumo mais visual, e o risco
   * de um passe desses é sumir com informação. Estes casos travam o que precisa
   * continuar visível.
   */
  it("mantém tudo o que o cliente confere antes de pagar", () => {
    const b = booking(null);
    renderWithProviders(
      <SummaryCard
        booking={{
          ...b,
          passenger_count: 2,
          total_amount: 171.4,
          items: [
            ...b.items,
            {
              id: "it2",
              item_type: "add_on",
              quantity: 1,
              unit_price: 20,
              subtotal: 20,
              parking_type: null,
              add_on_service_id: "a1",
              add_on_service: { name: "Auto Start" },
            },
          ],
        }}
      />,
    );

    // Empresa · unidade: a Aerovalet tem três unidades, e só a marca não diz qual é.
    expect(screen.getByText("Aerovalet · Guarulhos")).toBeInTheDocument();
    expect(screen.getByText("Vaga coberta")).toBeInTheDocument();
    expect(screen.getByText("Check-in")).toBeInTheDocument();
    expect(screen.getByText("Check-out")).toBeInTheDocument();
    expect(screen.getByText("Auto Start")).toBeInTheDocument();
    expect(screen.getByText("R$ 171,40")).toBeInTheDocument();
    expect(screen.getByText(/2 passageiros/)).toBeInTheDocument();
    // A política inteira continua na tela, não só o prazo.
    expect(screen.getByText(/reembolso integral/i)).toBeInTheDocument();
  });

  it("sem foto da unidade o cabeçalho não quebra", () => {
    renderWithProviders(<SummaryCard booking={booking(null)} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("Aerovalet · Guarulhos")).toBeInTheDocument();
  });

  it("usa a primeira foto da unidade como miniatura", () => {
    const b = booking(null);
    renderWithProviders(
      <SummaryCard
        booking={{ ...b, location: { ...b.location, photos: ["/a.webp", "/b.webp"] } }}
      />,
    );
    expect(screen.getByRole("presentation")).toHaveAttribute("src", "/a.webp");
  });
});
