import { formatBRL, formatDistance, formatRating } from "@/lib/format";
import { FREE_CANCEL_WINDOW_HOURS } from "@/features/bookings/cancellation.logic";
import { getLocationCapabilities, type LocationCapabilities } from "./capabilities";
import { showcaseFromPrice } from "./reservation.logic";
import type { ListingDetail, TerminalDistance } from "./api";

/**
 * TLDR-first (E3.2 · agent-readiness-seo): resumo extraível no topo da página de unidade.
 * Gerado dos dados que já existem (preço, proximidade, traslado, avaliação, cancelamento),
 * porque conteúdo fresco e factual é o que faz a IA citar. É lógica pura pra ser testável e
 * reusável no JSON-LD (`description`) e no markdown pra agentes.
 *
 * **O ADR-009 vale aqui igual (corrigido em 12/08/2026).** Este resumo não aparece na tela: ele
 * vira `<meta name="description">` e o `description` do JSON-LD. Isso o fez passar despercebido
 * por um ano, porque o teste de capacidade da página procura texto VISÍVEL e aqui não há nenhum.
 * Só que promessa publicada é promessa: nas nove unidades externas o schema afirmava
 * "Cancelamento grátis até 24h" e "Nota 5,0 de 5" enquanto o card ao lado dizia que quem responde
 * pela reserva é o parceiro. A oferta vincula o fornecedor onde quer que ela seja publicada, e o
 * Google indexa a versão do schema.
 *
 * Por isso as capacidades são lidas AQUI DENTRO, de `listing.location`, e não recebidas por
 * parâmetro: quem chama não tem como esquecer de passar.
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
  const caps = getLocationCapabilities(listing.location);
  const facts: TldrFact[] = [];

  // `base_price` é 0 nas unidades espelhadas, porque a tabela vem do parceiro e esse campo do
  // catálogo nunca foi preenchido. Zero não é preço. O card visível já usa `showcaseFromPrice`
  // para omitir; o resumo não usava, e publicava "a partir de R$ 0,00" em TODAS as unidades
  // conferidas, própria ou externa. Preço ausente é ruim; preço zero indexado é pior.
  const price = showcaseFromPrice(listing.company_parking_type.base_price);
  if (price != null) {
    facts.push({ key: "price", label: "A partir de", value: `${formatBRL(price)} / diária` });
  }

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

  // A nota histórica continua no banco depois que a unidade vira externa, e a página esconde o
  // bloco de avaliação (há teste de render para isso). O resumo mostrava assim mesmo.
  const count = caps.reviews ? (listing.location.review_count ?? 0) : 0;
  const avg = caps.reviews ? listing.location.review_avg : null;
  if (count > 0 && avg != null) {
    facts.push({
      key: "rating",
      label: "Avaliação",
      value: `${formatRating(avg)} de 5 · ${count} ${count === 1 ? "avaliação" : "avaliações"}`,
    });
  }

  if (caps.cancellation) {
    facts.push({
      key: "cancel",
      label: "Cancelamento",
      value: `Grátis até ${FREE_CANCEL_WINDOW_HOURS}h antes do check-in`,
    });
  }

  return { summary: buildSummary(listing, { nearest, shuttle, count, avg, price, caps }), facts };
}

/** Primeira letra maiúscula, para o segmento que sobrar na frente virar início de frase. */
function upperFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function buildSummary(
  listing: ListingDetail,
  ctx: {
    nearest: TerminalDistance | null;
    shuttle: string | null;
    count: number;
    avg: number | null;
    price: number | null;
    caps: LocationCapabilities;
  },
): string {
  const parts: string[] = [];

  // Frase 1: o quê e onde. Fato da unidade, sempre vale.
  parts.push(`${listing.parking_type.name} no ${listing.company.name}, em ${listing.location.name}.`);

  // Frase 2: preço, proximidade e traslado. Cada pedaço pode faltar, inclusive o preço, então a
  // frase é montada por junção em vez de concatenação: sem isso, unidade sem preço abria com
  // vírgula solta ou minúscula.
  const s2 = [
    ctx.price != null ? `a partir de ${formatBRL(ctx.price)} por diária` : null,
    ctx.nearest?.distance_km != null
      ? `a ${formatDistance(ctx.nearest.distance_km)} de ${ctx.nearest.point_name}`
      : null,
    ctx.shuttle ? `com ${ctx.shuttle.toLowerCase()}` : null,
  ].filter((p): p is string => p != null);
  if (s2.length > 0) parts.push(`${upperFirst(s2.join(", "))}.`);

  // Frase 3: cancelamento e avaliação, as duas gateadas por capacidade lá em cima. Numa unidade
  // externa as duas somem e a frase inteira deixa de existir.
  const s3 = [
    ctx.caps.cancellation
      ? `Cancelamento grátis até ${FREE_CANCEL_WINDOW_HOURS}h antes do check-in`
      : null,
    ctx.count > 0 && ctx.avg != null
      ? `Nota ${formatRating(ctx.avg)} de 5 em ${ctx.count} ${ctx.count === 1 ? "avaliação" : "avaliações"}`
      : null,
  ].filter((p): p is string => p != null);
  if (s3.length > 0) parts.push(`${s3.join(". ")}.`);

  // Frase 4: de quem é a reserva. O card visível da unidade externa já diz isso; o schema tem
  // que dizer o mesmo, e para quem lê só o resumo (uma IA, por exemplo) é a informação que
  // decide se a pessoa vai cancelar com a Movepark ou com o estacionamento.
  if (!ctx.caps.hubCheckout) {
    parts.push(`A reserva é feita e administrada por ${listing.company.name}.`);
  }

  return parts.join(" ");
}
