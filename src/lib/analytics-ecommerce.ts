// O formato de e-commerce do GA4, montado a partir do que cada tela já tem na mão.
//
// Tudo aqui é puro (sem React, sem rede) de propósito: é o que se testa. Quem dispara é o
// `trackEcommerce` de `@/lib/analytics`, chamado pelas telas no momento certo. O mapa de qual
// evento sai em qual momento, e o porquê de cada campo, está em
// docs/specs/analytics-ecommerce.md.
//
// A tradução do front antigo (movepark-nextjs, componente `DataLayer`) deixou para trás o que
// não era do schema: e-mail e telefone DENTRO de `ecommerce` (o GA4 não aceita PII), `tax` e
// `shipping` como string, `item_variant` repetindo `item_name`, e os três eventos disparados
// juntos na mesma renderização, o que inflava o funil. Aqui cada evento tem um momento só.

import { tituloDaUnidade } from "@/lib/parkingName";
import type { SearchResultItem } from "@/features/search/useSearchResults";
import type { ListingDetail } from "@/features/listing/api";
import type { BookingForCheckout } from "@/features/checkout/api";

export const AFFILIATION = "Movepark";
export const CURRENCY = "BRL";

/** Um item no schema do GA4, mais dois parâmetros nossos (`stay_days`, `fare_tier`). */
export type EcommerceItem = {
  /**
   * `<slug da empresa>/<slug da unidade>:<código do tipo de vaga>`: estável, legível e igual em
   * toda tela. A empresa entra porque o slug da unidade só é único dentro dela: Aerovalet, Pare
   * Seguro e Aeropark têm todas uma `aeroporto-guarulhos`.
   */
  item_id: string;
  item_name: string;
  affiliation: string;
  item_brand: string;
  /** Destino (código IATA quando aeroporto). */
  item_category: string;
  item_category2: "estacionamento" | "adicional" | "tarifa";
  item_variant?: string;
  price: number;
  quantity: number;
  index?: number;
  item_list_id?: string;
  item_list_name?: string;
  stay_days?: number;
  fare_tier?: string;
};

export type Ecommerce = {
  currency?: string;
  value?: number;
  coupon?: string;
  transaction_id?: string;
  payment_type?: string;
  item_list_id?: string;
  item_list_name?: string;
  tax?: number;
  shipping?: number;
  items: EcommerceItem[];
};

export type ItemList = { id: string; name: string };

export const SEARCH_LIST: ItemList = { id: "search", name: "Resultados da busca" };

export function destinoList(slug: string, name: string): ItemList {
  return { id: `destino_${slug}`, name: `Destino ${name}` };
}

export function itemId(companySlug: string, locationSlug: string, parkingTypeCode: string): string {
  return `${companySlug}/${locationSlug}:${parkingTypeCode}`;
}

/** Centavos arredondados: o GA4 soma `price × quantity` e compara com `value`. */
function money(n: number | null | undefined): number {
  return Math.round((n ?? 0) * 100) / 100;
}

export type ListContext = {
  list: ItemList;
  /** Código do destino buscado (vira `item_category`). */
  destination?: string | null;
};

export function itemFromSearchResult(
  r: SearchResultItem,
  index: number,
  ctx: ListContext,
): EcommerceItem {
  return {
    item_id: itemId(r.operator.slug, r.location.slug, r.parking_type.code),
    item_name: tituloDaUnidade(r.location.public_name, r.operator.name, r.location.name),
    affiliation: AFFILIATION,
    item_brand: r.operator.name,
    item_category: ctx.destination ?? "",
    item_category2: "estacionamento",
    item_variant: r.parking_type.name,
    price: money(r.price.total),
    quantity: 1,
    index,
    item_list_id: ctx.list.id,
    item_list_name: ctx.list.name,
    stay_days: r.price.days,
  };
}

/** `view_item_list`: a lista inteira, com a posição de cada card. */
export function listEcommerce(results: SearchResultItem[], ctx: ListContext): Ecommerce {
  return {
    item_list_id: ctx.list.id,
    item_list_name: ctx.list.name,
    items: results.map((r, i) => itemFromSearchResult(r, i, ctx)),
  };
}

/** `select_item`: o card clicado, com a mesma posição que tinha na lista. */
export function selectItemEcommerce(r: SearchResultItem, index: number, ctx: ListContext): Ecommerce {
  return {
    item_list_id: ctx.list.id,
    item_list_name: ctx.list.name,
    items: [itemFromSearchResult(r, index, ctx)],
  };
}

/**
 * Assinatura de uma lista para não repetir o `view_item_list` a cada refetch. Independe da
 * ordem porque na página de destino a semente do build e a busca com datas trazem os mesmos
 * lotes em ordens diferentes, e isso não é uma lista nova.
 */
