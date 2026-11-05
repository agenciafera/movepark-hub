import { afterEach, describe, expect, it } from "vitest";
import {
  SEARCH_LIST,
  bookingEcommerce,
  destinoList,
  isFreshPurchase,
  isNewCustomer,
  itemFromSearchResult,
  listEcommerce,
  listingEcommerce,
  markPurchaseTracked,
  paymentEcommerce,
  partnerFromBooking,
  purchaseEcommerce,
  resultsSignature,
  selectItemEcommerce,
  userDataFromBooking,
  wasPurchaseTracked,
} from "./analytics-ecommerce";
import type { SearchResultItem } from "@/features/search/useSearchResults";
import type { ListingDetail } from "@/features/listing/api";
import type { BookingForCheckout } from "@/features/checkout/api";

afterEach(() => {
  localStorage.clear();
});

function resultado(over: Partial<SearchResultItem> = {}): SearchResultItem {
  return {
    id: "lpt-1",
    operator: { slug: "aerovalet", name: "Aerovalet" },
    location: {
      id: "l1",
      slug: "guarulhos",
      public_path: "/estacionamentos/guarulhos/aerovalet",
      public_name: "Aerovalet - Estacionamento Guarulhos",
      name: "Guarulhos",
      address: null,
      latitude: null,
      longitude: null,
      distance_km: null,
      nearest_terminal: null,
      review_avg: null,
      review_count: 0,
      google_rating: null,
      google_rating_count: 0,
      cover_image: null,
      high_demand_today: false,
    },
    parking_type: { code: "covered", name: "Vaga coberta" },
    capacity: 10,
    availability: { remaining: null, sold_out: false, near_capacity: false, near_capacity_message: null },
    price: { total: 151.4, old_price: null, per_day: 75.7, days: 2, showcase: false },
    amenities: [],
    ...over,
  } as SearchResultItem;
}

function ficha(): ListingDetail {
  return {
    id: "lpt-1",
    capacity: 10,
    is_active: true,
    external_checkout_url: null,
    company: { id: "c1", slug: "aerovalet", name: "Aerovalet", legal_name: null, tax_id: null, created_at: "" },
    location: {
      id: "l1",
      slug: "guarulhos",
      public_slug: "aerovalet",
      public_name: null,
      name: "Guarulhos",
      destination: { seo_label: null, short_name: "Guarulhos", name: "Aeroporto de Guarulhos", type: "airport", city: "Guarulhos", code: "GRU", public_slug: "guarulhos" },
    },
    tipos: [],
    parking_type: { code: "covered", name: "Vaga coberta", description: null },
    company_parking_type: { base_price: 0 },
    amenities: [],
    other_locations: [],
    google: null,
  } as unknown as ListingDetail;
}

function reserva(over: Partial<BookingForCheckout> = {}): BookingForCheckout {
  return {
    id: "bk-1",
    code: "MP-A8K7P2",
    status: "pending",
    total_amount: 170.4,
    currency: "BRL",
    price_breakdown: {
      currency: "BRL",
      days: 2,
      strategy: null,
      base_price: 0,
      old_price: null,
      subtotal: 151.4,
      auto_discount: null,
      coupon: { code: "FERA10", discount: 15.14 },
      fare: { tier: "flex", label: "Flex", amount: 12.9 },
      total: 170.4,
      line_items: [],
    },
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
    customer_phone: "+5511987727182",
    customer_email: "peu+teste1@fera.ag",
    customer_tax_id: null,
    passenger_first_name: null,
    passenger_last_name: null,
    passenger_phone: null,
    fare_tier: "flex",
    flight_number: null,
    location: {
      id: "l1",
      slug: "guarulhos",
      name: "Guarulhos",
      address: null,
      checkout_mode: "hub",
      photos: [],
      public_name: "Aerovalet - Estacionamento Guarulhos",
      company: { slug: "aerovalet", name: "Aerovalet" },
      destination: { code: "GRU", name: "Aeroporto de Guarulhos" },
      ads_conversion_id: null,
      ads_conversion_label: null,
    },
    items: [
      {
        id: "it1",
        item_type: "parking",
        quantity: 1,
        unit_price: 151.4,
        subtotal: 151.4,
        parking_type: { code: "covered", name: "Vaga coberta" },
        add_on_service_id: null,
        add_on_service: null,
      },
      {
        id: "it2",
        item_type: "add_on",
        quantity: 2,
        unit_price: 17.07,
        subtotal: 34.14,
        parking_type: null,
        add_on_service_id: "svc-lavagem",
        add_on_service: { name: "Lavagem simples" },
      },
    ],
    payment: null,
    coupon: { code: "FERA10", discount_applied: 15.14 } as BookingForCheckout["coupon"],
    ...over,
  };
}

