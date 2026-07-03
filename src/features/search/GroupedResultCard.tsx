import * as React from "react";
import { Link } from "react-router-dom";
import { Heart, Car, MapPin, Tag } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { formatBRL, formatDistance } from "@/lib/format";
import { RatingBadge } from "@/features/reviews/RatingStars";
import type { GroupedSearchResult } from "./useSearchResults";
import type { SearchBadge, SearchBadgeKind } from "./searchBadges";

type Props = {
  item: GroupedSearchResult;
  isSaved: boolean;
  onToggleSave: () => void;
  searchParams: URLSearchParams;
  source?: "search" | "destino";
  badges?: SearchBadge[];
};

const AMENITY_LABEL: Record<string, string> = {
  shuttle_free: "Traslado grátis",
  cameras_24h: "Câmeras",
  on_site_24h: "24 horas",
  gated_access: "Portaria",
  valet: "Valet",
  self_park: "Self-park",
  covered: "Coberto",
  motorcycle: "Vagas moto",
  pcd: "Acessível",
  ev_charger: "Carregador EV",
  cover_protection: "Capa proteção",
};

const AMENITY_PRIORITY = [
  "shuttle_free",
  "valet",
  "self_park",
  "covered",
  "cover_protection",
  "ev_charger",
  "cameras_24h",
  "on_site_24h",
  "gated_access",
  "pcd",
  "motorcycle",
];

function topAmenities(codes: string[], n = 4): { code: string; label: string }[] {
  const set = new Set(codes);
  const out: { code: string; label: string }[] = [];
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

function CardLink({
  to,
  soldOut,
  className,
  children,
}: {
  to: string;
  soldOut: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  if (soldOut) {
    return (
      <div className={className} aria-disabled="true">
        {children}
      </div>
    );
  }
  return (
    <Link to={to} className={className}>
      {children}
    </Link>
  );
}

export function GroupedResultCard({
  item,
  isSaved,
  onToggleSave,
  searchParams,
  source,
  badges = [],
}: Props) {
  const params = new URLSearchParams(searchParams);
  if (source) params.set("src", source);

  const url = `/p/${item.operator.slug}/${item.location.slug}/${item.cheapest_type.code}?${params.toString()}`;

  const soldOut = item.parking_types.every((pt) => pt.availability?.sold_out);
  const cheapest = item.cheapest_type;
  const nearCapacity = !soldOut && (cheapest.availability?.near_capacity ?? false);
  const nearMsg = cheapest.availability?.near_capacity_message ?? "Restam poucas vagas";

  // Diferenciais comparativos: vão sobre a imagem (só aparecem quando há variação real)
  const comparativeBadges = badges.filter((b) => COMPARATIVE_KINDS.has(b.kind));

  // Tipos de vaga: exibidos discretamente como texto no corpo do card
  const typeNames = item.parking_types.map((pt) => pt.name);

  // Amenidades: pills secundários no corpo
  const amenities = topAmenities(item.amenities);

  const showFromLabel = item.parking_types.length > 1;

  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border border-hairline bg-canvas transition-shadow hover:shadow-tier",
        soldOut && "opacity-60",
      )}
    >
      {/* Imagem */}
      <CardLink
        to={url}
        soldOut={soldOut}
        className="relative block aspect-[4/3] overflow-hidden bg-surface-soft"
      >
        {item.location.cover_image ? (
          <img
            src={item.location.cover_image}
            alt={item.location.name}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <>
            <div className="absolute inset-0 flex items-center justify-center">
              <Car className="h-14 w-14 text-muted-soft" />
            </div>
            <div className="absolute inset-0 bg-soft-gradient opacity-60" aria-hidden />
          </>
        )}

        {/* Diferenciais comparativos — só quando o card se destaca no conjunto */}
        {!soldOut && comparativeBadges.length > 0 && (
          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            {comparativeBadges.map((badge) => {
              const Icon = BADGE_ICON[badge.kind];
              return (
                <span
                  key={badge.kind}
                  className="inline-flex items-center gap-1.5 rounded-full bg-mp-primary px-3 py-1 text-[12px] font-semibold text-white shadow-sm backdrop-blur-sm"
                >
                  {Icon && <Icon className="h-3 w-3 shrink-0" aria-hidden />}
                  {badge.label}
                </span>
              );
            })}
          </div>
        )}

        {soldOut && (
          <span className="absolute left-3 top-3 rounded-full bg-badge-cancelled-bg px-3 py-1 text-[12px] font-bold text-badge-cancelled-fg">
            Esgotado pro seu período
          </span>
        )}

        {!soldOut && nearCapacity && (
          <span className="absolute bottom-3 left-3 rounded-full bg-badge-pending-bg px-3 py-1 text-[12px] font-bold text-badge-pending-fg">
            {nearMsg}
          </span>
        )}
      </CardLink>

      {/* Botão favorito */}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          onToggleSave();
        }}
        className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-canvas/95 backdrop-blur transition-transform hover:scale-105"
        aria-label={isSaved ? "Remover dos salvos" : "Salvar nos favoritos"}
      >
        <Heart
          className={cn(
            "h-4 w-4 transition-colors",
            isSaved ? "fill-mp-primary stroke-mp-primary" : "text-ink",
          )}
        />
      </button>

      {/* Corpo */}
      <CardLink to={url} soldOut={soldOut} className="flex flex-col gap-3 p-5">
        {/* Nome + localização + tipos de vaga (discretos) */}
        <div className="space-y-0.5">
          <h3 className="line-clamp-1 text-[18px] font-bold leading-snug text-ink">
            {item.operator.name}
          </h3>
          <p className="line-clamp-1 flex items-center gap-1 text-body-sm text-muted">
            {item.location.nearest_terminal && (
              <MapPin className="h-3 w-3 shrink-0 text-mp-primary" aria-hidden />
            )}
            <span>
              {item.location.name}
              {typeNames.length > 0 && <> · {typeNames.join(" · ")}</>}
              {item.location.nearest_terminal && (
                <> · {formatDistance(item.location.nearest_terminal.distance_km)}</>
              )}
            </span>
          </p>
          <RatingBadge
            avg={item.location.review_avg}
            count={item.location.review_count}
            className="text-body-sm"
          />
        </div>

        {/* Amenidades */}
        {amenities.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {amenities.map((a) => (
              <span
                key={a.code}
                className="rounded-full bg-surface-strong px-2.5 py-1 text-[12px] font-medium text-ink"
              >
                {a.label}
              </span>
            ))}
          </div>
        )}

        {/* Preço — sempre por último */}
        <div className="mt-auto pt-1">
          {cheapest.price.old_price != null && cheapest.price.old_price > item.min_price && (
            <div className="text-[13px] text-muted line-through tabular-nums">
              {formatBRL(cheapest.price.old_price)}
            </div>
          )}
          {showFromLabel && <div className="text-[12px] text-muted">a partir de</div>}
          <div className="text-[24px] font-bold leading-none text-ink tabular-nums">
            {formatBRL(item.min_price)}
          </div>
          <div className="mt-1 text-body-sm text-muted">
            {cheapest.price.days} {cheapest.price.days === 1 ? "diária" : "diárias"}
          </div>
        </div>
      </CardLink>
    </article>
  );
}
