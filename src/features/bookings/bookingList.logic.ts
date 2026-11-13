// Lista de reservas do painel (04/10/2026): forma de pagamento, canal, busca e o resumo do
// recorte. Lógica pura, testável sem React nem Supabase.

import { lastPayment } from "./payment.logic";

type PaymentLike = {
  status: string | null;
  created_at: string;
  method?: string | null;
  installments?: number | null;
  paid_at?: string | null;
  refunded_at?: string | null;
};

/** Filtro de forma de pagamento da lista. `none` = a reserva nunca teve tentativa de pagamento. */
export type PaymentMethodFilter = "pix" | "card" | "none";

/** Filtro de canal: agrupa os valores crus de `booking.origin`. */
export type ChannelFilter = "site" | "whatsapp" | "webchat" | "mcp" | "white_label" | "api";

export const CHANNEL_ORIGINS: Record<ChannelFilter, string[]> = {
  site: ["hub_search", "hub_destino", "hub_direct"],
  whatsapp: ["whatsapp-bot"],
  webchat: ["webchat-bot"],
  mcp: ["mcp"],
  white_label: ["white_label"],
  api: ["api"],
};

export const CHANNEL_LABEL: Record<ChannelFilter, string> = {
  site: "Site Movepark",
  whatsapp: "Mia no WhatsApp",
  webchat: "Assistente do site",
  mcp: "Mia pelo MCP",
  white_label: "White-label",
  api: "API de parceiro",
};

/** Rótulo curto do canal, para caber embaixo da data na tabela. Null quando não há origem. */
export function channelShortLabel(origin: string | null | undefined): string | null {
  if (!origin) return null;
  for (const [k, origins] of Object.entries(CHANNEL_ORIGINS)) {
    if (origins.includes(origin)) return CHANNEL_LABEL[k as ChannelFilter];
  }
  return origin;
}

/** O que a lista sabe da reserva do Hub para dizer se ela veio do site do próprio estacionamento. */
export type PartnerSiteInput = {
  origin: string | null;
  utm_source?: string | null;
  attribution?: unknown;
  commission_rule_id?: string | null;
  commission_channel?: string | null;
  company?: { name: string | null; slug?: string | null } | null;
};

/** Só letras e números, sem acento e em minúsculas: "Pare Seguro" e "pare-seguro" viram "pareseguro". */
function chaveDeNome(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function campoDoClique(attribution: unknown, campo: "utm_source" | "referrer"): string | null {
  if (!attribution || typeof attribution !== "object") return null;
  const v = (attribution as Record<string, unknown>)[campo];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Primeiro rótulo do domínio do referrer, sem "www." ("https://www.pareseguro.com.br/x" vira "pareseguro"). */
function nomeDoDominio(referrer: string): string | null {
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, "");
    return host.split(".")[0] || null;
  } catch {
    return null;
  }
}

/**
 * Venda do site da Movepark que chegou pelo site do próprio estacionamento (13/11/2026). A Pare
 * Seguro manda o cliente com `utm_source=pareseguro` e via "Site Movepark" em todas as reservas,
 * como se o site dela não vendesse nada. Devolve o rótulo do canal ou null quando não é o caso:
 *
 * 1. A reserva casou uma regra de comissão cadastrada (`commission_rule_id`): vale o nome da regra,
 *    que é o canal oficial da venda (comissao-por-origem.md).
 * 2. Senão, o `utm_source` (da reserva ou do clique guardado) ou o domínio do `referrer` é o nome ou
 *    o slug da empresa da unidade: "Site <empresa>". Só compara com a empresa da própria unidade, então
 *    um UTM escrito à mão não rotula reserva de outro estacionamento.
 */
export function partnerSiteLabel(b: PartnerSiteInput): string | null {
  if (!CHANNEL_ORIGINS.site.includes(b.origin ?? "")) return null;
  const regra = b.commission_channel?.trim();
  if (b.commission_rule_id && regra && regra !== "hub") return regra;

  const empresa = b.company?.name?.trim();
  if (!empresa) return null;
  const nomes = new Set(
    [empresa, b.company?.slug].filter((n): n is string => !!n).map(chaveDeNome),
  );
  nomes.delete("");
  const utm = b.utm_source?.trim() || campoDoClique(b.attribution, "utm_source");
  const referrer = campoDoClique(b.attribution, "referrer");
  const dominio = referrer ? nomeDoDominio(referrer) : null;
  const casa = [utm, dominio].some((v) => !!v && nomes.has(chaveDeNome(v)));
  return casa ? `Site ${empresa}` : null;
}

/**
 * Forma de pagamento da reserva, pelo pagamento mais recente (qualquer status: um cartão recusado
 * também diz como o cliente tentou pagar). Null quando a reserva nunca chegou a ter pagamento.
 * `long` é a versão da ficha da reserva ("Cartão de crédito em 3x").
 */
export function paymentMethodLabel(
  payments: PaymentLike[] | null | undefined,
  variant: "short" | "long" = "short",
): string | null {
  const p = lastPayment(payments);
  if (!p) return null;
  const parcelas = p.installments && p.installments > 1 ? p.installments : null;
  if (p.method === "pix") return "PIX";
  if (p.method === "card") {
    if (variant === "short") return parcelas ? `Cartão ${parcelas}x` : "Cartão";
    return parcelas ? `Cartão de crédito em ${parcelas}x` : "Cartão de crédito à vista";
  }
  return p.method ?? null;
}

/**
 * Texto da busca pronto para o `or()` do PostgREST. Vírgula, parênteses e curingas mudariam o
 * sentido do filtro (vírgula abre outra condição), então saem antes de montar a query.
 */
export function sanitizeBookingSearch(raw: string | null | undefined): string {
  return (raw ?? "").replace(/[,()*%\\:"]/g, " ").replace(/\s+/g, " ").trim();
}

/** Campos que a busca da lista percorre (código e o contato do snapshot da reserva, ADR-006). */
export function bookingSearchOr(term: string): string | null {
  const t = sanitizeBookingSearch(term);
  if (!t) return null;
  return ["code", "customer_name", "customer_email", "customer_phone"]
    .map((c) => `${c}.ilike.%${t}%`)
    .join(",");
}

export type BookingListSummary = {
  total: number;
  /** Pagas (inclui as que já foram estornadas ou estão estornando: o dinheiro entrou). */
  paid: number;
  /** Soma do valor das reservas pagas e não devolvidas. */
  paidAmount: number;
  awaiting: number;
  /** Expiradas sem pagar ou com pagamento recusado. */
  lost: number;
  pix: number;
  card: number;
};

/** Os números do recorte que está na tela. */
export function bookingListSummary(
  rows: { status: string; total_amount: number | string | null; payments?: PaymentLike[] | null }[],
): BookingListSummary {
  const s: BookingListSummary = { total: rows.length, paid: 0, paidAmount: 0, awaiting: 0, lost: 0, pix: 0, card: 0 };
  for (const b of rows) {
    const p = lastPayment(b.payments);
    const pago = p?.status === "paid" || p?.status === "refunded";
    if (pago) {
      s.paid += 1;
      if (p.method === "pix") s.pix += 1;
      if (p.method === "card") s.card += 1;
      if (p.status === "paid" && !p.refunded_at) s.paidAmount += Number(b.total_amount ?? 0);
    } else if (b.status === "pending") {
      s.awaiting += 1;
    } else if (b.status === "expired" || p?.status === "failed") {
      s.lost += 1;
    }
  }
  s.paidAmount = Math.round(s.paidAmount * 100) / 100;
  return s;
}
