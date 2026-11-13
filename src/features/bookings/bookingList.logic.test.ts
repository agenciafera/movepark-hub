import { describe, expect, it } from "vitest";
import {
  bookingListSummary,
  bookingSearchOr,
  channelShortLabel,
  partnerSiteLabel,
  paymentMethodLabel,
  sanitizeBookingSearch,
} from "./bookingList.logic";

const pay = (o: Record<string, unknown>) => ({ status: "paid", created_at: "2026-10-01T10:00:00Z", ...o });

describe("paymentMethodLabel", () => {
  it("sem pagamento devolve null (a tela escreve 'Sem pagamento')", () => {
    expect(paymentMethodLabel([])).toBeNull();
    expect(paymentMethodLabel(null)).toBeNull();
  });
  it("PIX, cartão à vista e parcelado, curto e longo", () => {
    expect(paymentMethodLabel([pay({ method: "pix" })])).toBe("PIX");
    expect(paymentMethodLabel([pay({ method: "card", installments: 1 })])).toBe("Cartão");
    expect(paymentMethodLabel([pay({ method: "card", installments: 3 })])).toBe("Cartão 3x");
    expect(paymentMethodLabel([pay({ method: "card", installments: 1 })], "long")).toBe("Cartão de crédito à vista");
    expect(paymentMethodLabel([pay({ method: "card", installments: 3 })], "long")).toBe("Cartão de crédito em 3x");
  });
  it("vale o pagamento mais recente: cartão recusado e depois PIX pago é PIX", () => {
    const r = paymentMethodLabel([
      pay({ method: "card", status: "failed", created_at: "2026-10-01T10:00:00Z" }),
      pay({ method: "pix", created_at: "2026-10-01T10:05:00Z" }),
    ]);
    expect(r).toBe("PIX");
  });
});

describe("channelShortLabel", () => {
  it("agrupa as origens do site e nomeia os agentes", () => {
    expect(channelShortLabel("hub_search")).toBe("Site Movepark");
    expect(channelShortLabel("hub_destino")).toBe("Site Movepark");
    expect(channelShortLabel("whatsapp-bot")).toBe("Mia no WhatsApp");
    expect(channelShortLabel("webchat-bot")).toBe("Assistente do site");
    expect(channelShortLabel(null)).toBeNull();
    expect(channelShortLabel("novo_canal")).toBe("novo_canal");
  });
});

describe("partnerSiteLabel", () => {
  const pare = { name: "Pare Seguro", slug: "pare-seguro" };

  it("UTM com o nome da empresa da unidade: Site da empresa, sem diferença de caixa nem espaço", () => {
    expect(partnerSiteLabel({ origin: "hub_direct", utm_source: "pareseguro", company: pare })).toBe(
      "Site Pare Seguro",
    );
    expect(partnerSiteLabel({ origin: "hub_search", utm_source: " PareSeguro ", company: pare })).toBe(
      "Site Pare Seguro",
    );
    expect(partnerSiteLabel({ origin: "hub_direct", utm_source: "pare-seguro", company: pare })).toBe(
      "Site Pare Seguro",
    );
  });

  it("sem UTM na reserva, vale o do clique guardado ou o domínio do referrer", () => {
    expect(
      partnerSiteLabel({
        origin: "hub_direct",
        attribution: { utm_source: "pareseguro" },
        company: pare,
      }),
    ).toBe("Site Pare Seguro");
    expect(
      partnerSiteLabel({
        origin: "hub_direct",
        attribution: { referrer: "https://www.pareseguro.com.br/reservar" },
        company: pare,
      }),
    ).toBe("Site Pare Seguro");
  });

  it("regra de comissão cadastrada manda: o nome dela é o canal", () => {
    expect(
      partnerSiteLabel({
        origin: "hub_direct",
        utm_source: "agenciafera",
        commission_rule_id: "r1",
        commission_channel: "Site da Fera",
        company: { name: "Agência Fera" },
      }),
    ).toBe("Site da Fera");
    // Sem regra, "hub" é o padrão e não vira rótulo.
    expect(
      partnerSiteLabel({ origin: "hub_direct", commission_channel: "hub", company: pare }),
    ).toBeNull();
  });

  it("UTM de outro lugar, de outra empresa ou fora do site da Movepark não muda o canal", () => {
    expect(partnerSiteLabel({ origin: "hub_direct", utm_source: "google", company: pare })).toBeNull();
    expect(
      partnerSiteLabel({ origin: "hub_direct", utm_source: "pareseguro", company: { name: "Virapark" } }),
    ).toBeNull();
    expect(
      partnerSiteLabel({ origin: "whatsapp-bot", utm_source: "pareseguro", company: pare }),
    ).toBeNull();
    expect(partnerSiteLabel({ origin: "hub_direct", utm_source: "pareseguro", company: null })).toBeNull();
    expect(
      partnerSiteLabel({
        origin: "hub_direct",
        attribution: { referrer: "nao-e-url" },
        company: pare,
      }),
    ).toBeNull();
  });
});

describe("busca", () => {
  // Vírgula e parênteses abririam outra condição no or() do PostgREST.
  it("tira os caracteres que mudam o sentido do filtro", () => {
    expect(sanitizeBookingSearch(" ana,silva) ")).toBe("ana silva");
    expect(sanitizeBookingSearch("code.eq.x,id.neq.(1)")).toBe("code.eq.x id.neq. 1");
  });
  it("percorre código, nome, e-mail e telefone; vazio não filtra", () => {
    expect(bookingSearchOr("MP-99")).toBe(
      "code.ilike.%MP-99%,customer_name.ilike.%MP-99%,customer_email.ilike.%MP-99%,customer_phone.ilike.%MP-99%",
    );
    expect(bookingSearchOr(" , ")).toBeNull();
  });
});

describe("bookingListSummary", () => {
  it("conta pagas por meio, soma só o que não foi devolvido e separa quem não pagou", () => {
    const s = bookingListSummary([
      { status: "confirmed", total_amount: 100, payments: [pay({ method: "pix" })] },
      { status: "completed", total_amount: "50.5", payments: [pay({ method: "card" })] },
      { status: "cancelled", total_amount: 80, payments: [pay({ method: "card", status: "refunded" })] },
      { status: "pending", total_amount: 30, payments: [] },
      { status: "expired", total_amount: 40, payments: [] },
      { status: "pending", total_amount: 20, payments: [pay({ method: "card", status: "failed" })] },
    ]);
    expect(s).toEqual({ total: 6, paid: 3, paidAmount: 150.5, awaiting: 2, lost: 1, pix: 1, card: 2 });
  });
});