describe("lista de resultados", () => {
  it("monta o item com posição, lista e destino", () => {
    const item = itemFromSearchResult(resultado(), 3, { list: SEARCH_LIST, destination: "GRU" });
    expect(item).toMatchObject({
      item_id: "aerovalet/guarulhos:covered",
      item_name: "Aerovalet - Estacionamento Guarulhos",
      item_brand: "Aerovalet",
      item_category: "GRU",
      item_category2: "estacionamento",
      item_variant: "Vaga coberta",
      price: 151.4,
      quantity: 1,
      index: 3,
      item_list_id: "search",
      item_list_name: "Resultados da busca",
      stay_days: 2,
    });
  });

  it("view_item_list numera os itens na ordem da tela", () => {
    const ec = listEcommerce([resultado({ id: "a" }), resultado({ id: "b" })], { list: SEARCH_LIST });
    expect(ec.item_list_id).toBe("search");
    expect(ec.items.map((i) => i.index)).toEqual([0, 1]);
  });

  it("select_item carrega um item só, com a posição que tinha", () => {
    const lista = destinoList("guarulhos", "Guarulhos");
    const ec = selectItemEcommerce(resultado(), 5, { list: lista, destination: "GRU" });
    expect(ec.items).toHaveLength(1);
    expect(ec.items[0].index).toBe(5);
    expect(ec.item_list_id).toBe("destino_guarulhos");
    expect(ec.item_list_name).toBe("Destino Guarulhos");
  });

  it("assinatura ignora a ordem e muda quando a lista muda", () => {
    const ab = resultsSignature("search", [{ id: "a" }, { id: "b" }]);
    expect(resultsSignature("search", [{ id: "b" }, { id: "a" }])).toBe(ab);
    expect(resultsSignature("search", [{ id: "a" }])).not.toBe(ab);
    expect(resultsSignature("destino_gru", [{ id: "a" }, { id: "b" }])).not.toBe(ab);
  });
});

describe("ficha", () => {
  it("view_item com o 'a partir de' e sem cupom", () => {
    const ec = listingEcommerce(ficha(), { total: 120, days: 1 });
    expect(ec).toEqual({
      currency: "BRL",
      value: 120,
      items: [
        expect.objectContaining({
          item_id: "aerovalet/guarulhos:covered",
          item_name: "Aerovalet · Guarulhos",
          item_category: "GRU",
          price: 120,
          stay_days: 1,
        }),
      ],
    });
    expect(ec.items[0]).not.toHaveProperty("fare_tier");
  });

  it("add_to_cart: a tarifa sai como item próprio e a soma bate com o total", () => {
    const ec = listingEcommerce(
      ficha(),
      { total: 170.4, days: 2, fareTier: "flex", fareSurcharge: 12.9, fareLabel: "Flex" },
      "FERA10",
    );
    expect(ec.coupon).toBe("FERA10");
    expect(ec.value).toBe(170.4);
    expect(ec.items).toHaveLength(2);
    expect(ec.items[0]).toMatchObject({ fare_tier: "flex", stay_days: 2, price: 157.5 });
    expect(ec.items[1]).toMatchObject({
      item_id: "tarifa:flex",
      item_name: "Tarifa Flex",
      item_category2: "tarifa",
      item_category: "GRU",
      price: 12.9,
      quantity: 1,
    });
    expect(ec.items.reduce((s, i) => s + i.price * i.quantity, 0)).toBeCloseTo(ec.value!, 2);
  });

  it("tarifa Básica (grátis) não vira item", () => {
    const ec = listingEcommerce(ficha(), { total: 100, days: 2, fareTier: "basic", fareSurcharge: 0 });
    expect(ec.items).toHaveLength(1);
    expect(ec.items[0].price).toBe(100);
  });

  it("sem preço o item sai zerado em vez de inventar", () => {
    const ec = listingEcommerce(ficha(), null);
    expect(ec.value).toBe(0);
    expect(ec.items[0].price).toBe(0);
    expect(ec.items[0]).not.toHaveProperty("stay_days");
  });
});