export function resultsSignature(listId: string, results: { id: string }[]): string {
  return `${listId}|${results.map((r) => r.id).sort().join(",")}`;
}

export type ListingPrice = {
  /** Total da estadia (ou o "a partir de" quando não há datas), com a tarifa dentro. */
  total: number;
  days: number;
  fareTier?: string | null;
  /** Acréscimo da tarifa escolhida (Flex/Superflex). Vira item próprio quando > 0. */
  fareSurcharge?: number;
  fareLabel?: string;
};

/**
 * A tarifa (Flex/Superflex) é item próprio, e não parte do preço da vaga: é receita de serviço
 * da Movepark, e separada ela aparece no relatório de itens do GA4 e faz a soma dos itens bater
 * com `value`. A Básica é grátis e não vira item.
 */
function fareItem(
  brand: string,
  category: string,
  fare: { tier: string; label: string; amount: number } | null | undefined,
): EcommerceItem | null {
  if (!fare || !(fare.amount > 0)) return null;
  return {
    item_id: `tarifa:${fare.tier}`,
    item_name: `Tarifa ${fare.label}`,
    affiliation: AFFILIATION,
    item_brand: brand,
    item_category: category,
    item_category2: "tarifa",
    price: money(fare.amount),
    quantity: 1,
    fare_tier: fare.tier,
  };
}

export function itemFromListing(listing: ListingDetail, price: ListingPrice | null): EcommerceItem {
  return {
    item_id: itemId(listing.company.slug, listing.location.slug, listing.parking_type.code),
    item_name: tituloDaUnidade(
      listing.location.public_name,
      listing.company.name,
      listing.location.name,
    ),
    affiliation: AFFILIATION,
    item_brand: listing.company.name,
    item_category: listing.location.destination?.code ?? listing.location.destination?.name ?? "",
    item_category2: "estacionamento",
    item_variant: listing.parking_type.name,
    price: money((price?.total ?? 0) - (price?.fareSurcharge ?? 0)),
    quantity: 1,
    ...(price ? { stay_days: price.days } : {}),
    ...(price?.fareTier ? { fare_tier: price.fareTier } : {}),
  };
}

/** `view_item`, `add_to_cart` e `external_checkout_click`: a oferta em evidência na ficha. */
export function listingEcommerce(
  listing: ListingDetail,
  price: ListingPrice | null,
  coupon?: string | null,
): Ecommerce {
  const item = itemFromListing(listing, price);
  const fare =
    price?.fareTier && price.fareSurcharge
      ? fareItem(item.item_brand, item.item_category, {
          tier: price.fareTier,
          label: price.fareLabel ?? price.fareTier,
          amount: price.fareSurcharge,
        })
      : null;
  return {
    currency: CURRENCY,
    value: money(price?.total),
    ...(coupon ? { coupon } : {}),
    items: fare ? [item, fare] : [item],
  };
}

/** Os itens da reserva: a vaga (com tarifa e diárias) e cada adicional. */
export function itemsFromBooking(booking: BookingForCheckout): EcommerceItem[] {
  const loc = booking.location;
  const name = tituloDaUnidade(loc.public_name, loc.company.name, loc.name);
  const category = loc.destination?.code ?? loc.destination?.name ?? "";
  const days = booking.price_breakdown?.days;
  const fare = fareItem(loc.company.name, category, booking.price_breakdown?.fare);
  const items: EcommerceItem[] = booking.items.map((it) => {
    if (it.item_type === "add_on") {
      return {
        item_id: `adicional:${it.add_on_service_id ?? it.id}`,
        item_name: it.add_on_service?.name ?? "Adicional",
        affiliation: AFFILIATION,
        item_brand: loc.company.name,
        item_category: category,
        item_category2: "adicional" as const,
        price: money(it.unit_price),
        quantity: it.quantity,
      };
    }
    return {
      item_id: itemId(loc.company.slug, loc.slug, it.parking_type?.code ?? "vaga"),
      item_name: name,
      affiliation: AFFILIATION,
      item_brand: loc.company.name,
      item_category: category,
      item_category2: "estacionamento" as const,
      item_variant: it.parking_type?.name ?? undefined,
      price: money(it.subtotal),
      quantity: 1,
      ...(days ? { stay_days: days } : {}),
      ...(booking.fare_tier ? { fare_tier: booking.fare_tier } : {}),
    };
  });
  return fare ? [...items, fare] : items;
}

/** `begin_checkout`: a reserva como está quando o checkout abre. */
export function bookingEcommerce(booking: BookingForCheckout): Ecommerce {
  return {
    currency: booking.currency || CURRENCY,
    value: money(booking.total_amount),
    ...(booking.coupon?.code ? { coupon: booking.coupon.code } : {}),
    items: itemsFromBooking(booking),
  };
}

