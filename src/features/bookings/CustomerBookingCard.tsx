import { Link } from "react-router-dom";
import { Car, MapPin } from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import {
  formatBRL,
  formatDayTime,
  formatDuration,
  formatRelativeDay,
} from "@/lib/format";
import type { MyBookingListItem } from "./customerApi";

type Props = {
  item: MyBookingListItem;
};

export function CustomerBookingCard({ item }: Props) {
  const relative = formatRelativeDay(item.check_in_at);

  return (
    <Link
      to={`/bookings/${item.code}`}
      className="flex flex-col gap-4 rounded-md border border-hairline bg-canvas p-5 no-underline transition-shadow duration-base ease-standard hover:shadow-tier tablet:flex-row tablet:items-center"
    >
      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md bg-soft-gradient">
        <Car className="h-9 w-9 text-mp-indigo/60" aria-hidden="true" />
      </div>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-title-md text-ink">
            {item.parking_type?.name ?? "Vaga"} ·{" "}
            {item.location.company.name}
          </h3>
          <StatusBadge status={item.status} />
        </div>
        <p className="line-clamp-1 text-body-sm text-muted">
          <MapPin className="mr-1 inline-block h-3.5 w-3.5 align-text-bottom" aria-hidden="true" />
          {item.location.name}
        </p>
        {/* Entrada em destaque (ink) — é o que o viajante procura; saída recua (muted).
            A pista relativa ("amanhã", "em 3 dias") dá o "quando" num relance. */}
        <p className="text-body-sm tabular-nums">
          <span className="font-medium text-ink">{formatDayTime(item.check_in_at)}</span>
          <span className="text-muted"> → {formatDayTime(item.check_out_at)}</span>
          {relative && <span className="text-muted"> · {relative}</span>}
        </p>
        <p className="text-caption-sm text-muted-soft">
          {formatDuration(item.check_in_at, item.check_out_at)} · Código{" "}
          <span className="font-mono">{item.code}</span>
        </p>
      </div>

      <div className="shrink-0 text-right">
        <div className="text-display-sm text-ink tabular-nums">
          {formatBRL(item.total_amount)}
        </div>
      </div>
    </Link>
  );
}
