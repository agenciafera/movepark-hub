// Eventos para o GTM (dataLayer), que é o que já está carregado em index.html.
//
// Duas famílias, dois helpers:
//
// - `trackEvent`: sinal de produto que NÃO merece tabela. O "me avise quando abrir" do lote
//   mapeado (E0.17-e) é o primeiro caso: é instrumentação, não mecanismo. Vira tabela no dia
//   em que provar valor, e não antes, porque tabela nova custa RLS, retenção e LGPD para
//   responder uma pergunta que um evento responde igual.
// - `trackEcommerce`: a jornada de compra no formato de e-commerce do GA4 (view_item_list →
//   purchase). O GA4 só monta funil, receita e item quando o objeto se chama `ecommerce` e os
//   itens seguem o schema dele, então o formato é fechado em `analytics-ecommerce.ts`. Ver
//   docs/specs/analytics-ecommerce.md.
//
// Não confundir com `recordExitClick` (E0.16), que grava no banco de propósito: aquele
// alimenta o funil comercial da unidade externa, é ligado a uma vaga real e tem retenção
// definida. Estes aqui são contagem.

import type { Ecommerce } from "@/lib/analytics-ecommerce";

/** Nome do evento de produto no dataLayer. Fechado de propósito: evento novo passa por revisão. */
export type ProductEvent = "prospect_demand_signal" | "prospect_claim_intent";

/**
 * Eventos de e-commerce. Os sete primeiros são os nomes recomendados pelo GA4 (lista "Online
 * sales"), e só eles entram nos relatórios de funil e receita. `external_checkout_click` é
 * nosso: a unidade externa fecha no site do parceiro, e o clique de saída é o último ponto que
 * o Hub enxerga (E0.16). Fechado de propósito, igual ao de cima.
 */
export type EcommerceEvent =
  | "view_item_list"
  | "select_item"
  | "view_item"
  | "add_to_cart"
  | "begin_checkout"
  | "add_payment_info"
  | "purchase"
  | "external_checkout_click";

type EventParams = Record<string, string | number | boolean | null | undefined>;

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

/**
 * Empurra um evento, e some em silêncio quando não há para onde empurrar.
 *
 * SSR-safe: no build do SSG não existe `window`, e métrica que derruba a página é pior
 * que métrica faltando. Mesma postura do `sendExitClick`.
 */
export function trackEvent(event: ProductEvent, params: EventParams = {}): void {
  if (typeof window === "undefined") return;
  try {
    window.dataLayer = window.dataLayer ?? [];
    window.dataLayer.push({ event, ...params });
  } catch {
    // Bloqueador de anúncio, modo privado, GTM não carregado. Nada disso é problema nosso.
  }
}

/**
 * Empurra um evento de e-commerce no formato do GA4.
 *
 * Antes do evento vai um `{ ecommerce: null }`: o GTM mescla pushes consecutivos, e sem o
 * reset os itens do `view_item` anterior vazariam para o `add_to_cart` seguinte. É a prática
 * que o próprio Google pede na doc do dataLayer de e-commerce.
 *
 * `extra` é o que fica FORA do objeto `ecommerce`: `user_id`, `new_customer` e `user_data`
 * (e-mail e telefone para conversão otimizada do Ads). O GA4 ignora o que não conhece dentro
 * de `ecommerce`, e PII nunca entra lá.
 */
export function trackEcommerce(
  event: EcommerceEvent,
  ecommerce: Ecommerce,
  extra: Record<string, unknown> = {},
): void {
  if (typeof window === "undefined") return;
  try {
    window.dataLayer = window.dataLayer ?? [];
    window.dataLayer.push({ ecommerce: null });
    window.dataLayer.push({ event, ecommerce, ...extra });
  } catch {
    // Mesmo motivo do `trackEvent`.
  }
}