export type PaymentType = "pix" | "card";

/** `add_payment_info`: o meio escolhido, e as parcelas quando cartão. */
export function paymentEcommerce(
  booking: BookingForCheckout,
  paymentType: PaymentType,
  installments?: number,
): Ecommerce & { installments?: number } {
  return {
    ...bookingEcommerce(booking),
    payment_type: paymentType,
    ...(paymentType === "card" && installments ? { installments } : {}),
  };
}

/** `purchase`: a reserva confirmada. `transaction_id` é o código da reserva, que o cliente também vê. */
export function purchaseEcommerce(booking: BookingForCheckout): Ecommerce {
  const method = booking.payment?.method ?? null;
  return {
    ...bookingEcommerce(booking),
    transaction_id: booking.code,
    tax: 0,
    shipping: 0,
    ...(method ? { payment_type: method } : {}),
  };
}

/**
 * O parceiro da compra, fora de `ecommerce`, para o GTM decidir conversão por unidade sem fatiar
 * string. Os slugs identificam a unidade (`location.slug` só é único dentro da empresa); os
 * campos `ads_*` são a conta do Google Ads do parceiro, lidos do cadastro da unidade. A tag
 * genérica do GTM dispara quando `ads_conversion_id` vem preenchido e manda a conversão para ela.
 * Ver docs/specs/analytics-ecommerce.md §3.1.
 */
export type Partner = {
  company_slug: string;
  location_slug: string;
  destination_code: string | null;
  ads_conversion_id: string | null;
  ads_conversion_label: string | null;
};

export function partnerFromBooking(
  booking: Pick<BookingForCheckout, "location">,
): Partner {
  const loc = booking.location;
  // O par só vale junto (constraint do banco); se um lado vier vazio, a tag não pode disparar.
  const complete = !!loc.ads_conversion_id && !!loc.ads_conversion_label;
  return {
    company_slug: loc.company.slug,
    location_slug: loc.slug,
    destination_code: loc.destination?.code ?? null,
    ads_conversion_id: complete ? loc.ads_conversion_id : null,
    ads_conversion_label: complete ? loc.ads_conversion_label : null,
  };
}

/**
 * E-mail e telefone do pedido, fora de `ecommerce`, no formato que o GTM espera para a
 * conversão otimizada do Google Ads (`user_data`). Vem do snapshot da reserva, que é o contato
 * operacional (ADR-006), nunca do `profiles`.
 */
export function userDataFromBooking(
  booking: Pick<BookingForCheckout, "customer_email" | "customer_phone">,
): { email_address?: string; phone_number?: string } | undefined {
  const out: { email_address?: string; phone_number?: string } = {};
  if (booking.customer_email) out.email_address = booking.customer_email;
  if (booking.customer_phone) out.phone_number = booking.customer_phone;
  return Object.keys(out).length ? out : undefined;
}

/** Cliente novo = nenhuma outra reserva paga antes desta. */
export function isNewCustomer(
  history: { code: string; status: string }[],
  currentCode: string,
): boolean {
  return !history.some(
    (b) =>
      b.code !== currentCode &&
      (b.status === "confirmed" || b.status === "checked_in" || b.status === "completed"),
  );
}

/**
 * A reserva acabou de ser paga? O `purchase` só vale perto do pagamento: quem reabre o link do
 * checkout de uma reserva antiga, em outro aparelho, não comprou de novo. Janela de 24h sobre
 * `paid_at` (ou a criação, quando o pagamento não trouxe a hora).
 */
export const PURCHASE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isFreshPurchase(
  booking: Pick<BookingForCheckout, "status" | "created_at" | "payment">,
  now: Date = new Date(),
): boolean {
  if (booking.status !== "confirmed") return false;
  const ref = booking.payment?.paid_at ?? booking.created_at;
  const t = new Date(ref).getTime();
  if (Number.isNaN(t)) return false;
  return now.getTime() - t <= PURCHASE_WINDOW_MS;
}

const PURCHASE_KEY = "mp_ga_purchase:";

/** O `purchase` desta reserva já saiu deste navegador? (Recarregar a confirmação não compra de novo.) */
export function wasPurchaseTracked(code: string): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage?.getItem(PURCHASE_KEY + code) === "1";
  } catch {
    return false;
  }
}

export function markPurchaseTracked(code: string): void {
  try {
    window.localStorage?.setItem(PURCHASE_KEY + code, "1");
  } catch {
    // Sem localStorage o dedupe fica por conta do ref em memória de quem chama.
  }
}
