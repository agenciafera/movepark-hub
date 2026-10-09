import { describe, expect, it } from "vitest";
import { exportHeaders, exportRow } from "./bookingsExport.logic";
import type { UnifiedBookingRow, WlListRow } from "@/types/domain";

const site: UnifiedBookingRow = {
  source: "wl",
  id: "w1",
  wl: {
    id: "w1", company_name: "Abba", wl_order_number: "271001-0001", wl_created_at: "2027-09-20T13:00:00Z",
    origin: "reserva-online", status: "confirmed", site_status: "confirmed", customer_name: "Ana",
    customer_phone: "11999990000", customer_email: "ana@ex.com", license_plate: "ABC1D23",
    location_name: "Afonso Pena", parking_type_name: null, check_in_at: "2027-10-02T11:00:00Z",
    check_out_at: "2027-10-05T12:30:00Z", paid_total_cents: 15050, total_cents: 15050, payment_method_name: "PIX - Pagarme V5",
  } as unknown as WlListRow,
};
const hub = {
  source: "hub", id: "b1",
  booking: {
    id: "b1", code: "MP-1", origin: "white_label", status: "completed", total_amount: 136.5, created_at: "2026-10-08T13:07:00Z",
    check_in_at: "2026-10-10T08:30:00Z", check_out_at: "2026-10-14T01:00:00Z", customer_name: "Bia",
    customer_phone: "21988887777", customer_email: "bia@ex.com", vehicle: { license_plate: "XYZ9K88" },
    payments: [], fare_extensions: [], location: { name: "Afonso Pena", company: { name: "Abba" } },
    price_breakdown: { line_items: [{ kind: "parking", subtotal: 111.6 }, { kind: "fare", subtotal: 24.9 }] },
  },
} as unknown as UnifiedBookingRow;

describe("exportação da lista de reservas", () => {
  it("quem não tem white-label não ganha coluna Origem nem o canal White-label", () => {
    const o = { showSource: false, showCompany: false, valueMode: "parking" as const };
    expect(exportHeaders(o)).not.toContain("Origem");
    const r = exportRow(hub, o);
    expect(r["Canal"]).toBe("");
    expect(r["Diárias (R$)"]).toBe("111,60");
    expect(r["Status"]).toBe("Concluída");
    expect(r["Placa"]).toBe("XYZ9K88");
  });

  it("com white-label: origem, contato e pagamento do site sem o nome do gateway", () => {
    const o = { showSource: true, showCompany: true, valueMode: "total" as const };
    const r = exportRow(site, o);
    expect(r).toMatchObject({
      Origem: "White-label", Reserva: "271001-0001", Canal: "Reserva online", Telefone: "11999990000",
      Placa: "ABC1D23", Empresa: "Abba", Pagamento: "PIX", "Valor (R$)": "150,50",
    });
    expect(Object.keys(r)).toEqual(exportHeaders(o));
  });
});
