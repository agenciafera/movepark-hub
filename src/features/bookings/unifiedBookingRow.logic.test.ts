import { describe, expect, it } from "vitest";
import { unifiedRowView, wlListRowToBooking, wlOriginLabel } from "./unifiedBookingRow.logic";
import type { UnifiedBookingRow, WlListRow } from "@/types/domain";

const wl = {
  id: "w-1", company_name: "Abbapark", wl_order_number: "271001-0001", wl_created_at: "2027-09-20T13:00:00Z",
  origin: "reserva-online", status: "completed", site_status: "confirmed", customer_name: "Ana",
  location_name: null, parking_type_name: "Vaga Coberta", check_in_at: "2027-10-02T01:00:00Z",
  check_out_at: "2027-10-05T09:30:00Z", paid_total_cents: 15050, total_cents: 16000,
} as unknown as WlListRow;

const hub = (origin: string | null) =>
  ({
    source: "hub", id: "b1",
    booking: { id: "b1", code: "MP-1", origin, status: "confirmed", total_amount: 136.5, created_at: "2026-10-08T13:07:00Z",
      check_in_at: "2026-10-10T08:30:00Z", check_out_at: "2026-10-14T01:00:00Z", payments: [], fare_extensions: [],
      price_breakdown: { line_items: [{ kind: "parking", subtotal: 111.6 }, { kind: "fare", subtotal: 24.9 }] } },
  }) as unknown as UnifiedBookingRow;

describe("unifiedRowView", () => {
  it("reserva do site: pedido, valor pago em reais, pago no site, status do Hub", () => {
    const v = unifiedRowView({ source: "wl", id: "w-1", wl }, { showSource: true, valueMode: "parking" });
    expect(v).toMatchObject({
      code: "271001-0001", sourceLabel: "White-label", channel: "Reserva online", value: 150.5,
      payment: { method: "No site", badge: null }, status: "completed", unitName: "Vaga Coberta",
    });
  });

  it("com a cópia completa, a reserva do site mostra a forma de pagamento", () => {
    const v = unifiedRowView({ source: "wl", id: "w-1", wl: { ...wl, payment_method_name: "PIX" } }, { showSource: true, valueMode: "total" });
    expect(v.payment.method).toBe("PIX");
  });

  it("sem white-label não sai etiqueta nem o canal White-label de uma reserva do Hub", () => {
    const v = unifiedRowView(hub("white_label"), { showSource: false, valueMode: "total" });
    expect(v.sourceLabel).toBeNull();
    expect(v.channel).toBeNull();
    expect(v.value).toBe(136.5);
  });

  it("com white-label a reserva do Hub ganha a etiqueta Hub; no Operator o valor são as diárias", () => {
    const v = unifiedRowView(hub("hub_search"), { showSource: true, valueMode: "parking" });
    expect(v.sourceLabel).toBe("Hub");
    expect(v.channel).toBe("Site Movepark");
    expect(v.value).toBe(111.6);
  });
});

describe("wlListRowToBooking / wlOriginLabel", () => {
  it("o detalhe recebe o status do site, não o traduzido", () => {
    expect(wlListRowToBooking(wl).status).toBe("confirmed");
  });
  it("canal do legado", () => {
    expect(wlOriginLabel("reserva-online")).toBe("Reserva online");
    expect(wlOriginLabel("whatsapp-bot")).toBe("Mia no WhatsApp");
    expect(wlOriginLabel(null)).toBeNull();
  });
});
