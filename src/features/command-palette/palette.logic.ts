import type { SearchHit } from "./api";
import type { Section } from "@/components/shared/nav-items";

export type PaletteVariant = "manager" | "operator";

/**
 * Para onde cada resultado leva, por painel.
 *
 * Devolve `null` quando o painel não tem rota para aquele tipo, e nesse caso a
 * palette esconde o resultado em vez de oferecer um link morto. É o caso do
 * cupom no manager: o hub_admin enxerga cupom de todas as empresas, mas
 * `/manager` não tem tela de cupom.
 *
 * Reserva cai na listagem com a busca pré-preenchida (`?q=`), porque não existe
 * rota de detalhe de reserva no painel. Unidade no manager precisa do
 * `company_id`, já que a rota é aninhada na empresa.
 */
export function hitUrl(hit: SearchHit, variant: PaletteVariant): string | null {
  if (hit.kind === "booking") {
    return `/${variant}/bookings?q=${encodeURIComponent(hit.title)}`;
  }

  if (hit.kind === "location") {
    if (variant === "operator") return "/operator/locations";
    return hit.company_id ? `/manager/companies/${hit.company_id}/locations` : null;
  }

  if (hit.kind === "coupon") {
    return variant === "operator" ? "/operator/coupons" : null;
  }

  return null;
}

const KIND_LABEL: Record<SearchHit["kind"], string> = {
  booking: "Reservas",
  location: "Unidades",
  coupon: "Cupons",
};

export function kindLabel(kind: SearchHit["kind"]): string {
  return KIND_LABEL[kind];
}

/** Só os resultados que o painel atual sabe abrir, agrupados por tipo e na ordem fixa. */
export function groupHits(hits: SearchHit[], variant: PaletteVariant) {
  const ordem: SearchHit["kind"][] = ["booking", "location", "coupon"];

  return ordem
    .map((kind) => ({
      kind,
      label: kindLabel(kind),
      hits: hits
        .filter((h) => h.kind === kind)
        .map((h) => ({ hit: h, url: hitUrl(h, variant) }))
        .filter((r): r is { hit: SearchHit; url: string } => r.url !== null),
    }))
    .filter((g) => g.hits.length > 0);
}

/** Achata as seções da sidebar em comandos de navegação da palette. */
export function navCommands(sections: Section[]) {
  return sections.flatMap((section) =>
    section.items.map((item) => ({
      to: item.to,
      label: item.label,
      // O título da seção entra como contexto: "Preços" e "Planos de
      // cancelamento" só se distinguem sabendo de que grupo vieram.
      group: section.title ?? "Painel",
      icon: item.icon,
    })),
  );
}
