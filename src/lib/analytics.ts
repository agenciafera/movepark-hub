// Eventos de produto para o GTM (dataLayer), que é o que já está carregado em index.html.
//
// Existe para o sinal que NÃO merece tabela. O "me avise quando abrir" do lote mapeado
// (E0.17-e) é o primeiro caso: é instrumentação, não mecanismo. Vira tabela no dia em que
// provar valor, e não antes, porque tabela nova custa RLS, retenção e LGPD para responder
// uma pergunta que um evento responde igual.
//
// Não confundir com `recordExitClick` (E0.16), que grava no banco de propósito: aquele
// alimenta o funil comercial da unidade externa, é ligado a uma vaga real e tem retenção
// definida. Este aqui é contagem.

/** Nome do evento no dataLayer. Fechado de propósito: evento novo passa por revisão. */
export type ProductEvent = "prospect_demand_signal" | "prospect_claim_intent";

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
