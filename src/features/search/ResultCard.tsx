import { MapPin, Tag } from "@phosphor-icons/react";
import { formatDistance } from "@/lib/format";
import { parkingTitle } from "@/lib/parkingName";
import { stretchParamsToMinStay } from "./dates";
import { isTypeDescriptorAmenity } from "./amenities.logic";
import { ParkingCard, ParkingCardBadge, type ParkingCardAmenity } from "./ParkingCard";
import type { SearchResultItem } from "./useSearchResults";
import type { SearchBadge, SearchBadgeKind } from "./searchBadges";

/**
 * Card de resultado da busca. Representa UM `location_parking_type`, não uma unidade: uma unidade
 * com coberta e descoberta aparece em dois cards (decisão da reunião de 21/07, E2.1.3). O card é a
 * variação do produto, e é assim que Parkos e Parclick fazem.
 *
 * É um ADAPTADOR do card compartilhado `ParkingCard`: mapeia o `SearchResultItem` (link, favorito,
 * disponibilidade, badges comparativos) para as props do card único usado também na home e na
 * `/destinos`. Toda a estrutura/tokens visuais moram no `ParkingCard`.
 */
type Props = {
  item: SearchResultItem;
  isSaved: boolean;
  onToggleSave: () => void;
  searchParams: URLSearchParams;
  /** Fonte de entrada (E2.1.1) — vira `?src=` no link e a origem da reserva. */
  source?: "search" | "destino";
  /** Badges comparativos calculados sobre o conjunto de resultados (PRD-13). */
  badges?: SearchBadge[];
};

const AMENITY_LABEL: Record<string, string> = {
  shuttle_free: "Transfer grátis",
  cameras_24h: "Câmeras",
  on_site_24h: "24 horas",
  gated_access: "Portaria",
  pcd: "Acessível",
  ev_charger: "Carregador EV",
  cover_protection: "Capa proteção",
};

const AMENITY_PRIORITY = [
  "shuttle_free",
  "cover_protection",
  "ev_charger",
  "cameras_24h",
  "on_site_24h",
  "gated_access",
  "pcd",
];

/**
 * Amenidades exibidas no card. Os descritores de tipo (Coberto, Valet, Self-park, Moto) ficam de
 * fora: o card já É um tipo, então a badge ou repete o título ou o contradiz ("Coberto" num card
 * "Vaga Descoberta"). Ver `amenities.logic`.
 */
function topAmenities(codes: string[], n = 4): ParkingCardAmenity[] {
  const set = new Set(codes.filter((c) => !isTypeDescriptorAmenity(c)));
  const out: ParkingCardAmenity[] = [];
  for (const code of AMENITY_PRIORITY) {
    if (set.has(code) && AMENITY_LABEL[code]) out.push({ code, label: AMENITY_LABEL[code] });
    if (out.length >= n) break;
  }
  return out;
}

// Somente diferenciais comparativos vão pra imagem
const COMPARATIVE_KINDS = new Set<SearchBadgeKind>(["cheapest", "closest"]);
const BADGE_ICON: Partial<Record<SearchBadgeKind, typeof Tag>> = {
  cheapest: Tag,
  closest: MapPin,
};