describe("reserva", () => {
  it("begin_checkout: vaga + adicionais, total e cupom do snapshot", () => {
    const ec = bookingEcommerce(reserva());
    expect(ec.currency).toBe("BRL");
    expect(ec.value).toBe(170.4);
    expect(ec.coupon).toBe("FERA10");
    expect(ec.items).toHaveLength(3);
    expect(ec.items[0]).toMatchObject({
      item_id: "aerovalet/guarulhos:covered",
      item_name: "Aerovalet - Estacionamento Guarulhos",
      item_category: "GRU",
      item_category2: "estacionamento",
      item_variant: "Vaga coberta",
      price: 151.4,
      quantity: 1,
      stay_days: 2,
      fare_tier: "flex",
    });
    expect(ec.items[1]).toMatchObject({
      item_id: "adicional:svc-lavagem",
      item_name: "Lavagem simples",
      item_category2: "adicional",
      price: 17.07,
      quantity: 2,
    });
    expect(ec.items[2]).toMatchObject({
      item_id: "tarifa:flex",
      item_name: "Tarifa Flex",
      item_category2: "tarifa",
      item_brand: "Aerovalet",
      price: 12.9,
      quantity: 1,
      fare_tier: "flex",
    });
  });

  it("sem tarifa paga no snapshot, não há item de tarifa", () => {
    const b = reserva();
    b.price_breakdown = { ...b.price_breakdown!, fare: { tier: "basica", label: "Básica", amount: 0 } };
    expect(bookingEcommerce(b).items.map((i) => i.item_category2)).toEqual(["estacionamento", "adicional"]);
  });

  it("sem cupom o campo não vai", () => {
    expect(bookingEcommerce(reserva({ coupon: null }))).not.toHaveProperty("coupon");
  });

  it("add_payment_info: pix sem parcelas, cartão com", () => {
    expect(paymentEcommerce(reserva(), "pix")).toMatchObject({ payment_type: "pix" });
    expect(paymentEcommerce(reserva(), "pix")).not.toHaveProperty("installments");
    expect(paymentEcommerce(reserva(), "card", 3)).toMatchObject({ payment_type: "card", installments: 3 });
  });

  it("purchase: transaction_id é o código, tax e shipping zerados, meio do pagamento", () => {
    const ec = purchaseEcommerce(
      reserva({
        status: "confirmed",
        payment: { id: "p1", status: "paid", provider: "pagarme", method: "pix", paid_at: "2026-12-10T11:35:00Z" },
      }),
    );
    expect(ec).toMatchObject({
      transaction_id: "MP-A8K7P2",
      value: 170.4,
      tax: 0,
      shipping: 0,
      payment_type: "pix",
      coupon: "FERA10",
    });
  });

  it("user_data só com o que existe, e nunca dentro de ecommerce", () => {
    expect(userDataFromBooking(reserva())).toEqual({
      email_address: "peu+teste1@fera.ag",
      phone_number: "+5511987727182",
    });
    expect(userDataFromBooking(reserva({ customer_email: null }))).toEqual({
      phone_number: "+5511987727182",
    });
    expect(userDataFromBooking(reserva({ customer_email: null, customer_phone: null }))).toBeUndefined();
    expect(JSON.stringify(purchaseEcommerce(reserva()))).not.toContain("fera.ag");
  });
});

describe("cliente novo", () => {
  it("é novo quando as outras reservas não foram pagas", () => {
    expect(isNewCustomer([{ code: "X", status: "cancelled" }, { code: "MP-1", status: "confirmed" }], "MP-1")).toBe(true);
    expect(isNewCustomer([], "MP-1")).toBe(true);
  });
  it("deixa de ser novo com uma paga antes", () => {
    expect(isNewCustomer([{ code: "X", status: "completed" }, { code: "MP-1", status: "confirmed" }], "MP-1")).toBe(false);
  });
});

describe("purchase só perto do pagamento, e uma vez por navegador", () => {
  const agora = new Date("2026-12-10T12:00:00Z");
  it("confirmada há minutos: sim", () => {
    const b = reserva({
      status: "confirmed",
      payment: { id: "p1", status: "paid", provider: "pagarme", method: "pix", paid_at: "2026-12-10T11:50:00Z" },
    });
    expect(isFreshPurchase(b, agora)).toBe(true);
  });
  it("pendente: não; confirmada há 3 dias: não", () => {
    expect(isFreshPurchase(reserva(), agora)).toBe(false);
    const antiga = reserva({
      status: "confirmed",
      payment: { id: "p1", status: "paid", provider: "pagarme", method: "pix", paid_at: "2026-12-07T11:50:00Z" },
    });
    expect(isFreshPurchase(antiga, agora)).toBe(false);
  });
  it("sem paid_at cai na criação", () => {
    expect(isFreshPurchase(reserva({ status: "confirmed", payment: null }), agora)).toBe(true);
  });
  it("marca e relê no localStorage", () => {
    expect(wasPurchaseTracked("MP-1")).toBe(false);
    markPurchaseTracked("MP-1");
    expect(wasPurchaseTracked("MP-1")).toBe(true);
    expect(wasPurchaseTracked("MP-2")).toBe(false);
  });
});

describe("partner: de quem é a compra, e para qual conta de Ads vai a conversão", () => {
  it("leva os slugs da unidade e a conta do parceiro quando o par está preenchido", () => {
    const b = reserva();
    b.location.ads_conversion_id = "AW-326904374";
    b.location.ads_conversion_label = "EaA6CMu82aYbELbU8JsB";
    expect(partnerFromBooking(b)).toEqual({
      company_slug: "aerovalet",
      location_slug: "guarulhos",
      destination_code: "GRU",
      ads_conversion_id: "AW-326904374",
      ads_conversion_label: "EaA6CMu82aYbELbU8JsB",
    });
  });
  it("sem conta própria, os campos de Ads vão nulos e a tag genérica não dispara", () => {
    const p = partnerFromBooking(reserva());
    expect(p.ads_conversion_id).toBeNull();
    expect(p.ads_conversion_label).toBeNull();
    expect(p.company_slug).toBe("aerovalet");
  });
  it("metade do par não dispara nada: id sem rótulo vira nulo dos dois lados", () => {
    const b = reserva();
    b.location.ads_conversion_id = "AW-326904374";
    const p = partnerFromBooking(b);
    expect(p.ads_conversion_id).toBeNull();
    expect(p.ads_conversion_label).toBeNull();
  });
});
