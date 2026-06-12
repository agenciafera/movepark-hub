import * as React from "react";
import { Link } from "react-router-dom";
import { Heart, Car, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBRL, formatDistance } from "@/lib/format";
import { RatingBadge } from "@/features/reviews/RatingStars";
import type { SearchResultItem } from "./useSearchResults";

type Props = {
  item: SearchResultItem;
  isSaved: boolean;
  onToggleSave: () => void;
  searchParams: URLSearchParams;
};

const amenityShortLabel: Record<string, string> = {
  shuttle_free: "Shuttle 24h",
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

function topAmenities(codes: string[], n = 3): string[] {
  const priority = [
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
  const set = new Set(codes);
  const out: string[] = [];
  for (const p of priority) {
    if (set.has(p) && amenityShortLabel[p]) out.push(amenityShortLabel[p]);
    if (out.length >= n) break;
  }
  return out;
}

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

export function ResultCard({ item, isSaved, onToggleSave, searchParams }: Props) {
  const url = `/p/${item.operator.slug}/${item.location.slug}/${item.parking_type.code}?${searchParams.toString()}`;
  const meta = topAmenities(item.amenities);
  const soldOut = item.availability?.sold_out ?? false;
  const nearCapacity = !soldOut && (item.availability?.near_capacity ?? false);
  const nearMsg = item.availability?.near_capacity_message ?? "Restam poucas vagas";

  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-md border border-hairline bg-canvas transition-shadow hover:shadow-tier",
        soldOut && "opacity-60",
      )}
    >
      {/* Foto placeholder */}
      <CardLink
        to={url}
        soldOut={soldOut}
        className="relative block aspect-[4/3] overflow-hidden bg-surface-soft"
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <Car className="h-14 w-14 text-muted-soft" />
        </div>
        {/* Hide foto placeholder — usar gradiente subtle de fundo */}
        <div className="absolute inset-0 bg-soft-gradient opacity-60" aria-hidden />
        {soldOut ? (
          <span className="absolute left-3 top-3 rounded-sm bg-badge-cancelled-bg px-2 py-0.5 text-caption font-bold text-badge-cancelled-fg shadow-tier">
            Esgotado pro seu período
          </span>
        ) : nearCapacity ? (
          <span className="absolute left-3 top-3 rounded-sm bg-badge-pending-bg px-2 py-0.5 text-caption font-bold text-badge-pending-fg shadow-tier">
            {nearMsg}
          </span>
        ) : null}
      </CardLink>

      {/* Heart */}
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
            isSaved
              ? "fill-mp-red stroke-mp-red"
              : "text-ink",
          )}
        />
      </button>

      <CardLink to={url} soldOut={soldOut} className="flex flex-col gap-1 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <h3 className="line-clamp-1 text-title-md text-ink">
              {item.parking_type.name} · {item.operator.name}
            </h3>
            <RatingBadge
              avg={item.location.review_avg}
              count={item.location.review_count}
              className="text-body-sm"
            />
            <p className="line-clamp-1 text-body-sm text-muted">
              {item.location.name}
              {item.location.distance_km != null && (
                <> · {formatDistance(item.location.distance_km)}</>
              )}
            </p>
            {item.location.nearest_terminal && (
              <p className="line-clamp-1 inline-flex items-center gap-1 text-body-sm font-medium text-ink">
                <MapPin className="h-3.5 w-3.5 text-mp-red" />
                mais perto do {item.location.nearest_terminal.name}
                <span className="font-normal text-muted">
                  · {formatDistance(item.location.nearest_terminal.distance_km)}
                </span>
              </p>
            )}
            {meta.length > 0 && (
              <p className="line-clamp-1 text-body-sm text-muted">
                {meta.join(" · ")}
              </p>
            )}
          </div>
          <div className="shrink-0 text-right">
            {item.price.old_price != null && item.price.old_price > item.price.total && (
              <div className="text-caption-sm text-muted line-through tabular-nums">
                {formatBRL(item.price.old_price)}
              </div>
            )}
            <div className="text-display-sm text-ink tabular-nums">
              {formatBRL(item.price.total)}
            </div>
            <div className="text-caption text-muted">
              {item.price.days} {item.price.days === 1 ? "diária" : "diárias"}
            </div>
          </div>
        </div>
      </CardLink>
    </article>
  );
}
