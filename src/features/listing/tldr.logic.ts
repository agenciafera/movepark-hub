import { formatBRL, formatDistance, formatRating } from "@/lib/format";
import { FREE_CANCEL_WINDOW_HOURS } from "@/features/bookings/cancellation.logic";
import type { ListingDetail, TerminalDistance } from "./api";

/**
 * TLDR-first (E3.2 · agent-readiness-seo): resumo extraível no topo da página de unidade.
 * Gerado dos dados que já existem (preço, proximidade, traslado, avaliação, cancelamento) —
 * conteúdo fresco e factual é o que faz a IA citar. É lógica pura pra ser testável e reusável
 * no JSON-LD (`description`) e no markdown pra agentes.
 */

export type TldrFact = {
  /** Chave estável (mapeia pra ícone na UI). */
  key: "price" | "terminal" | "shuttle" | "rating" | "cancel";
  label: string;
  value: string;
};

export type ListingTldr = {
  /** Frase-resumo em linguagem natural (a "TLDR" que a IA extrai). */
  summary: string;
  /** Fatos-chave em bullets (rótulo + valor). */
  facts: TldrFact[];
};

/**
 * Terminal mais próximo com distância conhecida. Prioriza o marcado `is_nearest`
 * (calculado no banco, DAT-05); se nenhum vier marcado, cai na menor distância.
 */
export function nearestTerminal(terminals: TerminalDistance[]): TerminalDistance | null {
  const withDist = terminals.filter((t) => t.distance_km != null);
  if (withDist.length === 0) return null;
  return (
    withDist.find((t) => t.is_nearest) ??
    [...withDist].sort((a, b) => (a.distance_km as number) - (b.distance_km as number))[0]
  );
}

/** Rótulo do traslado, ou null quando a unidade não informa nenhum dado de transfer. */
export function shuttleLabel(listing: ListingDetail): string | null {
  const min = listing.location.shuttle_to_terminal_minutes;
  const freq = listing.location.shuttle_frequency_minutes;
  if (min == null && freq == null) return null;
  if (min != null) return `Transfer ao terminal em ${min} min`;
  return "Transfer gratuito ao terminal";
}

export function buildListingTldr(
  listing: ListingDetail,
  opts?: { nearest?: TerminalDistance | null },
): ListingTldr {
  const facts: TldrFact[] = [];

  const price = listing.company_parking_type.base_price;
  facts.push({ key: "price", label: "A partir de", value: `${formatBRL(price)} / diária` });

  const nearest = opts?.nearest ?? null;
  if (nearest && nearest.distance_km != null) {
    facts.push({
      key: "terminal",
      label: "Terminal mais perto",
      value: `${nearest.point_name} · ${formatDistance(nearest.distance_km)}`,
    });
  }

  const shuttle = shuttleLabel(listing);
  if (shuttle) facts.push({ key: "shuttle", label: "Transfer", value: shuttle });

  const count = listing.location.review_count ?? 0;
  const avg = listing.location.review_avg;
  if (count > 0 && avg != null) {
    facts.push({
      key: "rating",
      label: "Avaliação",
      value: `${formatRating(avg)} de 5 · ${count} ${count === 1 ? "avaliação" : "avaliações"}`,
    });
  }

  facts.push({
    key: "cancel",
    label: "Cancelamento",
    value: `Grátis até ${FREE_CANCEL_WINDOW_HOURS}h antes do check-in`,
  });

  return { summary: buildSummary(listing, { nearest, shuttle, count, avg, price }), facts };
}

function buildSummary(
  listing: ListingDetail,
  ctx: {
    nearest: TerminalDistance | null;
    shuttle: string | null;
    count: number;
    avg: number | null;
    price: number;
  },
): string {
  const parts: string[] = [];

  // Frase 1 — o quê e onde.
  parts.push(`${listing.parking_type.name} no ${listing.company.name}, em ${listing.location.name}.`);

  // Frase 2 — preço + proximidade + traslado.
  let s2 = `A partir de ${formatBRL(ctx.price)} por diária`;
  if (ctx.nearest && ctx.nearest.distance_km != null) {
    s2 += `, a ${formatDistance(ctx.nearest.distance_km)} de ${ctx.nearest.point_name}`;
  }
  if (ctx.shuttle) {
    s2 += `, com ${ctx.shuttle.toLowerCase()}`;
  }
  parts.push(`${s2}.`);

  // Frase 3 — cancelamento + avaliação.
  let s3 = `Cancelamento grátis até ${FREE_CANCEL_WINDOW_HOURS}h antes do check-in`;
  if (ctx.count > 0 && ctx.avg != null) {
    s3 += `. Nota ${formatRating(ctx.avg)} de 5 em ${ctx.count} ${ctx.count === 1 ? "avaliação" : "avaliações"}`;
  }
  parts.push(`${s3}.`);

  return parts.join(" ");
}
