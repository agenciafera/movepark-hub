/**
 * Lógica pura do Motor de Crescimento — testável isolada da UI.
 */

/** Formata centavos como BRL (ex.: 4200 → "R$ 42,00"). */
export function brlFromCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Dias inteiros (arredondando pra cima) de agora até a data ISO; nunca negativo. */
export function daysUntil(iso: string, now: number = Date.now()): number {
  const diff = new Date(iso).getTime() - now;
  return Math.max(0, Math.ceil(diff / 86_400_000));
}

/** Percentual (0–100) de progresso rumo ao próximo nível pelo nº de reservas na janela. */
export function tierProgress(windowBookings: number, nextMinBookings: number | null): number {
  if (nextMinBookings == null) return 100; // já é o topo
  return Math.min(100, Math.round((windowBookings / Math.max(1, nextMinBookings)) * 100));
}

/** Converte cashback em bps para rótulo (ex.: 300 → "3%"). */
export function cashbackPctLabel(bps: number): string {
  return `${(bps / 100).toLocaleString("pt-BR")}%`;
}

/** Primeiro nome a partir do nome completo, com fallback. */
export function firstNameOf(fullName: string | null | undefined, fallback = "cliente"): string {
  return fullName?.trim().split(/\s+/)[0] || fallback;
}

/** Mensagem de indicação pronta pra compartilhar. */
export function referralMessage(link: string): string {
  return (
    `Ganhei um presente pra você no Movepark: R$ 25 de desconto na sua 1ª reserva. ` +
    `É só usar meu link: ${link}`
  );
}

/** URL de compartilhamento no WhatsApp com a mensagem de indicação. */
export function whatsappShareUrl(link: string): string {
  return `https://wa.me/?text=${encodeURIComponent(referralMessage(link))}`;
}