export function ResultCard({ item, isSaved, onToggleSave, searchParams, source, badges = [] }: Props) {
  // O link precisa entregar o que o card prometeu: quando o preço veio da estadia mínima
  // (vitrine), a janela vai esticada, senão o cliente cai na página sem o preço que viu.
  const params = new URLSearchParams(stretchParamsToMinStay(searchParams, item.min_stay_days));
  if (source) params.set("src", source);

  const url = `/p/${item.operator.slug}/${item.location.slug}/${item.parking_type.code}?${params.toString()}`;

  const soldOut = item.availability?.sold_out ?? false;
  const nearCapacity = !soldOut && (item.availability?.near_capacity ?? false);
  const remaining = item.availability?.remaining;
  const nearMsg =
    nearCapacity && remaining != null && remaining > 0
      ? `Faltam ${remaining} vaga${remaining === 1 ? "" : "s"}`
      : (item.availability?.near_capacity_message ?? "Restam poucas vagas");
  // Sinal de demanda honesto (E3.6) — só quando não há já um badge de escassez pra não poluir o card.
  const highDemand = !soldOut && !nearCapacity && item.location.high_demand_today;

  // Diferenciais comparativos: vão sobre a imagem (só aparecem quando há variação real)
  const comparativeBadges = badges.filter((b) => COMPARATIVE_KINDS.has(b.kind));

  const amenities = topAmenities(item.amenities);
  const terminal = item.location.nearest_terminal;

  // Sobre a imagem (topo-esquerdo): esgotado tem prioridade; senão, os diferenciais comparativos.
  const overlay = soldOut ? (
    <span className="rounded-full bg-badge-cancelled-bg px-3 py-1 text-[12px] font-bold text-badge-cancelled-fg">
      Esgotado pro seu período
    </span>
  ) : comparativeBadges.length > 0 ? (
    comparativeBadges.map((badge) => (
      <ParkingCardBadge key={badge.kind} icon={BADGE_ICON[badge.kind]}>
        {badge.label}
      </ParkingCardBadge>
    ))
  ) : undefined;

  // Rodapé da imagem (baixo-esquerdo): escassez tem prioridade sobre alta demanda.
  const imageFooter =
    !soldOut && nearCapacity ? (
      <span className="rounded-full bg-badge-pending-bg px-3 py-1 text-[12px] font-bold text-badge-pending-fg">
        {nearMsg}
      </span>
    ) : highDemand ? (
      <span className="rounded-full bg-badge-active-bg px-3 py-1 text-[12px] font-bold text-badge-active-fg">
        Muito procurado hoje
      </span>
    ) : undefined;

  return (
    <ParkingCard
      testId="result-card"
      href={url}
      soldOut={soldOut}
      coverImage={item.location.cover_image}
      coverAlt={`${item.parking_type.name} em ${item.location.name}`}
      title={parkingTitle(item.operator.name, item.location.name)}
      parkingTypeName={item.parking_type.name}
      parkingTypeCode={item.parking_type.code}
      typeTestId="result-card-type"
      metaTestId="result-card-subline"
      metaIcon={terminal ? MapPin : undefined}
      // A unidade subiu para o título, então a subline fica com o que ela não diz: a que
      // terminal o lote atende e a que distância. Sem terminal a linha não existe.
      meta={
        terminal ? (
          <>
            {terminal.name} · {formatDistance(terminal.distance_km)}
          </>
        ) : undefined
      }
      rating={{ avg: item.location.review_avg, count: item.location.review_count }}
      amenities={amenities}
      amenitiesTestId="result-card-amenities"
      // Na vitrine o card mostra a diária, não o total da estadia mínima: a lista mistura
      // durações, e um total de 3 diárias ao lado de um de 2 faz o selo "Mais barato" cair no
      // número maior da tela. Com todos exibindo diária, a comparação bate com o que se vê. A
      // exigência vai no rótulo, que é condição do lote e não escolha nossa.
      price={{
        total: item.min_stay_days ? item.price.per_day : item.price.total,
        oldPrice: item.min_stay_days
          ? item.price.old_price != null
            ? Number((item.price.old_price / item.price.days).toFixed(2))
            : null
          : item.price.old_price,
        unit: item.min_stay_days
          ? `por diária · mínimo ${item.min_stay_days} ${item.min_stay_days === 1 ? "diária" : "diárias"}`
          : `${item.price.days} ${item.price.days === 1 ? "diária" : "diárias"}`,
      }}
      overlay={overlay}
      imageFooter={imageFooter}
      favorite={{ isSaved, onToggle: onToggleSave }}
    />
  );
}
