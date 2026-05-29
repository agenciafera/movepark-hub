import * as React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { DateRangeField } from "@/features/search/DateRangeField";
import { useAuth } from "@/auth/context";
import { formatBRL, formatDuration } from "@/lib/format";
import {
  useSimulatePrice,
  useDebounced,
  useCreateBooking,
  type ListingDetail,
} from "./api";

type Props = {
  listing: ListingDetail;
  initialFrom: Date | null;
  initialTo: Date | null;
};

function daysBetween(a: Date | null, b: Date | null): number {
  if (!a || !b || b <= a) return 0;
  const ms = b.getTime() - a.getTime();
  return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

export function ReservationCard({ listing, initialFrom, initialTo }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, effectiveRole } = useAuth();
  const createBooking = useCreateBooking();

  const [from, setFrom] = React.useState<Date | null>(initialFrom);
  const [to, setTo] = React.useState<Date | null>(initialTo);
  const [passengers, setPassengers] = React.useState<number>(1);
  const [hasPcd, setHasPcd] = React.useState<boolean>(false);

  const days = daysBetween(from, to);
  const debouncedDays = useDebounced(days, 300);
  const debouncedFrom = useDebounced(from, 300);
  const debouncedTo = useDebounced(to, 300);

  const sim = useSimulatePrice({
    companySlug: listing.company.slug,
    locationSlug: listing.location.slug,
    parkingTypeCode: listing.parking_type.code,
    days: debouncedDays,
  });

  // Recalcula stale flag — pricing está sendo recarregado pra novos valores
  const pricingStale = sim.isFetching && (from !== debouncedFrom || to !== debouncedTo);

  const canReserve = !!from && !!to && days > 0 && sim.data?.price != null && !sim.isFetching;

  async function handleReserve() {
    if (!from || !to) return;
    if (!session) {
      const next = encodeURIComponent(location.pathname + location.search);
      navigate(`/login?next=${next}`);
      return;
    }
    if (effectiveRole !== "customer") {
      toast.error("Faça login com uma conta de cliente pra reservar.");
      return;
    }
    try {
      const result = await createBooking.mutateAsync({
        location_parking_type_id: listing.id,
        check_in_at: from.toISOString(),
        check_out_at: to.toISOString(),
        passenger_count: listing.location.has_passenger_quantity ? passengers : null,
        has_pcd: listing.location.has_pcd_config ? hasPcd : false,
        origin: "listing",
      });
      navigate(`/checkout/${result.code}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao criar reserva");
    }
  }

  return (
    <div className="rounded-md border border-hairline bg-canvas p-6 shadow-tier">
      {/* Preço */}
      <div className="space-y-1">
        {sim.data?.old_price != null && sim.data.old_price > (sim.data.price ?? 0) && (
          <div className="text-body-sm text-muted line-through tabular-nums">
            {formatBRL(sim.data.old_price)}
          </div>
        )}
        {sim.isLoading || pricingStale ? (
          <Skeleton className="h-9 w-32" />
        ) : sim.data?.price != null ? (
          <div className="text-display-md text-ink tabular-nums">
            {formatBRL(sim.data.price)}
          </div>
        ) : (
          <div className="text-display-sm text-ink">
            A partir de {formatBRL(listing.company_parking_type.base_price)}
          </div>
        )}
        <div className="text-body-sm text-muted">
          {days > 0 ? `${days} ${days === 1 ? "diária" : "diárias"}` : "Escolha as datas"}
          {from && to ? ` · ${formatDuration(from, to)}` : ""}
        </div>
      </div>

      <div className="my-4 h-px bg-hairline" />

      {/* Datas */}
      <div className="rounded-md border border-hairline">
        <div className="grid grid-cols-2 divide-x divide-hairline">
          <DateRangeField mode="check-in" date={from} onChange={setFrom} />
          <DateRangeField
            mode="check-out"
            date={to}
            onChange={setTo}
            minDate={from ?? undefined}
          />
        </div>
      </div>

      {/* Passageiros */}
      {listing.location.has_passenger_quantity && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <Label htmlFor="pax">Passageiros</Label>
          <Input
            id="pax"
            type="number"
            min={1}
            max={9}
            value={passengers}
            onChange={(e) => setPassengers(Math.max(1, Number(e.target.value || 1)))}
            className="h-10 w-20 text-center tabular-nums"
          />
        </div>
      )}

      {/* PCD */}
      {listing.location.has_pcd_config && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <Label htmlFor="pcd">Vaga acessível PCD</Label>
          <Switch checked={hasPcd} onCheckedChange={setHasPcd} />
        </div>
      )}

      {/* Erro do simulate_price */}
      {sim.data?.error && (
        <div className="mt-4 rounded-sm border border-error bg-badge-cancelled-bg p-2 text-caption text-error">
          {sim.data.error}
        </div>
      )}

      {/* Botão Reservar */}
      <Button
        className="mt-5 w-full"
        size="default"
        onClick={handleReserve}
        disabled={!canReserve || createBooking.isPending}
      >
        {createBooking.isPending
          ? "Reservando…"
          : !from || !to
            ? "Escolher datas"
            : "Reservar agora"}
      </Button>

      <p className="mt-3 flex items-center justify-center gap-1.5 text-caption text-muted">
        <ShieldCheck className="h-3.5 w-3.5" />
        Cancelamento grátis até 24h antes
      </p>
    </div>
  );
}
