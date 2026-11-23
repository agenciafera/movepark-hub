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
    fare_tier: "flex",
    flight_number: null,
    commission_installments_max: null,
    commission_installments_interest_free: null,
    location: {
      id: "l1",
      slug: "gru",
      name: "Guarulhos",
      address: null,
      checkout_mode: "hub",
      photos: [],
      public_name: null,
      company: { slug: "aero", name: "Aerovalet" },
      destination: { code: "GRU", name: "Aeroporto de Guarulhos" },
      ads_conversion_id: null,
      ads_conversion_label: null,
      ga4_measurement_id: null,
      partner_notice_md: null,
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

  it("cupom aplicado aparece como linha do resumo, com o desconto", () => {
    renderWithProviders(
      <SummaryCard
        booking={{
          ...booking(fullBreakdown()),
          total_amount: 91.4,
          coupon: { code: "AZULONE40", discount_applied: 60 },
        }}
      />,
    );
    expect(screen.getByText("Cupom AZULONE40")).toBeInTheDocument();
    expect(screen.getByText("−R$ 60,00")).toBeInTheDocument();
    // O botão não repete o cupom: ele só abre a troca.
    expect(screen.getByRole("button", { name: /trocar cupom/i })).toBeInTheDocument();
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

  it("mostra o logo de quem opera a vaga, na versão para fundo claro", () => {
    const b = booking(null);
    renderWithProviders(
      <SummaryCard
        booking={{
          ...b,
          location: {
            ...b.location,
            logo: { light: "https://cdn.test/aero.png", dark: "https://cdn.test/aero-branco.png" },
          },
        }}
      />,
    );
    expect(screen.getByText("Operado por")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Aerovalet" })).toHaveAttribute(
      "src",
      "https://cdn.test/aero.png",
    );
  });

  it("sem logo cadastrado, não mostra o \"Operado por\"", () => {
    const b = booking(null);
    renderWithProviders(
      <SummaryCard
        booking={{ ...b, location: { ...b.location, logo: { light: null, dark: "https://x/b.png" } } }}
      />,
    );
    expect(screen.queryByText("Operado por")).not.toBeInTheDocument();
  });

  it("aviso do estacionamento aparece no resumo, com negrito e lista, só quando preenchido", () => {
    const b = booking(null);
    const { unmount } = renderWithProviders(<SummaryCard booking={b} />);
    expect(screen.queryByTestId("checkout-partner-notice")).not.toBeInTheDocument();
    unmount();

    const com = booking(null);
    com.location.partner_notice_md = "**Malas extras** são cobradas pelo estacionamento.\n- Até 2 por pessoa";
    renderWithProviders(<SummaryCard booking={com} bare />);
    const bloco = screen.getByTestId("checkout-partner-notice");
    expect(bloco).toHaveTextContent("Aviso do estacionamento");
    expect(bloco.querySelector("strong")?.textContent).toBe("Malas extras");
    expect(bloco.querySelector("li")?.textContent).toBe("Até 2 por pessoa");
  });
});
