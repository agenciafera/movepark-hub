import { describe, expect, it } from "vitest";
import {
  dailyRateLabel,
  unifiedRowView,
  wlListRowToBooking,
  wlOriginLabel,
} from "./unifiedBookingRow.logic";
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

  it("valor pago: no Hub é o total da reserva (não as diárias); no site é o que o cliente pagou lá", () => {
    const h = unifiedRowView(hub("hub_search"), { showSource: true, valueMode: "parking" });
    expect(h.value).toBe(111.6);
    expect(h.paid).toBe(136.5);
    const w = unifiedRowView({ source: "wl", id: "w-1", wl }, { showSource: true, valueMode: "parking" });
    expect(w.paid).toBe(150.5);
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

/**
 * Valor da diária na lista (26/11/2026): "Diárias" e "Valor pago" eram parecidas e confundiam. A
 * coluna das diárias diz quantas e quanto cada uma; a do valor pago diz o que soma ou tira (plano,
 * cupom). Valores de MP-B59849 e MP-4E5EEE (Pare Seguro), lidos do banco vivo.
 */
describe("diária e o que explica o valor pago", () => {
  const comBreakdown = (pb: unknown, total: number) => {
    const r = hub("hub_search");
    if (r.source !== "hub") throw new Error("fixture");
    Object.assign(r.booking, { price_breakdown: pb, total_amount: total });
    return r;
  };

  it("8 diárias de R$ 18,90 e o plano Flex de R$ 12,90 que leva ao valor pago", () => {
    const v = unifiedRowView(
      comBreakdown(
        {
          days: 8,
          line_items: [
            { kind: "parking", subtotal: 151.2 },
            { kind: "fare", name: "Flex", tier: "flex", subtotal: 12.9 },
          ],
        },
        164.1,
      ),
      { showSource: false, valueMode: "parking" },
    );
    expect(v.value).toBe(151.2);
    expect(v.daily).toEqual({ days: 8, perDay: 18.9, exact: true });
    expect(dailyRateLabel(v.daily!)).toBe("8 × R$\u00a018,90");
    expect(v.paid).toBe(164.1);
    expect(v.paidNote).toBe("+ plano Flex R$\u00a012,90");
  });

  it("pacote: 29 diárias por R$ 350 não fecham na multiplicação, então a diária é média", () => {
    const v = unifiedRowView(
      comBreakdown({ days: 29, line_items: [{ kind: "parking", subtotal: 350 }] }, 350),
      { showSource: false, valueMode: "parking" },
    );
    expect(v.daily).toEqual({ days: 29, perDay: 12.07, exact: false });
    expect(dailyRateLabel(v.daily!)).toBe("29 diárias, média de R$\u00a012,07");
    // Sem plano nem desconto, o valor pago é o das diárias: nada a explicar.
    expect(v.paidNote).toBeNull();
  });

  it("uma diária só", () => {
    expect(dailyRateLabel({ days: 1, perDay: 19.9, exact: true })).toBe("1 × R$\u00a019,90");
  });

  it("cupom tira do valor pago e aparece junto do plano", () => {
    const v = unifiedRowView(
      comBreakdown(
        {
          days: 4,
          coupon: { code: "VOLTA10" },
          line_items: [
            { kind: "parking", subtotal: 100 },
            { kind: "fare", name: "Superflex", tier: "superflex", subtotal: 24.9 },
          ],
        },
        114.9,
      ),
      { showSource: false, valueMode: "parking" },
    );
    expect(v.paidNote).toBe("+ plano Superflex R$\u00a024,90 · - cupom R$\u00a010,00");
  });

  it("sem breakdown (balcão) ou no modo total, não há diária nem nota", () => {
    const balcao = comBreakdown(null, 99.9);
    if (balcao.source !== "hub") throw new Error("fixture");
    Object.assign(balcao.booking, { total_amount: null, paid_amount: 99.9 });
    const b = unifiedRowView(balcao, { showSource: false, valueMode: "parking" });
    expect(b.daily).toBeNull();
    expect(b.paidNote).toBeNull();
    const t = unifiedRowView(hub("hub_search"), { showSource: false, valueMode: "total" });
    expect(t.daily).toBeNull();
  });

  it("reserva do site não tem o detalhe das diárias", () => {
    const w = unifiedRowView({ source: "wl", id: "w-1", wl }, { showSource: true, valueMode: "parking" });
    expect(w.daily).toBeNull();
    expect(w.paidNote).toBeNull();
  });
});

/** Tipo de vaga na lista (27/11/2026): do item de vaga da reserva no Hub, do pedido no site. */
describe("tipo de vaga", () => {
  it("reserva do Hub: o nome do tipo de vaga do item de vaga, sem os serviços extras", () => {
    const r = hub("hub_search");
    if (r.source !== "hub") throw new Error("fixture");
    Object.assign(r.booking, {
      items: [
        { item_type: "add_on", parking_type: null },
        { item_type: "parking", parking_type: { name: "Vaga Coberta" } },
      ],
    });
    expect(unifiedRowView(r, { showSource: false, valueMode: "parking" }).parkingType).toBe(
      "Vaga Coberta",
    );
  });

  it("reserva do Hub sem itens na linha (ou sem tipo no item): vazio, sem quebrar", () => {
    expect(unifiedRowView(hub("hub_search"), { showSource: false, valueMode: "parking" }).parkingType).toBeNull();
    const r = hub("hub_search");
    if (r.source !== "hub") throw new Error("fixture");
    Object.assign(r.booking, { items: [{ item_type: "parking", parking_type: null }] });
    expect(unifiedRowView(r, { showSource: false, valueMode: "total" }).parkingType).toBeNull();
  });

  it("reserva do site: o tipo de vaga do pedido", () => {
    const v = unifiedRowView({ source: "wl", id: "w-1", wl }, { showSource: true, valueMode: "parking" });
    expect(v.parkingType).toBe("Vaga Coberta");
  });
});

describe("canal da reserva que veio do site do estacionamento", () => {
  it("UTM da Pare Seguro numa unidade dela: Site Pare Seguro, e não Site Movepark", () => {
    const r = hub("hub_direct");
    if (r.source !== "hub") throw new Error("fixture");
    Object.assign(r.booking, {
      utm_source: "pareseguro",
      location: { name: "Aeroporto de Guarulhos", company: { id: "c1", name: "Pare Seguro", slug: "pare-seguro" } },
    });
    const v = unifiedRowView(r, { showSource: false, valueMode: "parking" });
    expect(v.channel).toBe("Site Pare Seguro");
  });

  it("sem UTM do parceiro continua Site Movepark", () => {
    const v = unifiedRowView(hub("hub_direct"), { showSource: false, valueMode: "parking" });
    expect(v.channel).toBe("Site Movepark");
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
