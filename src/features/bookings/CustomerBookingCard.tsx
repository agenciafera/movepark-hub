import { Link } from "react-router-dom";
import { Car, MapPin } from "@/lib/icons";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatBRL, formatDateTime, formatDuration } from "@/lib/format";
import type { MyBookingListItem } from "./customerApi";

type Props = {
  item: MyBookingListItem;
};

export function CustomerBookingCard({ item }: Props) {
  return (
    <Link
      to={`/bookings/${item.code}`}
      className="flex flex-col gap-4 rounded-md border border-hairline bg-canvas p-5 no-underline transition-shadow hover:shadow-tier tablet:flex-row tablet:items-center"
    >
      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md bg-soft-gradient">
        <Car className="h-9 w-9 text-mp-indigo/60" />
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
          <MapPin className="mr-1 inline-block h-3.5 w-3.5 align-text-bottom" />
          {item.location.name}
        </p>
        <p className="text-body-sm text-muted tabular-nums">
          {formatDateTime(item.check_in_at)} → {formatDateTime(item.check_out_at)}
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
